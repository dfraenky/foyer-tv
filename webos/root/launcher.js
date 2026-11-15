/*
 * Foyer as the home screen of a rooted LG TV (webosbrew's Homebrew Channel), started at boot by
 * /var/lib/webosbrew/init.d/60-foyer. Watches the app in front and the TV's power: when an app closes, when LG's
 * home comes up, and when the TV turns on to Live TV, Foyer opens instead. LG's home stays when it was opened
 * from Foyer (its "LG Home" in the drawer), and an HDMI input the TV woke up on stays (a console that turned it
 * on). The Home key itself goes to Foyer through LG Input Hook, when installed.
 * Plain ES5: webOS 6 ships Node 8, older ones older.
 * It also uninstalls apps for Foyer (an app's menu: hold OK), which the TV denies the page: on 127.0.0.1:7172,
 * only for installed apps' pages (origin file:// or none, never a website's), never LG's own apps or the Homebrew Channel.
 * And it hands values from a phone to the page (a key that's hard to type, OK held on Seerr's or TMDB's row): a one-time
 * page on the TV's own address in the home network, at a random port and path, for 5 minutes and one answer, shown as a
 * QR code (qr.js).
 * Off: touch /var/lib/foyer/off (the boot hook then starts nothing). Removed with install.py --root --no-launcher.
 */
var spawn = require('child_process').spawn;
var fs = require('fs');
var http = require('http');
var crypto = require('crypto');
var os = require('os');
var qr = require('./qr.js');

var APP = process.argv[2] || 'io.foyertv';
var HOME = 'com.webos.app.home';
var LIVE_TV = 'com.webos.app.livetv';
var LOG = '/tmp/foyer-launcher.log';
// LG's own pieces that come and go in front on their own: not an app someone closed.
var SYSTEM = /^com\.webos\.app\.(home|livetv|hdmi\d|externalinput|inputcommon|membership)/;

var last = '';        // the last app in front, other than nothing
var now = '';         // the app in front now ('' for nothing)
var episode = 0;      // when an app closed and we started bringing Foyer back
var tries = 0;
var on = true;        // the TV is on (not in standby)
var wokeAt = 0;

function log(text) {
  try { fs.appendFileSync(LOG, new Date().toISOString() + ' ' + text + '\n'); } catch (e) {}
}

/** closed: the app that just closed, for the page (back from a trailer in YouTube: its info card again). */
function launch(why, closed) {
  log('open ' + APP + ' (' + why + ')');
  var message = {id: APP};
  if (closed) message.params = {closed: closed};
  spawn('luna-send', ['-n', '1', 'luna://com.webos.applicationManager/launch', JSON.stringify(message)],
    {stdio: 'ignore'}).on('error', function () {});
}

/** One more try at bringing Foyer back after an app closed: a few at most, never a loop. */
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
    // An app closed: Foyer at once, before LG's home comes up. A moment later, so a TV turning off (which
    // closes the app first) says so before.
    setTimeout(function () {
      if (now === '' && on && retry()) launch('after ' + before, before);
    }, 300);
  } else if (id === HOME) {
    // LG's home, after an app closed, the Home key without Input Hook, or still coming up over Foyer a moment
    // after we opened it (not someone choosing LG Home: that's from Foyer, without an app closing just before).
    var closed = before !== APP && before !== HOME;
    if (closed || (before === APP && Date.now() - episode < 10000)) {
      setTimeout(function () {
        if (now === HOME && retry()) launch(closed ? 'after ' + (before || 'start') : 'again, LG home came up over it', closed ? before : '');
      }, 400);
    }
  }
}

/** The TV is waking up on LG's home or Live TV: Foyer right away, once. */
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
  // Turned on. Usually front() saw LG's home or Live TV already and opened Foyer. Otherwise the TV opens its
  // last input a moment later: Live TV (or nothing, or LG's home) becomes Foyer; an HDMI input stays, since a
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
var KEEP = /^(com\.webos\.|com\.lge\.|com\.palm\.|org\.webosbrew\.|io\.foyer)/;

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

