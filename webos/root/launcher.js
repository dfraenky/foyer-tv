/*
 * Free My TV as the home screen of a rooted LG TV (webosbrew's Homebrew Channel), started at boot by
 * /var/lib/webosbrew/init.d/60-freemytv. Watches the app in front and the TV's power: when an app closes, when LG's
 * home comes up, and when the TV turns on to Live TV, Free My TV opens instead. LG's home stays when it was opened
 * from Free My TV (its "LG Home" in the drawer), and an HDMI input the TV woke up on stays (a console that turned it
 * on). The Home key itself goes to Free My TV through LG Input Hook, when installed.
 * Plain ES5: webOS 6 ships Node 8, older ones older.
 * Off: touch /var/lib/freemytv/off (the boot hook then starts nothing). Removed with install.py --root --no-launcher.
 */
var spawn = require('child_process').spawn;
var fs = require('fs');

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

log('watching for ' + APP);
follow('luna://com.webos.service.tvpower/power/getPowerState', /"state"\s*:\s*"([^"]*)"/g, power);
follow('luna://com.webos.applicationManager/getForegroundAppInfo', /"appId"\s*:\s*"([^"]*)"/g, front);
