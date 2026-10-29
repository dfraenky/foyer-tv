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
var launchedAt = 0;

function log(text) {
  try { fs.appendFileSync(LOG, new Date().toISOString() + ' ' + text + '\n'); } catch (e) {}
}

function launch() {
  if (Date.now() - launchedAt < 3000) return;   // once per change, not a loop with an app that won't open
  launchedAt = Date.now();
  log('open ' + APP + ' (after ' + (last || 'start') + ')');
  spawn('luna-send', ['-n', '1', 'luna://com.webos.applicationManager/launch', JSON.stringify({id: APP})],
    {stdio: 'ignore'}).on('error', function () {});
}

function front(id) {
  if (id !== last) log('front: ' + (id || '(none)'));
  if (id === HOME && last !== APP && last !== HOME) launch();
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