/** done(installed, removable): LG's built-in apps say removable false, and remove then only pretends. */
function installed(id, done) {
  luna('luna://com.webos.applicationManager/getAppInfo', {id: id}, function (reply) {
    done(/"returnValue"\s*:\s*true/.test(reply), !/"removable"\s*:\s*false/.test(reply));
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
  installed(id, function (there, removable) {
    if (!there) { done(false, 'not installed'); return; }
    if (!removable) { done(false, 'built into the TV'); return; }
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

// MARK: - Handing values over from a phone

var handoff = null;   // {server, token, fields, texts, lang, values, until}

/** The TV's address in the home network: a private IPv4 (never a VPN's or a public one). */
function homeAddress() {
  var all = os.networkInterfaces(), best = '';
  for (var name in all) {
    if (!all.hasOwnProperty(name) || /^(tun|tap|wg|ppp)/.test(name)) continue;
    for (var i = 0; i < all[name].length; i++) {
      var a = all[name][i];
      if (a.family !== 'IPv4' || a.internal) continue;
      if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address)) best = best || a.address;
    }
  }
  return best;
}

function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }

/** Closes a hand-off's page (it stays known until the values were picked up). */
function closePage(h) {
  if (!h || !h.server) return;
  try { h.server.close(); } catch (e) {}
  clearTimeout(h.timer);
  h.server = null;
}
function stopHandoff() { closePage(handoff); }

function phonePage(body) {
  return '<!doctype html><html lang="' + esc(handoff.lang) + '"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1"><title>Foyer</title><style>'
    + 'body{font-family:-apple-system,system-ui,sans-serif;background:#16161A;color:#fff;margin:0;padding:28px 20px}'
    + 'h1{font-size:24px;margin:0 0 18px}label{display:block;font-size:15px;color:#bbb;margin:16px 0 6px}'
    + 'input{width:100%;box-sizing:border-box;font:16px ui-monospace,Menlo,monospace;padding:12px;border-radius:10px;border:0}'
    + 'button{margin-top:24px;width:100%;font-size:18px;font-weight:600;padding:14px;border:0;border-radius:12px;background:#fff;color:#111}'
    + 'p{color:#bbb;font-size:15px;line-height:1.4}</style></head><body>' + body + '</body></html>';
}

/** The page on the phone: the form, and once sent, a thank-you; then the page is gone. */
function phone(req, res) {
  function send(code, html) { res.writeHead(code, {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store'}); res.end(html); }
  if (!handoff || !handoff.server || req.url !== '/' + handoff.token) { send(404, 'Not found'); return; }
  if (req.method === 'GET') {
    var form = '<h1>' + esc(handoff.title) + '</h1><form method="post" action="/' + handoff.token + '">';
    for (var i = 0; i < handoff.fields.length; i++) {
      var f = handoff.fields[i];
      form += '<label for="f' + i + '">' + esc(f.label) + '</label><input id="f' + i + '" name="' + esc(f.name) + '" value="' + esc(f.value || '')
        + '" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false">';
    }
    send(200, phonePage(form + '<button type="submit">' + esc(handoff.texts.send) + '</button></form><p>' + esc(handoff.texts.hint) + '</p>'));
    return;
  }
  if (req.method !== 'POST') { send(405, 'No'); return; }
  var body = '';
  req.on('data', function (c) { body += c; if (body.length > 8192) req.destroy(); });
  req.on('end', function () {
    var values = {}, parts = body.split('&');
    for (var k = 0; k < parts.length; k++) {
      var kv = parts[k].split('='), name = decodeURIComponent((kv[0] || '').replace(/\+/g, ' '));
      var value = decodeURIComponent((kv.slice(1).join('=') || '').replace(/\+/g, ' ')).trim().slice(0, 1024);
      for (var j = 0; j < handoff.fields.length; j++) if (handoff.fields[j].name === name) values[name] = value;
    }
    handoff.values = values;
    log('handoff: values from the phone');
    send(200, phonePage('<h1>' + esc(handoff.texts.done) + '</h1>'));
    var h = handoff;
    setTimeout(function () { closePage(h); }, 500);   // after the answer went out
  });
}

/** Starts a hand-off: {title, fields: [{name, label, value}], texts: {send, done, hint}, lang}. done(url or ''). */
function startHandoff(spec, done) {
  stopHandoff();
  var ip = homeAddress();
  if (!ip) { done(''); return; }
  handoff = {token: crypto.randomBytes(16).toString('hex'), title: String(spec.title || 'Foyer'), fields: (spec.fields || []).slice(0, 4),
    texts: spec.texts || {}, lang: String(spec.lang || 'en'), values: null};
  handoff.server = http.createServer(phone);
  handoff.server.on('error', function (e) { log('handoff: ' + e.message); done(''); });
  handoff.server.listen(0, ip, function () {
    handoff.timer = setTimeout(stopHandoff, 5 * 60000);   // 5 minutes at most
    var url = 'http://' + ip + ':' + handoff.server.address().port + '/' + handoff.token;
    log('handoff: page open for 5 minutes');
    done(url);
  });
}

http.createServer(function (req, res) {
  var origin = req.headers.origin || '';
  function answer(code, text, type) {
    res.writeHead(code, {'Content-Type': type || 'text/plain', 'Access-Control-Allow-Origin': origin || '*'});
    res.end(text);
  }
  // A website in LG's browser sends its http(s) origin (always on a POST); an installed app's page sends file://, or on
  // webOS 6 none at all (its pages run without the browser's same-origin rules).
  if (origin && !/^file:\/\//.test(origin)) { log('refused a request from ' + origin); answer(403, 'no'); return; }
  if (req.method === 'GET' && req.url === '/v1/') { answer(200, 'ok'); return; }
  if (req.url === '/v1/handoff') {
    if (req.method === 'GET') {
      // The page asks once a second: the values once (then the hand-off is over), else whether it's still open.
      var state = !handoff ? 'none' : handoff.values ? 'done' : handoff.server ? 'waiting' : 'expired';
      var reply = {state: state, values: state === 'done' ? handoff.values : null};
      if (state === 'done') { closePage(handoff); handoff = null; }
      answer(200, JSON.stringify(reply), 'application/json');
      return;
    }
    if (req.method === 'POST') {
      var spec = '';
      req.on('data', function (c) { spec += c; if (spec.length > 8192) req.destroy(); });
      req.on('end', function () {
        try { spec = JSON.parse(spec); } catch (e) { answer(400, 'no'); return; }
        if (spec.stop) { stopHandoff(); handoff = null; answer(200, '{}', 'application/json'); return; }
        startHandoff(spec, function (url) {
          answer(url ? 200 : 500, JSON.stringify({url: url, svg: url ? qr.svg(url) : ''}), 'application/json');
        });
      });
      return;
    }
  }
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
