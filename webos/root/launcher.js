/*
 * Free My TV as the home screen of a rooted LG TV (webosbrew's Homebrew Channel), started at boot by
 * /var/lib/webosbrew/init.d/60-freemytv. Watches the app in front and the TV's power: when an app closes, when LG's
 * home comes up, and when the TV turns on to Live TV, Free My TV opens instead. LG's home stays when it was opened
 * from Free My TV (its "LG Home" in the drawer), and an HDMI input the TV woke up on stays (a console that turned it
 * on). The Home key itself goes to Free My TV through LG Input Hook, when installed.
 * Plain ES5: webOS 6 ships Node 8, older ones older.
 * It also uninstalls apps for Free My TV (an app's menu: hold OK), which the TV denies the page: on 127.0.0.1:7172,
 * only for installed apps' pages (origin file:// or none, never a website's), never LG's own apps or the Homebrew Channel.
 * Off: touch /var/lib/freemytv/off (the boot hook then starts nothing). Removed with install.py --root --no-launcher.
 */
var spawn = require('child_process').spawn;
var fs = require('fs');
var http = require('http');

var APP = process.argv[2] || 'io.freemytv';
var HOME = 'com.webos.app.home';
var LIVE_TV = 'com.webos.app.livetv';
var LOG = '/tmp/freemytv-launcher.log';
// LG's own pieces that come and go in front on their own: not an app someone closed.
var SYSTEM = /^com\.webos\.app\.(home|livetv|hdmi\d|externalinput|inputcommon|membership)/;

var last = '';        // the last app in front, other than nothing
var now = '';         // the app in front now ('' for nothing)
var episode = 0;      // when an app closed and we started bringing Free My TV back
var tries = 0;
var on = true;        // the TV is on (not in standby)
var wokeAt = 0;

function log(text) {
  try { fs.appendFileSync(LOG, new Date().toISOString() + ' ' + text + '\n'); } catch (e) {}
}

function launch(why) {
  log('open ' + APP + ' (' + why + ')');
  spawn('luna-send', ['-n', '1', 'luna://com.webos.applicationManager/launch', JSON.stringify({id: APP})],
    {stdio: 'ignore'}).on('error', function () {});
}

/** One more try at bringing Free My TV back after an app closed: a few at most, never a loop. */
function retry() {
  if (Date.now() - episode > 10000) { episode = Date.now(); tries = 0; }
  return tries++ < 6;
}

function front(id) {
  if (id !== now) log('front: ' + (id || '(none)'));
  var before = last;
  now = id;
  if (id) last = id;
  if (!on) {
    // Waking up: LG's home or Live TV comes up seconds before the power state says Active, so this is the earliest
    // sign. Turning off only ever shows nothing in front.
    if (id !== HOME && id !== LIVE_TV) return;
    if (Date.now() - wokeAt > 10000) wake('TV turning on, ' + id);
    else if (before === APP) {
      setTimeout(function () {
        if (now === id && retry()) launch('again, ' + id + ' came up over it');
      }, 400);
    }
    return;
  }
  if (id === '' && before && before !== APP && !SYSTEM.test(before) && Date.now() - wokeAt > 6000) {
    // An app closed: Free My TV at once, before LG's home comes up. A moment later, so a TV turning off (which
    // closes the app first) says so before.
    setTimeout(function () {
      if (now === '' && on && retry()) launch('after ' + before);
    }, 300);
  } else if (id === HOME) {
    // LG's home, after an app closed, the Home key without Input Hook, or still coming up over Free My TV a moment
    // after we opened it (not someone choosing LG Home: that's from Free My TV, without an app closing just before).
    var closed = before !== APP && before !== HOME;
    if (closed || (before === APP && Date.now() - episode < 10000)) {
      setTimeout(function () {
        if (now === HOME && retry()) launch(closed ? 'after ' + (before || 'start') : 'again, LG home came up over it');
      }, 400);
    }
  }
}

/** The TV is waking up on LG's home or Live TV: Free My TV right away, once. */
function wake(why) {
  if (Date.now() - wokeAt < 10000) return;
  wokeAt = episode = Date.now();
  tries = 0;
  retry();
  launch(why);
}

function power(state) {
  // Off is standby (Active Standby, Suspend...). Screen Saver or Screen Off are still on: someone may close an app.
  var active = !/Standby|Suspend|Power ?Off/i.test(state);
  if (active === on) return;
  on = active;
  log('power: ' + state);
  if (!on) return;
  // Turned on. Usually front() saw LG's home or Live TV already and opened Free My TV. Otherwise the TV opens its
  // last input a moment later: Live TV (or nothing, or LG's home) becomes Free My TV; an HDMI input stays, since a
  // console or player may have turned the TV on for itself.
  if (now === HOME || now === LIVE_TV) return wake('TV turned on');
  setTimeout(function () {
    if (on && (now === '' || now === LIVE_TV || now === HOME)) wake('TV turned on');
  }, 1500);
}

