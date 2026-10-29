/*
 * Free My TV as the home screen of a rooted LG TV (webosbrew's Homebrew Channel), started at boot by
 * /var/lib/webosbrew/init.d/60-freemytv. Watches the app in front: when LG's home comes up (an app was closed, the
 * TV started, or the Home key got through), Free My TV opens instead. LG's home stays when it was opened from Free
 * My TV, its "LG Home" in the drawer. The Home key itself goes to Free My TV through LG Input Hook, when installed.
 * Plain ES5: webOS 6 ships Node 8, older ones older.
 * Off: touch /var/lib/freemytv/off (the boot hook then starts nothing). Removed with install.py --root --no-launcher.
 */
var spawn = require('child_process').spawn;
var fs = require('fs');

var APP = process.argv[2] || 'io.freemytv';
var HOME = 'com.webos.app.home';
var LOG = '/tmp/freemytv-launcher.log';

var last = '';        // the last app in front, other than nothing
var now = '';         // the app in front now ('' for nothing)
var episode = 0;      // when an app closed onto LG's home and we started bringing Free My TV back
var tries = 0;

function log(text) {
  try { fs.appendFileSync(LOG, new Date().toISOString() + ' ' + text + '\n'); } catch (e) {}
}

function launch(why) {
  log('open ' + APP + ' (' + why + ')');
  spawn('luna-send', ['-n', '1', 'luna://com.webos.applicationManager/launch', JSON.stringify({id: APP})],
    {stdio: 'ignore'}).on('error', function () {});
}

// Opens Free My TV a moment after LG's home came up, if it's still in front then.
function soon(why) {
  setTimeout(function () { if (now === HOME) launch(why); }, 400);
}

function front(id) {
  if (id !== now) log('front: ' + (id || '(none)'));
  now = id;
  if (id === HOME) {
    if (last !== APP && last !== HOME) {
      // An app closed (or the Home key got through): Free My TV instead.
      if (Date.now() - episode > 10000) { episode = Date.now(); tries = 0; }
      if (tries++ < 6) soon('after ' + (last || 'start'));
    } else if (last === APP && Date.now() - episode < 10000 && tries++ < 6) {
      // LG's home, still coming up after the app closed, lands on top of Free My TV a moment after we opened it,
      // sometimes more than once: that's not someone choosing LG Home. A few times at most, never a loop.
      soon('again, LG home came up over it');
    }
  }
  if (id) last = id;
}

function watch() {
  var child = spawn('luna-send', ['-i', 'luna://com.webos.applicationManager/getForegroundAppInfo', '{"subscribe":true}']);
  var rest = '';
  child.stdout.on('data', function (chunk) {
    rest += chunk;
    // One reply per JSON object, on one line or pretty-printed over several.
    var m, re = /"appId"\s*:\s*"([^"]*)"/g, end = 0;
    while ((m = re.exec(rest))) { front(m[1]); end = re.lastIndex; }
    rest = rest.slice(end);
    if (rest.length > 4096) rest = '';
  });
  child.on('error', function (e) { log('luna-send: ' + e.message); });
  child.on('exit', function () {
    log('subscription ended, again in 5 s');
    setTimeout(watch, 5000);
  });
}

log('watching for ' + APP);
watch();