/** Follows a Luna subscription: each reply's first match of `re` goes to `each`. Starts again if it ends. */
function follow(uri, re, each) {
  var child = spawn('luna-send', ['-i', uri, '{"subscribe":true}']);
  var rest = '';
  child.stdout.on('data', function (chunk) {
    rest += chunk;
    // One reply per JSON object, on one line or pretty-printed over several.
    var m, end = 0;
    re.lastIndex = 0;
    while ((m = re.exec(rest))) { each(m[1]); end = re.lastIndex; }
    rest = rest.slice(end);
    if (rest.length > 4096) rest = '';
  });
  child.on('error', function (e) { log('luna-send: ' + e.message); });
  child.on('exit', function () {
    log(uri + ' ended, again in 5 s');
    setTimeout(function () { follow(uri, re, each); }, 5000);
  });
}

// MARK: - Uninstalling, for the page

var PORT = 7172;
var KEEP = /^(com\.webos\.|com\.lge\.|com\.palm\.|org\.webosbrew\.|io\.freemytv)/;

/** One Luna call as root; done(reply text or ''). -i, not -n 1: that prints nothing without a terminal. */
function luna(uri, params, done) {
  var child = spawn('luna-send', ['-i', uri, JSON.stringify(params)]), text = '', finished = false;
  function finish() {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    try { child.kill(); } catch (e) {}
    done(text);
  }
  var timer = setTimeout(finish, 20000);
  child.stdout.on('data', function (chunk) { text += chunk; if (/"returnValue"/.test(text)) setTimeout(finish, 100); });
  child.on('error', finish);
  child.on('exit', finish);
}

function installed(id, done) {
  luna('luna://com.webos.applicationManager/getAppInfo', {id: id}, function (reply) {
    done(/"returnValue"\s*:\s*true/.test(reply));
  });
}

/** Whether `id` is gone within `ms`, asking once a second (removing takes the TV a few seconds). */
function gone(id, ms, done) {
  var until = Date.now() + ms;
  (function check() {
    installed(id, function (still) {
      if (!still) done(true);
      else if (Date.now() > until) done(false);
      else setTimeout(check, 1000);
    });
  })();
}

/** done(ok, what happened). remove only takes the job: it says yes even for an app that isn't there. */
function uninstall(id, done) {
  installed(id, function (there) {
    if (!there) { done(false, 'not installed'); return; }
    luna('luna://com.webos.appInstallService/remove', {id: id, subscribe: false}, function (reply) {
      gone(id, 20000, function (ok) {
        if (ok) { done(true, reply); return; }
        // Apps installed in Developer Mode (or by Homebrew Channel) go through dev/remove.
        luna('luna://com.webos.appInstallService/dev/remove', {id: id}, function (reply2) {
          gone(id, 20000, function (ok2) { done(ok2, reply + ' / ' + reply2); });
        });
      });
    });
  });
}

http.createServer(function (req, res) {
  var origin = req.headers.origin || '';
  function answer(code, text) {
    res.writeHead(code, {'Content-Type': 'text/plain', 'Access-Control-Allow-Origin': origin || '*'});
    res.end(text);
  }
  // A website in LG's browser sends its http(s) origin (always on a POST); an installed app's page sends file://, or on
  // webOS 6 none at all (its pages run without the browser's same-origin rules).
  if (origin && !/^file:\/\//.test(origin)) { log('refused a request from ' + origin); answer(403, 'no'); return; }
  if (req.method === 'GET' && req.url === '/v1/') { answer(200, 'ok'); return; }
  if (req.method !== 'POST' || req.url !== '/v1/uninstall') { answer(404, 'no'); return; }
  var body = '';
  req.on('data', function (c) { body += c; if (body.length > 1000) req.destroy(); });
  req.on('end', function () {
    var id = '';
    try { id = String(JSON.parse(body).id || ''); } catch (e) {}
    if (!/^[\w.\-]+$/.test(id) || KEEP.test(id)) { log('not uninstalling ' + id); answer(400, 'no'); return; }
    log('uninstalling ' + id + ' (' + origin + ')');
    uninstall(id, function (ok, reply) {
      log((ok ? 'uninstalled ' : 'could not uninstall ') + id + ': ' + reply.replace(/\s+/g, ' ').slice(0, 300));
      answer(ok ? 200 : 500, ok ? 'ok' : 'no');
    });
  });
}).on('error', function (e) { log('uninstall server: ' + e.message); }).listen(PORT, '127.0.0.1');

log('watching for ' + APP);
follow('luna://com.webos.service.tvpower/power/getPowerState', /"state"\s*:\s*"([^"]*)"/g, power);
follow('luna://com.webos.applicationManager/getForegroundAppInfo', /"appId"\s*:\s*"([^"]*)"/g, front);
