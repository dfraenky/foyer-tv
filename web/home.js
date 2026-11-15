/*
 * The home screen for web-app TVs (LG webOS, Samsung Tizen), with the Android app's design and behavior (HomeView):
 *  - top: the "For You" title and the tabs (Explore, Movies, Shows); icon-only glass buttons at the right (Live TV,
 *    HDMI Inputs, Settings) and the crypto quotes at the end of the tab row;
 *  - three picks for this hour in the selected tab; the background is the first one's photo, blurred and almost white;
 *  - the glass shelf with the apps; ↓ opens the drawer (inputs, shortcuts, weather, prices); ↑ or Back closes it;
 *  - ambient (on by default): while the shelf has focus, a pick's photo over the whole screen with the time and weather;
 *  - a night look from sunset to sunrise; a screensaver after a few idle minutes.
 * The remote's arrows, OK and Back move the focus; a pointer (LG's Magic Remote) focuses what it points at.
 */
(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  function el(tag, cls, parent, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }

  function sym(name, parent, size) {
    var s = el('span', 'sym', parent);
    s.style.webkitMaskImage = 'url(symbols/' + name + '.png)';
    s.style.maskImage = 'url(symbols/' + name + '.png)';
    if (size) { s.style.width = size + 'px'; s.style.height = size + 'px'; }
    return s;
  }

  function coin(i, parent) {
    var c = window.COINS && window.COINS[i];
    if (!c) return;
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 32 32');
    // Old WebKit (Tizen 2) draws an SVG without them at 300×150; the CSS still sets the size everywhere it's shown.
    svg.setAttribute('width', '15');
    svg.setAttribute('height', '15');
    for (var k = 0; k < c.length; k++) {
      var p = document.createElementNS(ns, 'path');
      p.setAttribute('d', c[k]);
      p.setAttribute('fill-rule', 'evenodd');
      svg.appendChild(p);
    }
    parent.appendChild(svg);
  }

  function hasClass(e, c) { return (' ' + e.className + ' ').indexOf(' ' + c + ' ') >= 0; }
  function setClass(e, c, on) {
    if (!e) return;
    if (on && !hasClass(e, c)) e.className = (e.className + ' ' + c).replace(/^\s+/, '');
    else if (!on && hasClass(e, c)) e.className = (' ' + e.className + ' ').replace(' ' + c + ' ', ' ').replace(/^\s+|\s+$/g, '');
  }

  var stage = $('stage'), body = document.body, HERO = CONFIG.heroCard !== false;
  if (!HERO) body.className += ' no-hero';

  /** The 1920 × 1080 stage fills the window (on the TV it already is 1920 × 1080). */
  function fit() {
    var s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    stage.style.webkitTransform = stage.style.transform = s === 1 ? '' : 'scale(' + s + ')';
  }

  // MARK: - Apps on the shelf

  /** Shelf apps in this order when installed, like the Android app: key, LG app id, name on the TV, brand gradient. */
  var SHELF = [
    ['netflix', /^netflix$/, /netflix/i, ['#0A0A0A', '#000000']],
    ['youtube', /youtube/, /^youtube$/i, ['#1C1C1E', '#09090A']],
    ['prime', /^amazon$/, /prime video|amazon/i, ['#2AA8FF', '#0A68D4']],
    ['disney', /disney/, /disney/i, ['#173584', '#08143F']],
    ['max', /hbo|wbd/, /^(hbo )?max$|hbo max/i, ['#5C30E8', '#221684']],
    ['appletv', /appletv|apple\.tv/, /apple tv/i, ['#1C1C1E', '#000000']],
    ['hulu', /^hulu/, /hulu/i, ['#1CE783', '#0B8F4E']],
    ['paramount', /paramount|cbs/, /paramount/i, ['#0064FF', '#002A86']],
    ['peacock', /peacock/, /peacock/i, ['#1C1C1E', '#000000']],
    ['nfl', /nfl/, /^nfl/i, ['#013369', '#00163D']],
    ['globoplay', /globoplay/, /globoplay/i, ['#FF8A1F', '#FF2D5A']],
    ['litefin', /litefin/i, /litefin/i, ['#000000', '#000000']],
    ['jellyfin', /jellyfin/i, /jellyfin/i, ['#AA5CC3', '#00A4DC']],
    ['crunchyroll', /crunchyroll/, /crunchyroll/i, ['#FF640A', '#F05A00']],
    ['spotify', /spotify/, /spotify/i, ['#1DB954', '#0F7A36']]
  ];
  // Apps shown at once, as on Android: 8 (today's smallest tiles, 178 wide); the shelf scrolls for the rest. The
  // built-in list keeps 8 too.
  var SHELF_VISIBLE = 8, FEW_APPS = 8;

  function shelfKey(app) {
    for (var i = 0; i < SHELF.length; i++) if (SHELF[i][1].test(app.id) || SHELF[i][2].test(app.title)) return SHELF[i];
    return null;
  }

  function darken(hex, f) {
    var m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return '#161618';
    var n = parseInt(m[1], 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return 'rgb(' + Math.round(r * f) + ',' + Math.round(g * f) + ',' + Math.round(b * f) + ')';
  }

  /** A name that fits the tile on one line (the font shrinks for long names). */
  function wordFit(title, width, max) {
    return Math.max(18, Math.min(max, Math.floor(width * 0.8 / (Math.max(4, title.length) * 0.56))));
  }

  // MARK: - Logos

  // The TV's icons are small squares with their own background (white behind Netflix, black behind Max). Like the
  // Android app does with the TV art, the logo is lifted off it once: the background goes transparent and the rest is
  // cropped to the logo, which then fills the tile on the brand's color.
  var lifted = {};   // icon url -> {src, bg: [r, g, b], ink: luminance histogram} or false (keep the icon as it is)
  var LIFT_SIZE = 240;

  // sRGB (0-255) to linear light, computed once: lift() needs it for every pixel, and old TVs are slow at Math.pow.
  var LINEAR = [];
  for (var li = 0; li < 256; li++) LINEAR[li] = li <= 10 ? li / 255 / 12.92 : Math.pow((li / 255 + 0.055) / 1.055, 2.4);

  /** Relative luminance (0-1) of an sRGB color (whole numbers, as read from the canvas). */
  function luminance(r, g, b) {
    return 0.2126 * LINEAR[r] + 0.7152 * LINEAR[g] + 0.0722 * LINEAR[b];
  }

  function rgbOf(color) {
    var m = /^#?([0-9a-f]{6})$/i.exec(color || '');
    if (m) { var n = parseInt(m[1], 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
    m = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(color || '');
    return m ? [+m[1], +m[2], +m[3]] : [0, 0, 0];
  }

  function lift(img) {
    var w = img.naturalWidth, h = img.naturalHeight;
    if (!w || !h) return false;
    var f = Math.min(1, LIFT_SIZE / Math.max(w, h));
    w = Math.max(1, Math.round(w * f));
    h = Math.max(1, Math.round(h * f));
    var canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    var g = canvas.getContext('2d');
    var data;
    try {
      g.drawImage(img, 0, 0, w, h);
      data = g.getImageData(0, 0, w, h);
    } catch (e) {
      return false;   // a TV that doesn't let the page read its icons
    }
    var px = data.data;
    // The background: the most common color a little inside the edges (rounded icons have transparent corners).
    var votes = {}, best = null, bestN = 0, inset = Math.round(Math.min(w, h) * 0.08);
    for (var s = 0; s < 64; s++) {
      var t = s % 16 / 16, side = s >> 4;
      var x = side < 2 ? Math.round(inset + t * (w - 2 * inset)) : side === 2 ? inset : w - 1 - inset;
      var y = side < 2 ? (side === 0 ? inset : h - 1 - inset) : Math.round(inset + t * (h - 2 * inset));
      var i = (y * w + x) * 4;
      var key = px[i + 3] < 128 ? 'clear' : (px[i] >> 4) + ',' + (px[i + 1] >> 4) + ',' + (px[i + 2] >> 4);
      votes[key] = (votes[key] || 0) + 1;
      if (votes[key] > bestN) { bestN = votes[key]; best = key === 'clear' ? null : [px[i], px[i + 1], px[i + 2]]; }
    }
    var minX = w, minY = h, maxX = -1, maxY = -1, ink = [0, 0, 0, 0, 0, 0, 0, 0], inkSum = 0;
    for (var p = 0; p < w * h; p++) {
      var j = p * 4, a = px[j + 3] / 255;
      if (best) {
        // color to alpha: how far each channel is from the background, as a share of how far it could go, so the
        // anti-aliased edges come out as the logo's color, partly clear, without a fringe of the background
        var k = 0, c;
        for (c = 0; c < 3; c++) {
          var v = px[j + c], o = best[c];
          k = Math.max(k, v > o ? (v - o) / Math.max(1, 255 - o) : (o - v) / Math.max(1, o));
        }
        k = Math.max(0, Math.min(1, (k - 0.1) / 0.9));   // compression noise stays clear
        if (k > 0 && k < 1) {
          for (c = 0; c < 3; c++) px[j + c] = Math.max(0, Math.min(255, best[c] + (px[j + c] - best[c]) / k));
        }
        a *= k;
      }
      px[j + 3] = Math.round(a * 255);
      if (a > 0.3) {
        var px0 = p % w, py0 = (p / w) | 0;
        if (px0 < minX) minX = px0;
        if (px0 > maxX) maxX = px0;
        if (py0 < minY) minY = py0;
        if (py0 > maxY) maxY = py0;
        ink[Math.min(7, Math.floor(Math.sqrt(luminance(px[j], px[j + 1], px[j + 2])) * 8))] += a;
        inkSum += a;
      }
    }
    // Nothing left, or nothing taken away (a picture rather than a logo on a background): keep the icon.
    if (maxX < 0 || (maxX - minX > w * 0.96 && maxY - minY > h * 0.96)) return false;
    var crop = document.createElement('canvas');
    crop.width = maxX - minX + 1;
    crop.height = maxY - minY + 1;
    g.putImageData(data, 0, 0);
    crop.getContext('2d').drawImage(canvas, minX, minY, crop.width, crop.height, 0, 0, crop.width, crop.height);
    for (var b = 0; b < 8; b++) ink[b] /= inkSum;
    try {
      return {src: crop.toDataURL('image/png'), bg: best, ink: ink};
    } catch (e2) {
      return false;
    }
  }

  /**
   * Share of the logo that hardly shows on a tile of this luminance (YouTube's black type on a dark tile). Each bin
   * of the histogram holds the ink whose square-root luminance falls in it.
   */
  function unseen(ink, tileLum) {
    var share = 0;
    for (var b = 0; b < 8; b++) {
      var l = Math.pow((b + 0.5) / 8, 2);
      if ((Math.max(l, tileLum) + 0.05) / (Math.min(l, tileLum) + 0.05) < 1.8) share += ink[b];
    }
    return share;
  }

  function paint(box, top, bottom) {
    box.style.background = '-webkit-linear-gradient(top, ' + top + ', ' + bottom + ')';
    box.style.background = 'linear-gradient(' + top + ', ' + bottom + ')';
  }

  /** A color that is clearly a hue (Crunchyroll's orange), not black, white or a gray. */
  function colorful(rgb) {
    return Math.max(rgb[0], rgb[1], rgb[2]) - Math.min(rgb[0], rgb[1], rgb[2]) >= 96;
  }

  /**
   * The logo's box in its own proportions, as large as object-fit: contain draws it. Chrome 38 (webOS 3) ignores
   * object-fit while a tile next to it animates, and the logo stretched to its 70% x 50% box until the move ended.
   * Not laid out yet (a closed sheet): object-fit stays, and fitLogos() runs when the sheet opens.
   */
  function fitLogo(img) {
    var box = img.parentNode, bw = img.offsetWidth, bh = img.offsetHeight, nw = img.naturalWidth, nh = img.naturalHeight;
    if (!box || !bw || !bh || !nw || !nh || img.style.width) return;
    var s = Math.min(bw / nw, bh / nh);
    img.style.width = nw * s / box.offsetWidth * 100 + '%';
    img.style.height = nh * s / box.offsetHeight * 100 + '%';
  }

  function fitLogos(root) {
    var imgs = root.querySelectorAll('img.logo');
    for (var i = 0; i < imgs.length; i++) if (imgs[i].complete) fitLogo(imgs[i]);
  }

  /** own: the tile has the TV's color for the app, not one of SHELF's. */
  function showLogo(img, box, top, bottom, logo, own) {
    img.className = 'logo';
    img.onload = function () { img.onload = null; fitLogo(img); };
    img.src = logo.src;
    if (img.complete) fitLogo(img);
    var a = rgbOf(top), z = rgbOf(bottom);
    var tileLum = (luminance(a[0], a[1], a[2]) + luminance(z[0], z[1], z[2])) / 2;
    // The tile takes the icon's background when the logo only reads on it, and when that background is the brand's
    // color: LG's bgColor isn't always the icon's (Crunchyroll's is black, on an orange icon).
    if (logo.bg && ((own && colorful(logo.bg)) || unseen(logo.ink, tileLum) > 0.35)) {
      var bg = 'rgb(' + logo.bg.join(',') + ')';
      var hex = '#' + ((1 << 24) | (logo.bg[0] << 16) | (logo.bg[1] << 8) | logo.bg[2]).toString(16).slice(1);
      paint(box, bg, darken(hex, 0.93));
    }
  }

  /** An app's face: its logo on its brand color (or its name, when the icon can't be read). */
  function face(app, box, wordSize) {
    var k = shelfKey(app);
    var top = k ? k[3][0] : app.color ? darken(app.color, 0.92) : '#2A2A2E';
    var bottom = k ? k[3][1] : app.color ? darken(app.color, 0.62) : '#161618';
    paint(box, top, bottom);
    var word = el('div', 'word', box, app.title);
    if (wordSize) word.style.fontSize = wordSize + 'px';
    if (app.icon) {
      var img = el('img', '', box), url = app.icon;
      word.style.visibility = 'hidden';
      img.onerror = function () { if (img.parentNode) img.parentNode.removeChild(img); word.style.visibility = ''; };
      if (lifted[url]) { showLogo(img, box, top, bottom, lifted[url], !k); return; }
      if (lifted[url] !== false) {
        img.onload = function () {
          img.onload = null;
          if (lifted[url] === undefined) lifted[url] = lift(img);
          if (lifted[url]) showLogo(img, box, top, bottom, lifted[url], !k);
        };
      }
      img.src = url;
    }
  }

  var apps = [], shelf = [], others = [], inputs = [];

  /** shelf_apps in config.properties: the shelf in that order, by id or name (part of it). */
  var WANTED = (CONFIG.shelfApps || []).map(function (s) { return s.toLowerCase(); });

  function pickShelf() {
    if (WANTED.length && Prefs.shelfConfig() !== WANTED.join(',')) {
      Prefs.set('shelf', null);
      Prefs.set('shelfConfig', WANTED.join(','));
    }
    var chosen = Prefs.shelf(), out = [];
    if (chosen) {
      for (var i = 0; i < chosen.length; i++) {
        for (var j = 0; j < apps.length; j++) if (apps[j].id === chosen[i]) out.push(apps[j]);
      }
    } else if (WANTED.length) {
      for (var w = 0; w < WANTED.length; w++) {
        for (var k = 0; k < apps.length; k++) {
          var id = apps[k].id.toLowerCase(), title = apps[k].title.toLowerCase();
          if ((id.indexOf(WANTED[w]) >= 0 || title.indexOf(WANTED[w]) >= 0) && out.indexOf(apps[k]) < 0) { out.push(apps[k]); break; }
        }
      }
      if (!out.length) out = apps.slice(0, FEW_APPS);
    } else {
      for (var s = 0; s < SHELF.length && out.length < FEW_APPS; s++) {
        for (var a = 0; a < apps.length; a++) {
          if ((SHELF[s][1].test(apps[a].id) || SHELF[s][2].test(apps[a].title)) && out.indexOf(apps[a]) < 0) { out.push(apps[a]); break; }
        }
      }
      if (!out.length) out = apps.slice(0, FEW_APPS);
    }
    shelf = out;
    others = apps.filter(function (x) { return shelf.indexOf(x) < 0; });
  }

  // MARK: - Focus

  // HERO: the ambient home's carousel (↑ from the shelf); ALL: every app, in the drawer under the inputs (ambient);
  // MENU: an app's menu (OK held on it).
  var Z = {TOP: 'top', CARDS: 'cards', HERO: 'hero', RESUME: 'resume', DISCOVER: 'discover', INFO: 'info', SHELF: 'shelf', DRAWER: 'drawer', ALL: 'all', MENU: 'menu', APPS: 'apps', SETTINGS: 'settings', EDIT: 'edit', LANG: 'lang', CITY: 'city', KEY: 'key', SEERR: 'seerr', PHONE: 'phone', ABOUT: 'about'};
  var st = {zone: Z.SHELF, top: 0, tab: 0, card: 0, resume: 0, drow: 0, info: 0, cat: 0, side: true, shelf: 0, drawer: 0, all: 0, menu: 0, grid: 0, row: 0, edit: 0, lang: 0, city: 0, key: 0, seerr: 0};
  var cards = [];

  function sheetOpen() { return st.zone === Z.APPS || st.zone === Z.SETTINGS || st.zone === Z.EDIT || st.zone === Z.LANG || st.zone === Z.CITY || st.zone === Z.KEY || st.zone === Z.SEERR || st.zone === Z.ABOUT; }

  function updateFocus() {
    var i, list;
    list = $('tabs').children;
    for (i = 0; i < list.length; i++) {
      setClass(list[i], 'on', i === st.tab);
      setClass(list[i], 'focus', st.zone === Z.TOP && st.top === i);
    }
    list = $('buttons').children;
    for (i = 0; i < list.length; i++) setClass(list[i], 'focus', st.zone === Z.TOP && st.top === NT + i);
    setClass($('quotes'), 'hide', st.zone === Z.TOP && st.top >= NT);
    layoutCards();
    list = $('cards').children;
    for (i = 0; i < list.length; i++) setClass(list[i], 'focus', st.zone === Z.CARDS && st.card === i);
    marquee(st.zone === Z.CARDS ? list[st.card] : null);
    list = $('tiles').children;
    for (i = 0; i < list.length; i++) {
      setClass(list[i], 'focus', st.zone === Z.SHELF && st.shelf === i);
      setClass(list[i], 'moving', !!st.moving && st.zone === Z.SHELF && st.shelf === i);
    }
    revealShelf();
    list = document.querySelectorAll('#drawer .key');
    for (i = 0; i < list.length; i++) setClass(list[i], 'focus', st.zone === Z.DRAWER && st.drawer === i);
    list = document.querySelectorAll('#apps .cell');
    for (i = 0; i < list.length; i++) setClass(list[i], 'focus', st.zone === Z.APPS && st.grid === i);
    var rows = Math.max(1, Math.ceil(others.length / 5)), r = Math.floor(st.grid / 5), first = Math.max(0, Math.min(rows - 3, r - 1));
    $('apps').lastChild.style.webkitTransform = $('apps').lastChild.style.transform = 'translateY(' + (-first * 239) + 'px)';
    focusRows($('settings'), st.row, st.zone === Z.SETTINGS && !st.side);
    list = $('settings').querySelectorAll('.cat');
    for (i = 0; i < list.length; i++) {
      setClass(list[i], 'on', i === st.cat);
      setClass(list[i], 'focus', st.zone === Z.SETTINGS && st.side && i === st.cat);
    }
    focusRows($('shelfedit'), st.edit, st.zone === Z.EDIT);
    focusRows($('langpick'), st.lang, st.zone === Z.LANG);
    if (langHint) langHint.textContent = (st.lang + 1) + ' / ' + languageChoices().length + '  ·  ' + tr('OK picks, Back cancels.');
    focusRows($('citypick'), st.city, st.zone === Z.CITY);
    focusRows($('keypick'), st.key, st.zone === Z.KEY);
    focusRows($('seerrpick'), st.seerr, st.zone === Z.SEERR);
    list = document.querySelectorAll('#drawer .cell');
    for (i = 0; i < list.length; i++) {
      setClass(list[i], 'focus', st.zone === Z.ALL && st.all === i);
      setClass(list[i], 'moving', !!st.moving && st.zone === Z.ALL && st.all === i);
    }
    var amb = ambient(), inDrawer = st.zone === Z.DRAWER || st.zone === Z.ALL || (st.zone === Z.MENU && menuFrom === Z.ALL);
    setClass(body, 'drawer-open', inDrawer);
    setClass(body, 'ambient', amb);
    setClass(body, 'hero-on', amb && (st.zone === Z.HERO || st.zone === Z.TOP));
    var paged = st.zone === Z.DISCOVER || (st.zone === Z.INFO && infoFrom === Z.DISCOVER);
    setClass(body, 'scene-on', amb && sceneOn && st.zone !== Z.HERO && st.zone !== Z.TOP && !paged);
    setClass(body, 'discover-on', paged);
    focusDiscover();
    focusInfo();
    setClass(body, 'kw-on', amb && rowItems.length > 0);
    list = $('resume').querySelectorAll('.card');
    for (i = 0; i < list.length; i++) setClass(list[i], 'focus', st.zone === Z.RESUME && st.resume === i);
    setClass(body, 'menu-on', st.zone === Z.MENU);
    setClass(body, 'night', amb || lastNight === true);
    scrollDrawer();
    renderHero();
    renderMenu();
  }

  function focusRows(sheet, index, on) {
    var rows = sheet.querySelectorAll('.row');
    for (var i = 0; i < rows.length; i++) setClass(rows[i], 'focus', on && i === index);
    var holder = sheet.querySelector('.rows');
    if (!holder) return;
    var visible = 7, first = Math.max(0, Math.min(rows.length - visible, index - 3));
    holder.style.webkitTransform = holder.style.transform = 'translateY(' + (-first * 78) + 'px)';
  }

  function nearest(nodes, x) {
    var best = 0, bestD = 1e9;
    for (var i = 0; i < nodes.length; i++) {
      var r = nodes[i].getBoundingClientRect(), d = Math.abs((r.left + r.right) / 2 - x);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  function centerX(node) {
    if (!node) return 960;
    var r = node.getBoundingClientRect();
    return (r.left + r.right) / 2;
  }

  // MARK: - Top: title, tabs, buttons, quotes

  // anime_tab in config.properties adds Anime: trending anime, in Jellyfin, on Crunchyroll or to request.
  var TAB_KIND = CONFIG.animeTab ? [null, 'movie', 'tv', 'anime'] : [null, 'movie', 'tv'];
  var NT = TAB_KIND.length;   // the round buttons come after the tabs in st.top: NT, NT + 1, NT + 2

  function renderTop() {
    $('title').textContent = tr('For You');
    var tabs = $('tabs');
    tabs.innerHTML = '';
    var names = [tr('Explore'), tr('Movies'), tr('Shows'), tr('Anime')];
    for (var i = 0; i < NT; i++) {
      var t = el('button', 'tab', tabs, names[i]);
      hover(t, Z.TOP, i);
    }
    var buttons = $('buttons');
    buttons.innerHTML = '';
    var defs = [['live_tv', tr('light|Live TV')], ['hdmi', tr('HDMI Inputs')], ['settings', tr('light|Settings')]];
    for (var b = 0; b < 3; b++) {
      var r = el('button', 'round' + (b === 2 ? ' last' : ''), buttons);
      r.style.left = (1596 + 88 * b) + 'px';
      sym(defs[b][0], r);
      el('div', 'tip', r, defs[b][1]);
      hover(r, Z.TOP, NT + b);
    }
  }

  function renderQuotes() {
    var q = $('quotes'), coins = Data.activeCoins();
    q.innerHTML = '';
    for (var i = 0; i < coins.length; i++) {
      var item = el('span', 'q', q);
      coin(coins[i], item);
      el('span', '', item, Data.compact(Data.prices[coins[i]]));
    }
  }

  // MARK: - Picks and background

  function renderCards() {
    var list = Data.picks(TAB_KIND[st.tab]);
    var holder = $('cards');
    setClass(body, 'no-picks', !list.length);
    setClass(body, 'no-key', !Data.hasKey());   // as on Android: no title or tabs that could never show anything
    if (!Data.hasKey() && st.zone === Z.TOP && st.top < NT) st.top = NT;
    var same = list.length === cards.length;
    for (var i = 0; same && i < list.length; i++) same = list[i].id === cards[i].id && list[i].backdrop === cards[i].backdrop && list[i].meta === cards[i].meta;
    if (same && holder.children.length === list.length) return;
    cards = list;
    marqueeOn = null;   // its nodes go now
    holder.innerHTML = '';
    for (var c = 0; c < list.length; c++) {
      var p = list[c], card = el('div', 'card', holder);
      var img = el('div', 'img', card);
      // Narrow: the poster (the backdrop cropped without one); the wide card fades its backdrop in over it, loaded then.
      var poster = el('div', 'layer', img);
      poster.style.backgroundImage = 'url(' + (p.poster ? Data.image(p.poster, 'w342') : Data.image(p.backdrop, 'w780')) + ')';
      el('div', 'layer back', img);
      el('div', 'name', card, p.title);
      if (p.meta) el('div', 'meta', card, p.meta);
      hover(card, Z.CARDS, c);
    }
    st.card = Math.min(st.card, Math.max(0, list.length - 1));
    if (!list.length && (st.zone === Z.CARDS || st.zone === Z.HERO)) st.zone = Z.SHELF;
    backdrop(list.length ? Data.image(list[0].backdrop, 'w300') : '');
    updateFocus();
  }

  /**
   * The card with focus (st.card, also while focus is elsewhere) is the wide one, the others narrow; past the third the
   * row scrolls a card at a time (the holder slides), and the cards at the edges lose their text. Only the holder's
   * transform and the backdrop's opacity animate: the widths change at once (older TVs).
   */
  function layoutCards() {
    // hero_card=false keeps every card narrow (five in view), the focused one only lifted, with its line of details.
    var holder = $('cards'), nodes = holder.children, left = 80, scroll = Math.max(0, st.card - (HERO ? 2 : 4)) * 360;
    for (var i = 0; i < nodes.length; i++) {
      var wide = HERO && i === st.card, w = wide ? 1040 : 320, n = nodes[i], at = left - scroll;
      n.style.left = left + 'px';
      n.style.width = w + 'px';
      setClass(n, 'wide', wide);
      setClass(n, 'edge', at < 0 || at > 1740);
      if (wide && !n.getAttribute('data-back') && cards[i]) {
        n.setAttribute('data-back', '1');
        n.querySelector('.back').style.backgroundImage = 'url(' + Data.image(cards[i].backdrop, 'w1280') + ')';
      }
      left += w + 40;
    }
    holder.style.webkitTransform = holder.style.transform = 'translateX(' + (-scroll) + 'px)';
  }

  // The focused card's title and details, the ones cut off, move left like a conveyor (hero_card=false): each line
  // twice in a row, both the same length and speed, so they come round again at once. Only a transform moves.
  var marqueeOn = null, MARQUEE_GAP = 64, MARQUEE_SPEED = 70;   // px between the end and the start again; px a second

  function marquee(card) {
    if (card === marqueeOn) return;
    if (marqueeOn) {
      var old = marqueeOn.querySelectorAll('[data-text]');
      for (var o = 0; o < old.length; o++) { old[o].textContent = old[o].getAttribute('data-text'); old[o].removeAttribute('data-text'); }
      setClass(marqueeOn, 'marquee', false);
    }
    marqueeOn = card;
    if (!card || HERO) return;
    var all = card.querySelectorAll('.name, .meta'), lines = [], widths = [], longest = 0;
    for (var i = 0; i < all.length; i++) {
      if (all[i].scrollWidth <= all[i].clientWidth) continue;   // fits: stays put (a pixel over already gets the ellipsis)
      lines.push(all[i]);
      widths.push(all[i].scrollWidth);
      longest = Math.max(longest, all[i].scrollWidth);
    }
    if (!lines.length) return;
    var cycle = longest + MARQUEE_GAP;
    for (var j = 0; j < lines.length; j++) {
      var text = lines[j].textContent;
      lines[j].setAttribute('data-text', text);
      lines[j].textContent = '';
      var run = el('span', 'run', lines[j]);
      run.style.webkitAnimationDuration = run.style.animationDuration = cycle / MARQUEE_SPEED + 's';
      for (var k = 0; k < 2; k++) el('span', '', run, text).style.paddingRight = cycle - widths[j] + 'px';
    }
    setClass(card, 'marquee', true);
  }

  var bgUrl = null, bgFront = 'bgA';

  /** The first pick's photo as the background: drawn tiny and stretched, it's already as soft as a heavy blur. */
  function backdrop(url) {
    if (url === bgUrl) return;
    bgUrl = url;
    var next = bgFront === 'bgA' ? 'bgB' : 'bgA';
    if (!url) {
      setClass($('bgA'), 'on', false);
      setClass($('bgB'), 'on', false);
      return;
    }
    var img = new Image();
    img.onload = function () {
      if (bgUrl !== url) return;
      var canvas = $(next), ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      setClass(canvas, 'on', true);
      setClass($(bgFront), 'on', false);
      bgFront = next;
    };
    img.src = url;
  }

  function renderClock() {
    var d = new Date(), c = $('clock');
    c.firstChild.textContent = formatDate('format|h:mm', d.getTime());
    c.lastChild.textContent = formatDate('format|EEEE, MMMM d', d.getTime());
    renderAmbient();
  }

  // MARK: - Ambient

  // Home Settings → Ambient home: while the shelf has focus, a landscape fills the screen with a big clock behind its
  // hills (the cut-out `fg` is drawn over the clock, whose digits are filled with a blurred copy of the scene). Which
  // landscape follows the season, the time of day (the sun at the city), the weather and the holidays. ↑ shows the
  // picks over the whole screen (the carousel: `wall`).
  var wallFront = 0, wallWanted = '', wallPick = null;

  // Summer: couch-tv's scenes ('c:'). The other seasons: photos from Wikimedia Commons (web/scenes/CREDITS.md), cut out
  // with tools/make_scene.py. `top` and `size` place the clock behind the skyline; `front`: the skyline is too high,
  // the clock stands in front.
  var PICK = {
    summer: {morning: 'c:dawn', day: 'c:water', evening: 'c:golden', night: 'c:night', wet: 'c:fog'},
    spring: {morning: 'spring-morning', day: 'spring-fuji', evening: 'spring-orchard', night: 'spring-fuji', wet: 'spring-orchard'},
    autumn: {morning: 'autumn-morning', day: 'autumn-day', evening: 'autumn-evening', night: 'autumn-morning', wet: 'c:fog'},
    winter: {morning: 'winter-morning', day: 'winter-hut', evening: 'winter-evening', night: 'winter-evening', wet: 'winter-evening'}
  };
  var PHOTO = {
    'winter-morning': {top: 214, size: 400}, 'winter-evening': {top: 196, size: 400}, 'winter-hut': {top: 150, size: 340, front: true},
    'autumn-day': {top: 120, size: 287}, 'autumn-evening': {top: 150, size: 340, front: true}, 'autumn-morning': {top: 148, size: 400},
    'spring-morning': {top: 214, size: 330}, 'spring-fuji': {top: 150, size: 330}, 'spring-orchard': {top: 120, size: 270}
  };
  // How the time of day darkens the scenery (never the clock): couch-tv's scenes were made for their hour, the photos
  // are darkened more at night.
  var SHADE = {
    couch: {morning: '', day: '', evening: 'rgba(40, 10, 40, 0.10), rgba(20, 5, 20, 0.32)', night: 'rgba(0, 0, 20, 0.30), rgba(0, 0, 10, 0.45)'},
    photo: {morning: '', day: '', evening: 'rgba(60, 20, 40, 0.18), rgba(20, 5, 20, 0.35)', night: 'rgba(4, 8, 30, 0.66), rgba(0, 0, 14, 0.74)'}
  };
  var sceneOn = false, sceneBusy = false, sceneImgKey = '', sceneWanted = '';

  function seasonOf(d) { var m = d.getMonth(); return m < 2 || m === 11 ? 'winter' : m < 5 ? 'spring' : m < 8 ? 'summer' : 'autumn'; }

  /** Morning, day, evening or night, from the sun at the city (6:00 and 18:00 without a forecast). */
  function dayPart(d) {
    var sun = Data.sun(), mins = d.getHours() * 60 + d.getMinutes();
    if (mins < sun.rise - 30 || mins >= sun.set + 30) return 'night';
    if (mins < sun.rise + 150) return 'morning';
    if (mins >= sun.set - 90) return 'evening';
    return 'day';
  }

  /** The weather now, as the scene shows it (Open-Meteo's WMO codes). */
  function weatherKind() {
    var w = Data.weather, c = w ? w.code : 0;
    if (c >= 95) return 'storm';
    if ((c >= 71 && c <= 77) || c === 85 || c === 86) return 'snow';
    if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82)) return 'rain';
    if (c === 45 || c === 48) return 'fog';
    if (c === 3) return 'cloudy';
    return 'clear';
  }

  function easterSunday(y) {   // Gauss (Meeus): the Gregorian Easter
    var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    var g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
    var l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), n = h + l - 7 * m + 114;
    return new Date(y, Math.floor(n / 31) - 1, n % 31 + 1);
  }
  function dayOf(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); }

  /**
   * The holiday now: {id, stage, greet}. Advent (from the 4th Sunday before Christmas): the fir gets more decorated each
   * Sunday (stage 1 to 4), Christmas (24 to 26 December) adds the star (5), and it stays up until 6 January.
   */
  function holidayAt(d) {
    var y = d.getFullYear(), m = d.getMonth(), day = d.getDate(), hour = d.getHours(), t = dayOf(d);
    if ((m === 11 && day === 31 && hour >= 18) || (m === 0 && day === 1 && hour < 3)) {
      return {id: 'nye', stage: 0, greet: m === 11 ? tr("Happy New Year's Eve") : tr('Happy New Year')};
    }
    if (m === 0 && day === 1) return {id: 'newyear', stage: 5, greet: tr('Happy New Year')};
    if (m === 11 && day >= 24 && day <= 26) return {id: 'xmas', stage: 5, greet: tr('Merry Christmas')};
    if ((m === 11 && day >= 27) || (m === 0 && day <= 6)) return {id: 'xmastree', stage: 5, greet: ''};
    var eve = new Date(y, 11, 24), first = dayOf(new Date(y, 11, 24 - eve.getDay() - 21));
    if (t >= first && t < dayOf(eve)) {
      var n = Math.floor((t - first) / (7 * 864e5)) + 1;
      return {id: 'advent', stage: n, greet: d.getDay() === 0 ? trf('Advent Sunday {n}', {n: n}) : ''};
    }
    var e = easterSunday(y);   // Sunday and Monday, by the date: Easter can fall on the clock change
    if (t === dayOf(e) || t === dayOf(new Date(y, e.getMonth(), e.getDate() + 1))) return {id: 'easter', stage: 0, greet: tr('Happy Easter')};
    if (m === 9 && day === 31 && hour >= 17) return {id: 'halloween', stage: 0, greet: tr('Happy Halloween')};
    return {id: '', stage: 0, greet: ''};
  }

  /** For tests and the preview: another time, and weather (WMO code), to see the scene of. */
  var sceneFake = null;
  function sceneClock() { return sceneFake ? sceneFake.at : Date.now(); }

  /** What the scene shows now: the landscape, its look, and the effects over it. */
  function sceneNow(now) {
    var d = new Date(now || Date.now()), sea = seasonOf(d), t = dayPart(d), w = sceneFake && sceneFake.wx ? sceneFake.wx : weatherKind();
    var hol = Prefs.holidays() ? holidayAt(d) : {id: '', stage: 0, greet: ''}, h = hol.id;
    if (h === 'easter') sea = 'spring';
    if (h === 'halloween') sea = 'autumn';
    if (hol.stage || h === 'nye') sea = 'winter';
    if (h === 'nye') { t = 'night'; w = 'clear'; }
    if (h === 'halloween') { t = 'night'; if (w === 'clear' || w === 'cloudy') w = 'fog'; }
    if (h === 'xmas' && (w === 'clear' || w === 'cloudy')) w = 'snow';
    var wet = t === 'day' && (w === 'cloudy' || w === 'rain' || w === 'storm' || w === 'fog');
    var pick = PICK[sea][wet ? 'wet' : t];
    if (h === 'easter') pick = t === 'night' ? 'spring-fuji' : 'spring-morning';
    if (hol.stage) pick = 'winter-morning';   // the Christmas fir
    if (h === 'nye') pick = 'winter-evening';
    if (h === 'halloween') pick = 'c:fog';
    var couch = pick.indexOf('c:') === 0, name = couch ? pick.slice(2) : pick, L = couch ? null : PHOTO[name];
    var grade = couch && name === 'fog' && sea === 'autumn' ? '.autumn' : '';
    var base = couch ? 'scenes/scene-' + name : 'scenes/p-' + name;
    var fg = couch ? (name === 'water' ? '' : base + '-fg' + grade + '.webp') : L.front ? '' : base + '-fg.webp';
    var fx = [];
    if (w === 'rain' || w === 'storm') fx.push('rain');
    if (w === 'storm') fx.push('storm');
    if (w === 'snow') fx.push('snow');
    if (w === 'fog') fx.push('mist');
    if (w !== 'clear' && w !== 'fog') fx.push('clouds');
    if (t === 'night' && w === 'clear' && name !== 'fog') fx.push('stars');
    if (sea === 'spring' && t !== 'night' && (w === 'clear' || w === 'cloudy')) fx.push('petals');
    if (h === 'easter') { fx.push('eggs'); if (pick === 'spring-morning') fx.push('hare', 'rays'); }
    if (h === 'halloween') fx.push('halloween');
    if (h === 'nye') fx.push('fireworks');
    for (var s = 1; s <= hol.stage; s++) fx.push('tree' + s);
    var shade = (couch ? SHADE.couch : SHADE.photo)[t];
    if (name === 'fog' && t === 'night') shade = 'rgba(8, 6, 22, 0.86), rgba(14, 8, 10, 0.74) 60%, rgba(0, 0, 0, 0.8)';
    return {
      cls: (couch ? 's-' + name : 's-photo') + (name === 'fog' && t === 'night' ? ' s-dark' : '') + ' fx-' + fx.join(' fx-'),
      bg: base + grade + '.jpg', glass: base + '-glass' + grade + '.jpg', fg: fg, layout: L, shade: shade, greet: hol.greet
    };
  }

  /** Shows the scene for now: a new landscape once its pictures have loaded (fading the last one out), else just its effects. */
  function applyScene(now) {
    var sc = sceneNow(now || sceneClock()), key = sc.bg + '|' + sc.fg;
    sceneWanted = key;
    if (key === sceneImgKey) { dressScene(sc); return; }
    if (sceneBusy) return;
    sceneBusy = true;
    var urls = [sc.bg, sc.glass].concat(sc.fg ? [sc.fg] : []), left = urls.length, was = sceneOn;
    sceneOn = false;
    if (was) updateFocus();
    function loaded() {
      if (--left) return;
      setTimeout(function () {
        sceneBusy = false;
        if (sceneWanted !== key) { applyScene(now); return; }   // it changed again meanwhile
        var s = $('scene');
        s.querySelector('.bg').style.backgroundImage = 'url(' + sc.bg + ')';
        s.querySelector('.fill').style.backgroundImage = 'url(' + sc.glass + ')';
        s.querySelector('.fg').style.backgroundImage = sc.fg ? 'url(' + sc.fg + ')' : 'none';
        sceneImgKey = key;
        dressScene(sc);
        sceneOn = true;
        updateFocus();
      }, was ? 1200 : 0);   // after the fade out
    }
    for (var i = 0; i < urls.length; i++) {
      var img = new Image();
      img.onload = img.onerror = loaded;
      img.src = urls[i];
      // Decoded before it shows (Chrome 64+), else the first frame of the fade waits ~0.4 s for three 1080p pictures.
      if (img.decode) { img.onload = null; img.decode().then(loaded, loaded); }
    }
  }

  /** The scene's classes (its effects), the clock's place and the light of the hour. */
  function dressScene(sc) {
    var s = $('scene'), L = sc.layout, shade = sc.shade ? '-webkit-linear-gradient(top, ' + sc.shade + ')' : 'none';
    s.className = sc.cls;
    var parts = [s.querySelector('.fill'), s.querySelector('.rim')];
    for (var i = 0; i < parts.length; i++) {
      parts[i].style.paddingTop = L ? L.top + 'px' : '';
      parts[i].style.fontSize = L ? L.size + 'px' : '';
    }
    s.querySelector('.date').style.top = L ? (L.top - 58) + 'px' : '';
    s.querySelector('.shadebg').style.background = shade;
    var sf = s.querySelector('.shadefg');
    sf.style.background = sc.fg ? shade : 'none';
    sf.style.webkitMaskImage = sc.fg ? 'url(' + sc.fg + ')' : 'none';
    sceneGreet = sc.greet;
    renderAmbient();
    fireworks();
  }
  var sceneGreet = '';

  // New Year's Eve: rockets rise and burst into sparks that fall and fade, on a canvas, only while it shows.
  var fwParts = [], fwRockets = [], fwOn = false, FW_COLORS = ['#FFD27A', '#FF6F91', '#7FD8FF', '#B6FF8F', '#FFFFFF', '#C79BFF', '#FF9F5A'];
  function fireworks() {
    var want = / fx-fireworks/.test(' ' + $('scene').className) && sceneOn && !document.hidden && st.zone !== Z.HERO;
    if (want === fwOn) return;
    fwOn = want;
    if (fwOn) requestAnimationFrame(fireworksFrame);
  }
  function fireworksFrame() {
    var cv = $('scene').querySelector('canvas'), cx = cv.getContext('2d');
    if (!fwOn || !/ fx-fireworks/.test(' ' + $('scene').className) || document.hidden) { fwOn = false; cx.clearRect(0, 0, 1920, 1080); return; }
    if (Math.random() < 0.022) {
      fwRockets.push({x: 260 + Math.random() * 1400, y: 1080, vx: (Math.random() - 0.5) * 1.6, vy: -(13 + Math.random() * 4),
        c: FW_COLORS[Math.floor(Math.random() * FW_COLORS.length)], top: 140 + Math.random() * 300, glitter: Math.random() < 0.4, ring: Math.random() < 0.25});
    }
    cx.globalCompositeOperation = 'destination-out';
    cx.fillStyle = 'rgba(0, 0, 0, 0.22)';
    cx.fillRect(0, 0, 1920, 1080);   // the trails fade
    cx.globalCompositeOperation = 'lighter';
    var keep = [];
    for (var i = 0; i < fwRockets.length; i++) {
      var r = fwRockets[i];
      r.x += r.vx; r.y += r.vy; r.vy += 0.16;
      cx.globalAlpha = 0.9; cx.fillStyle = '#FFE9C0'; cx.fillRect(r.x - 1.5, r.y, 3, 7);
      if (r.vy < -1.5 && r.y > r.top) { keep.push(r); continue; }
      var n = r.ring ? 40 : 70;   // fewer sparks: an LG C1 kept 48 fps moving along the shelf with 110
      for (var k = 0; k < n; k++) {
        var a = r.ring ? k / n * 6.283 : Math.random() * 6.283, v = r.ring ? 5.2 : 1.5 + Math.random() * 5.5;
        fwParts.push({x: r.x, y: r.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, decay: 0.008 + Math.random() * 0.008, c: r.c, glitter: r.glitter});
      }
    }
    fwRockets = keep;
    var alive = [];
    for (var j = 0; j < fwParts.length; j++) {
      var p = fwParts[j];
      p.life -= p.decay;
      if (p.life <= 0) continue;
      p.x += p.vx; p.y += p.vy; p.vx *= 0.975; p.vy = p.vy * 0.975 + 0.045;
      cx.globalAlpha = Math.min(1, p.life * 1.4) * (p.glitter && Math.random() < 0.4 ? 0.2 : 1);
      cx.fillStyle = p.c;
      cx.fillRect(p.x - 2, p.y - 2, 4, 4);
      alive.push(p);
    }
    fwParts = alive;
    cx.globalAlpha = 1;
    requestAnimationFrame(fireworksFrame);
  }

  /** The ambient look: on in Home Settings. */
  function ambient() { return Prefs.ambient(); }

  /** Shows a pick's photo `url` (the carousel) once it has loaded, cross-fading from the last one. */
  function showWall(url, pick) {
    var img = new Image();
    wallWanted = url;
    img.onload = function () {
      if (url !== wallWanted) return;   // ← → went on meanwhile
      var pics = $('wall').children;
      wallFront = 1 - wallFront;
      pics[wallFront].style.backgroundImage = 'url(' + url + ')';
      setClass(pics[wallFront], 'on', true);
      setClass(pics[1 - wallFront], 'on', false);
      wallPick = pick;
      renderAmbient();
      updateFocus();
    };
    img.src = url;
  }

  function renderAmbient() {
    var a = $('ambient').children, d = new Date();
    a[0].textContent = formatDate('format|h:mm', d.getTime());
    a[1].textContent = formatDate('format|EEEE, MMMM d', d.getTime());
    var w = Data.weather;
    a[2].innerHTML = '';
    if (w && Prefs.weather()) {
      sym(Data.symbol(w.code, w.isDay), a[2]);
      a[2].appendChild(document.createTextNode(Data.degrees(w.temp) + '  ' + Data.condition(w.code, w.isDay)));
      if (Data.city) el('span', 'city', a[2], Data.city);
    }
    var s = $('scene'), time = formatDate('format|h:mm', d.getTime()), date = s.querySelector('.date');
    s.querySelector('.fill').textContent = s.querySelector('.rim').textContent = time;
    date.innerHTML = '';
    if (sceneGreet) el('span', 'greet', date, sceneGreet);
    date.appendChild(document.createTextNode(a[1].textContent));
    if (w && Prefs.weather()) {
      sym(Data.symbol(w.code, w.isDay), date);
      date.appendChild(document.createTextNode(Data.degrees(w.temp)));
    }
    a[3].innerHTML = '';
  }

  /** On the minute, so the clock never runs late (the 30-second refresh could, by up to 30 s); the scene follows the hour. */
  function tickClock() {
    renderClock();
    if (ambient()) applyScene();
    setTimeout(tickClock, 60000 - Date.now() % 60000 + 50);
  }

  /** The carousel: the focused pick (st.card) over the whole screen, its title, details and story, a dot for each. */
  function renderHero() {
    var on = ambient() && (st.zone === Z.HERO || st.zone === Z.TOP), p = on && cards[st.card];
    fireworks();
    if (!p) return;
    var h = $('ambient').lastChild.children;
    h[0].textContent = p.title;
    h[1].textContent = p.meta || '';
    h[2].textContent = p.overview || '';
    var dots = h[3];
    if (dots.children.length !== cards.length) {
      dots.innerHTML = '';
      for (var i = 0; i < cards.length; i++) el('span', '', dots);
    }
    for (var j = 0; j < dots.children.length; j++) setClass(dots.children[j], 'on', j === st.card);
    var url = Data.image(p.backdrop, 'w1280');
    if (p.backdrop && url !== wallWanted) {
      showWall(url, p);
      // The neighbours load meanwhile, so ← → shows them at once.
      for (var d = -1; d <= 1; d += 2) {
        var n = cards[(st.card + d + cards.length) % cards.length];
        if (n && n.backdrop) new Image().src = Data.image(n.backdrop, 'w1280');
      }
    }
  }

  // MARK: - Keep watching and For you (ambient): small cards above the shelf

  // Keep watching (with Jellyfin): the last 3 paused titles and the next episode of a show, then 3 picks (TMDB) on the
  // right. One row for the remote.
  var rowItems = [], rowShown = '', ROW_STEP = 214;

  function renderResume() {
    var resume = Data.resume, paused = [], next = null, seen = {};
    for (var i = 0; i < resume.length; i++) {
      var it = resume[i];
      if (it.next) { if (!next && !seen[it.title]) next = it; continue; }
      if (paused.length < 3) { paused.push(it); seen[it.title] = true; }
    }
    if (next && seen[next.title]) next = null;
    var left = next ? paused.concat([next]) : paused, picks = [], have = {};
    for (var j = 0; j < left.length; j++) if (left[j].id) have[left[j].kind + left[j].id] = true;
    var all = Data.hasKey() ? Data.picks(TAB_KIND[0]) : [];
    for (var k = 0; k < all.length && picks.length < 3; k++) if (all[k].backdrop && !have[all[k].kind + all[k].id]) picks.push(all[k]);
    var items = [], x = 0;
    for (var a = 0; a < left.length; a++) { items.push({kind: 'resume', it: left[a], x: x}); x += ROW_STEP; }
    if (left.length) x += 40;
    var picksAt = x;
    for (var b = 0; b < picks.length; b++) { items.push({kind: 'pick', it: picks[b], x: x}); x += ROW_STEP; }
    if (picks.length) items.push({kind: 'more', it: {}, x: x});
    rowItems = items;
    var key = JSON.stringify(left) + JSON.stringify(picks.map(function (p) { return p.id; })) + I18N.lang + 'more';
    if (key === rowShown) return;
    rowShown = key;
    var r = $('resume');
    r.innerHTML = '';
    if (!items.length) { st.resume = 0; if (st.zone === Z.RESUME) st.zone = Z.SHELF; return; }
    if (left.length) el('div', 'label', r, tr('Keep watching')).style.left = '2px';
    if (picks.length) el('div', 'label', r, tr('For you')).style.left = (picksAt + 2) + 'px';
    for (var c = 0; c < items.length; c++) {
      var item = items[c], card = el('div', 'card' + (item.kind === 'more' ? ' more' : ''), r), shown = item.it;
      card.style.left = item.x + 'px';
      if (item.kind === 'more') {
        el('div', 'arrow', card, '›');
        el('div', 'm', card, tr('More'));
        hover(card, Z.RESUME, c);
        continue;
      }
      card.style.backgroundImage = 'url(' + (item.kind === 'pick' ? Data.image(shown.backdrop, 'w300') : shown.img) + ')';
      el('div', 'shade', card);
      var t = el('div', 't', card, shown.title);
      if (item.kind === 'resume' && shown.sub) el('span', '', t, shown.sub);
      if (item.kind === 'pick' && shown.service) el('span', '', t, shown.service);
      if (shown.next) el('div', 'badge', card, shown.fresh ? tr('New episode') : tr('Up next'));
      else if (item.kind === 'resume') el('div', 'bar', card).appendChild(el('div', 'done')).style.width = Math.max(4, shown.pct) + '%';
      hover(card, Z.RESUME, c);
    }
    st.resume = Math.min(st.resume, items.length - 1);
  }

  /** Opens a paused title: its page in Litefin (from its TMDB id), else the Jellyfin app. A pick opens where it streams. */
  function openRowItem(item) {
    if (item.kind === 'pick') {
      var p = item.it, papp = Data.appFor(p.app);
      if (papp) launcher(papp.id, papp.title, pickParams(p, papp))();
      return;
    }
    var it = item.it, app = Data.appFor('jellyfin');
    if (!app) { toast(trf("Couldn't open {app}.", {app: 'Jellyfin'})); return; }
    var params = it.id && /litefin/i.test(app.id) ? {tmdbId: it.id, mediaType: it.kind, title: it.title} : null;
    launcher(app.id, app.title, params)();
  }

  // MARK: - Discover (More, at the end of For you): a page of picks, Netflix-like

  // The focused title over the top of the page (its photo, name, details and story), and a row of landscape tiles for
  // each category below (Explore, Movies, Shows, Anime: what's trending). ← → along a row, ↑ ↓ between rows, OK opens.
  var heroImgs = [], tileImgs = [];
  var discoverRows = [], discoverCols = [], TILE_STEP = 324, DROW_STEP = 250, heroFront = 0, heroWanted = '', heroTimer = 0;

  function openDiscover() {
    st.zone = Z.DISCOVER;
    st.drow = 0;
    discoverCols = [];
    discoverShown = '';
    renderDiscover();
    updateFocus();
  }

  function closeDiscover() {
    st.zone = rowItems.length ? Z.RESUME : Z.SHELF;
    updateFocus();
  }

  var discoverShown = '';
  function renderDiscover() {
    var names = [tr('Explore'), tr('Movies'), tr('Shows'), tr('Anime')], rows = [];
    for (var k = 0; k < TAB_KIND.length; k++) {
      var list = Data.discover(TAB_KIND[k]);
      if (list.length) rows.push({name: names[k], sub: tr('Trending'), list: list});
    }
    // Coming soon, and what's new on each big service: in Jellyfin when the library has it, else to request in Seerr.
    var more = Data.moreRows();
    for (var m = 0; m < more.length; m++) {
      rows.push({name: more[m].service ? trf('New on {service}', {service: more[m].service}) : tr('Coming soon'), sub: '', list: more[m].list});
    }
    var key = rows.map(function (x) { return x.name + x.list.map(function (p) { return p.id + p.service; }).join(','); }).join('|');
    if (key === discoverShown) return;
    discoverShown = key;
    discoverRows = rows;
    var holder = $('discover').querySelector('.rows .all');
    holder.innerHTML = '';
    tileImgs = [];
    for (var r = 0; r < rows.length; r++) {
      var row = el('div', 'drow', holder);
      row.style.top = (r * DROW_STEP) + 'px';
      var label = el('div', 'label', row, rows[r].name);
      if (rows[r].sub) el('span', '', label, rows[r].sub);
      var strip = el('div', 'strip', row);
      for (var c = 0; c < rows[r].list.length; c++) {
        var p = rows[r].list[c], tile = el('div', 'tile', strip);
        tile.style.left = (c * TILE_STEP) + 'px';
        var turl = Data.image(p.backdrop, 'w300'), pre = new Image();
        tile.style.backgroundImage = 'url(' + turl + ')';
        pre.src = turl;   // decoded now, while the page fades in, not as each row scrolls into view
        if (pre.decode) pre.decode().then(null, function () {});
        tileImgs.push(pre);
        el('div', 'shade', tile);
        el('div', 't', tile, p.title);
        hover(tile, Z.DISCOVER, r * 100 + c);
      }
      discoverCols[r] = Math.min(discoverCols[r] || 0, rows[r].list.length - 1);
    }
    st.drow = Math.min(st.drow, Math.max(0, rows.length - 1));
    if (!rows.length) el('div', 'empty', holder, tr('The picks arrive in a moment.'));
  }

  /** The focus on the page: its row up top, the tile in view, and the title over the page (once the focus rests). */
  function focusDiscover() {
    var on = st.zone === Z.DISCOVER, page = $('discover');
    if (!on) return;
    var all = page.querySelector('.rows .all');
    all.style.webkitTransform = all.style.transform = 'translateY(' + (-st.drow * DROW_STEP) + 'px)';
    var rows = all.children;
    for (var r = 0; r < rows.length; r++) {
      var col = discoverCols[r] || 0, strip = rows[r].lastChild, tiles = strip.children;
      setClass(rows[r], 'here', r === st.drow);
      strip.style.webkitTransform = strip.style.transform = 'translateX(' + (-Math.max(0, col - 1) * TILE_STEP) + 'px)';
      for (var c = 0; c < tiles.length; c++) setClass(tiles[c], 'focus', r === st.drow && c === col);
    }
    var row = discoverRows[st.drow], p = row && row.list[discoverCols[st.drow] || 0];
    if (!p) return;
    clearTimeout(heroTimer);
    heroTimer = setTimeout(function () { showHero(p); }, 350);   // not for every tile flown past
  }

  function showHero(p) {
    var page = $('discover'), info = page.querySelector('.info').children, url = Data.image(p.backdrop, 'w1280');
    info[0].textContent = p.title;
    info[1].textContent = p.meta || '';
    info[2].textContent = p.overview || '';
    info[3].textContent = '';   // where it opens is in the details line
    if (url === heroWanted) return;
    heroWanted = url;
    var img = new Image();
    function shown() {
      if (url !== heroWanted) return;
      var pics = page.querySelectorAll('.pic');
      heroFront = 1 - heroFront;
      pics[heroFront].src = url;   // an <img>: the TV can show it as it is, a CSS background is drawn again
      setClass(pics[heroFront], 'on', true);
      setClass(pics[1 - heroFront], 'on', false);
    }
    img.onload = shown;
    img.src = url;
    // Decoded off the main thread first (Chrome 64+): a 1280 px photo decoded on it stalled an LG C1 for ~0.3 s.
    if (img.decode) { img.onload = null; img.decode().then(shown, shown); }
    heroImgs = [img];
  }

  function moveDiscover(dx, dy) {
    if (!discoverRows.length) return;
    if (dx) {
      var n = discoverRows[st.drow].list.length;
      discoverCols[st.drow] = Math.max(0, Math.min(n - 1, (discoverCols[st.drow] || 0) + dx));
    } else if (dy) {
      st.drow = Math.max(0, Math.min(discoverRows.length - 1, st.drow + dy));
    }
  }

  function openDiscovered() {
    var row = discoverRows[st.drow], p = row && row.list[discoverCols[st.drow] || 0], app = p && Data.appFor(p.app);
    if (app) launcher(app.id, app.title, pickParams(p, app))();
  }

  // MARK: - Info card (OK held on a pick, in For you or Discover)

  // The title's photo, name, year, rating, details and story, where it streams, and where it opens: its app, or Jellyfin
  // (in the library) or Seerr (to request it). Back closes it.
  var infoPick = null, infoFrom = '', infoActions = [];

  function discoverPick() {
    var row = discoverRows[st.drow];
    return row && row.list[discoverCols[st.drow] || 0];
  }

  var infoSeerr = '', infoTrailer = '';

  function openInfo(p) {
    infoPick = p;
    infoFrom = st.zone;
    infoSeerr = '';
    infoTrailer = '';
    st.zone = Z.INFO;
    st.info = 0;
    renderInfo();
    updateFocus();
    // Its request status in Seerr and its trailer come a moment later: the card is drawn again, its focus kept.
    Data.seerrStatus(p, function (status) { if (infoPick === p && status) { infoSeerr = status; redrawInfo(); } });
    Data.trailer(p, function (key) { if (infoPick === p && key) { infoTrailer = key; redrawInfo(); } });
  }

  function redrawInfo() {
    var label = infoWant || (infoActions[st.info] && infoActions[st.info].label);
    renderInfo();
    for (var i = 0; i < infoActions.length; i++) if (infoActions[i].label === label) { st.info = i; infoWant = ''; }
    st.info = Math.min(st.info, infoActions.length - 1);
    updateFocus();
  }

  function requestPick(p) {
    Data.seerrRequest(p, function (err) {
      if (err) { toast(trf("Couldn't request {title}: {error}", {title: p.title, error: err.message})); return; }
      toast(trf('{title} requested in Seerr.', {title: p.title}));
      if (infoPick === p) { infoSeerr = 'requested'; redrawInfo(); }
    });
  }

  // Back from the trailer: the card again, where it was (Discover's row and tile, or For you). Only when YouTube is what
  // closed (the watcher says, rooted LG): Home still goes home.
  var trailerReturn = null, infoWant = '';

  /** The trailer in the TV's YouTube app (Back there comes back to Foyer, to this card). */
  function playTrailer(key) {
    var yt = null;
    for (var i = 0; i < apps.length; i++) if (/youtube\.leanback|youtube/i.test(apps[i].id) && !/kids|music/i.test(apps[i].id)) { yt = apps[i]; break; }
    if (!yt) { toast(trf("Couldn't open {app}.", {app: 'YouTube'})); return; }
    trailerReturn = {at: Date.now(), app: yt.id, pick: infoPick, from: infoFrom, drow: st.drow, cols: discoverCols.slice(), resume: st.resume};
    launcher(yt.id, yt.title, {contentTarget: 'https://www.youtube.com/tv?v=' + key})();
  }

  /** Opened again after `closed` closed: true when that was the trailer, and its card is back. */
  function backFromTrailer(closed) {
    var r = trailerReturn;
    trailerReturn = null;
    if (!r || closed !== r.app || Date.now() - r.at > 3 * 3600000 || !r.pick) return false;
    hideSaver();
    closeSheets();
    if (r.from === Z.DISCOVER) {
      st.zone = Z.DISCOVER;
      st.drow = r.drow;
      discoverCols = r.cols;
      renderDiscover();
    } else {
      st.zone = Z.RESUME;
      st.resume = Math.min(r.resume, Math.max(0, rowItems.length - 1));
    }
    infoWant = tr('Trailer');
    openInfo(r.pick);
    return true;
  }

  function closeInfo() {
    st.zone = infoFrom || Z.RESUME;
    infoPick = null;
    updateFocus();
  }

  /** Closes the menu, the info card and Discover (the screensaver comes over them). */
  function closeOverlays() {
    if (st.zone === Z.INFO) closeInfo();
    if (st.zone === Z.MENU) closeMenu();
    if (st.zone === Z.DISCOVER) closeDiscover();
  }

  function renderInfo() {
    var box = $('info'), p = infoPick;
    box.innerHTML = '';
    if (!p) return;
    var pic = el('div', 'pic', box);
    pic.style.backgroundImage = 'url(' + Data.image(p.backdrop, 'w780') + ')';
    el('div', 'fade', box);
    var text = el('div', 'text', box);
    el('div', 't', text, p.title);
    var facts = [];
    if (p.year) facts.push(p.year);
    if (p.rating) facts.push('★ ' + p.rating.toFixed(1));
    if (p.meta) facts.push(p.meta);
    el('div', 'm', text, facts.join(' · '));
    el('div', 'o', text, p.overview || '');
    if (p.providers && p.providers.length) el('div', 'p', text, trf('Streaming on {services}', {services: p.providers.join(', ')}));
    infoActions = [];
    var app = Data.appFor(p.app), jf = Data.appFor('jellyfin');
    // Seerr (set up in Home Settings): request it here, unless it's in Jellyfin or already asked for.
    if (Data.seerrOn() && infoSeerr && infoSeerr !== 'available') {
      if (infoSeerr === 'requested') el('div', 'chip', text, tr('Requested'));
      else infoActions.push({label: p.kind === 'tv' && infoSeerr === 'partial' ? tr('Request the rest') : tr('Request'), run: function () { requestPick(p); }});
    }
    if (infoTrailer) infoActions.push({label: tr('Trailer'), run: function () { playTrailer(infoTrailer); }});
    if (app) infoActions.push({label: trf('Open in {app}', {app: p.service || app.title}), run: function () { launcher(app.id, app.title, pickParams(p, app))(); }});
    // Also to Jellyfin (Litefin): its page there, or Seerr's to request it, when the pick opens in a streaming app.
    if (jf && p.app !== 'jellyfin' && /litefin/i.test(jf.id)) {
      infoActions.push({label: tr('Open in Jellyfin or Seerr'), run: function () { launcher(jf.id, jf.title, {tmdbId: p.id, mediaType: p.kind, title: p.title})(); }});
    }
    infoActions.push({label: tr('Close'), run: closeInfo});
    var acts = el('div', 'acts', box);
    for (var i = 0; i < infoActions.length; i++) hover(el('div', 'act', acts, infoActions[i].label), Z.INFO, i);
  }

  function focusInfo() {
    var acts = $('info').querySelectorAll('.act');
    for (var i = 0; i < acts.length; i++) setClass(acts[i], 'focus', st.zone === Z.INFO && st.info === i);
    setClass(body, 'info-on', st.zone === Z.INFO);
  }

  /** Keep watching: Remove, from the menu. */
  function removeResume(entry) {
    closeMenu();
    Data.hideResume(entry, function (ok) {
      if (!ok) toast(trf("Couldn't remove {title}.", {title: entry.title}));
    });
  }

  // MARK: - Every app, in the drawer (ambient)

  var allList = [], ALL_COLS = 5, ALL_TOP = 744, ALL_STEP = 239;

  /** Every app: in the order picked on the TV (Move, in an app's menu), the rest as the TV lists them. */
  function allApps() {
    var order = Prefs.order(), out = [];
    for (var i = 0; i < order.length; i++) {
      for (var j = 0; j < apps.length; j++) if (apps[j].id === order[i]) out.push(apps[j]);
    }
    for (var k = 0; k < apps.length; k++) if (out.indexOf(apps[k]) < 0) out.push(apps[k]);
    return out;
  }

  function renderAllApps(d) {
    allList = allApps();
    el('div', 'row-title all-title', d, tr('Apps')).style.left = '134px';
    for (var i = 0; i < allList.length; i++) {
      var r = Math.floor(i / ALL_COLS), c = i % ALL_COLS, cell = el('div', 'cell', d);
      cell.style.left = (130 + c * 340) + 'px';
      cell.style.top = (ALL_TOP + r * ALL_STEP) + 'px';
      face(allList[i], el('div', 'face', cell), wordFit(allList[i].title, 300, 34));
      el('div', 'label', cell, allList[i].title);
      hover(cell, Z.ALL, i);
    }
    st.all = Math.min(st.all, Math.max(0, allList.length - 1));
  }

  /** In the apps, the drawer (and the shelf above it) scroll so the focused row shows. */
  function scrollDrawer() {
    var inAll = st.zone === Z.ALL || (st.zone === Z.MENU && menuFrom === Z.ALL);
    var y = inAll ? Math.max(0, ALL_TOP + Math.floor(st.all / ALL_COLS) * ALL_STEP - 780) : 0;
    var d = $('drawer'), h = $('home');
    d.style.webkitTransform = d.style.transform = y ? 'translateY(' + (-y) + 'px)' : '';
    h.style.webkitTransform = h.style.transform = y ? 'translateY(' + (-560 - y) + 'px)' : '';
  }

  // MARK: - An app's menu (OK held on it): Move, on or off the shelf, Uninstall

  var menuFrom = '', menuApp = null, menuItems = [], menuAsk = false, menuShown = '', canUninstall = false;
  var HOLD_MS = 550, okDown = false, holdTimer = 0;
  // LG's own apps and the Homebrew Channel stay (webos/root refuses them too).
  var KEEP_APPS = /^(com\.webos\.|com\.lge\.|com\.palm\.|org\.webosbrew\.)/;
  TV.canUninstall(function (ok) { canUninstall = ok; });

  function focusedApp() {
    return st.zone === Z.SHELF ? shelf[st.shelf] : st.zone === Z.ALL ? allList[st.all] : null;
  }

  function openMenu() {
    // OK held on Keep watching: its menu (Remove); on a pick (For you, Discover): its info card.
    if (st.zone === Z.DISCOVER) { var dp = discoverPick(); if (dp) openInfo(dp); return; }
    if (st.zone === Z.RESUME) {
      var item = rowItems[st.resume];
      if (!item || item.kind === 'more') return;
      if (item.kind === 'pick') { openInfo(item.it); return; }
      if (item.it.next || !item.it.jf) return;
      var entry = item.it;
      menuFrom = Z.RESUME;
      menuApp = {id: 'resume:' + entry.jf, title: entry.title, entries: function () {
        return [{label: tr('Remove from Keep watching'), symbol: 'remove', warn: true, run: function () { removeResume(entry); }},
                {label: tr('Cancel'), symbol: 'close', run: closeMenu}];
      }};
      menuAsk = false;
      st.zone = Z.MENU;
      st.menu = 0;
      menuShown = '';
      updateFocus();
      return;
    }
    var app = focusedApp();
    if (!app) return;
    menuFrom = st.zone;
    menuApp = app;
    menuAsk = false;
    st.zone = Z.MENU;
    st.menu = 0;
    menuShown = '';
    updateFocus();
  }

  function closeMenu() {
    st.zone = menuFrom || Z.SHELF;
    menuShown = '';
    updateFocus();
  }

  function shelfIds() { return shelf.map(function (a) { return a.id; }); }

  function menuEntries() {
    if (menuApp.entries) return menuApp.entries();
    var app = menuApp, on = shelfIds().indexOf(app.id) >= 0;
    if (menuAsk) {
      return [{label: tr('Uninstall'), symbol: 'delete', warn: true, run: function () { uninstallApp(app); }},
              {label: tr('Cancel'), symbol: 'close', run: closeMenu}];
    }
    var list = [{label: tr('Move'), symbol: 'move', run: function () { startMove(app); }},
                {label: on ? tr('Remove from shelf') : tr('Add to shelf'), symbol: on ? 'remove' : 'add', run: function () { toggleShelf(app); }}];
    if (canUninstall && app.removable !== false && !KEEP_APPS.test(app.id)) {
      list.push({label: tr('Uninstall'), symbol: 'delete', warn: true, run: function () { menuAsk = true; st.menu = 1; menuShown = ''; updateFocus(); }});
    }
    return list;
  }

  function renderMenu() {
    var m = $('appmenu');
    if (st.zone !== Z.MENU || !menuApp) { setClass(m, 'on', false); return; }
    var key = menuApp.id + (menuAsk ? ':ask' : '') + ':' + shelfIds().join(',');
    if (key !== menuShown) {
      menuShown = key;
      menuItems = menuEntries();
      m.innerHTML = '';
      el('div', 'head', m, menuAsk ? trf('Uninstall {app}?', {app: menuApp.title}) : menuApp.title);
      for (var i = 0; i < menuItems.length; i++) {
        var item = el('div', 'item' + (menuItems[i].warn ? ' warn' : ''), m);
        sym(menuItems[i].symbol, item);
        item.appendChild(document.createTextNode(menuItems[i].label));
        hover(item, Z.MENU, i);
      }
      // Next to the app: above a shelf tile, beside a cell of the apps (right of it, or left at the edge).
      var node = menuFrom === Z.RESUME ? $('resume').querySelectorAll('.card')[st.resume]
          : menuFrom === Z.SHELF ? $('tiles').children[st.shelf] : document.querySelectorAll('#drawer .cell')[st.all];
      var r = node ? node.getBoundingClientRect() : {left: 760, right: 1160, top: 500, bottom: 500};
      var s = window.innerWidth / 1920 || 1, height = 80 + menuItems.length * 68;
      var left, top;
      if (menuFrom === Z.SHELF || menuFrom === Z.RESUME) {
        left = ((r.left + r.right) / 2) / s - 220;
        top = r.top / s - height - 40;
      } else {
        left = r.right / s + 28 + 440 <= 1880 ? r.right / s + 28 : r.left / s - 28 - 440;
        top = Math.min(1040 - height, r.top / s);
      }
      left = Math.max(40, Math.min(1440, left));
      m.style.left = left + 'px';
      m.style.top = Math.max(40, top) + 'px';
    }
    st.menu = Math.min(st.menu, menuItems.length - 1);
    for (var j = 0; j < m.children.length - 1; j++) setClass(m.children[j + 1], 'focus', j === st.menu);
    setClass(m, 'on', true);
  }

  function toggleShelf(app) {
    var ids = shelfIds(), at = ids.indexOf(app.id);
    if (at >= 0) ids.splice(at, 1);
    else ids.push(app.id);
    Prefs.set('shelf', ids);
    pickShelf();
    renderShelf();
    if (menuFrom === Z.SHELF) st.shelf = Math.max(0, Math.min(st.shelf, shelf.length - 1));
    if (menuFrom === Z.SHELF && !shelf.length) menuFrom = Z.DRAWER;
    toast(at >= 0 ? trf('Removed from the shelf: {app}', {app: app.title}) : trf('Added to the shelf: {app}', {app: app.title}));
    closeMenu();
  }

  function uninstallApp(app) {
    closeMenu();
    toast(trf('Uninstalling {app} …', {app: app.title}));
    TV.uninstall(app.id, function (ok) {
      if (!ok) { toast(trf("Couldn't uninstall {app}.", {app: app.title})); return; }
      toast(trf('{app} was uninstalled.', {app: app.title}));
      // The TV drops it from its list a moment later.
      setTimeout(function () {
        loadApps(function () { renderShelf(); renderDrawer(); updateFocus(); });
      }, 2500);
    });
  }

  // Moving: ← → (and ↑ ↓ among all apps) carry the app, OK drops it, Back puts it back.
  function startMove(app) {
    st.moving = {from: menuFrom, id: app.id, before: menuFrom === Z.SHELF ? shelfIds() : allApps().map(function (a) { return a.id; })};
    st.zone = menuFrom;
    menuShown = '';
    toast(tr('← → to move · OK to drop · Back to cancel'));
    updateFocus();
  }

  function moveApp(dx, dy) {
    var m = st.moving, ids = m.from === Z.SHELF ? shelfIds() : allList.map(function (a) { return a.id; });
    var at = ids.indexOf(m.id), to = at + dx + (m.from === Z.ALL ? dy * ALL_COLS : 0);
    if (at < 0 || to === at || to < 0 || to >= ids.length) return;
    ids.splice(at, 1);
    ids.splice(to, 0, m.id);
    placeMoved(m.from, ids, to);
  }

  function placeMoved(from, ids, at) {
    if (from === Z.SHELF) {
      Prefs.set('shelf', ids);
      pickShelf();
      renderShelf();
      st.shelf = at;
    } else {
      Prefs.set('order', ids);
      renderDrawer();
      st.all = at;
    }
    updateFocus();
  }

  function endMove(keep) {
    var m = st.moving;
    st.moving = null;
    if (!keep) placeMoved(m.from, m.before, m.before.indexOf(m.id));
    setClass($('toast'), 'on', false);
    updateFocus();
  }

  // MARK: - Shelf

  var shelfFirst = 0, tileStep = 0, tileLeft = 0;

  function renderShelf() {
    var n = Math.min(shelf.length, SHELF_VISIBLE), gap = 48, pad = 40;
    // 16:9 tiles, as on Android: never taller than 126, and the glass keeps its bottom edge.
    var tw = Math.min(126 * 16 / 9, (1760 - Math.max(0, n - 1) * gap) / Math.max(1, n)), th = tw * 9 / 16;
    var width = n * tw + Math.max(0, n - 1) * gap, left = (1920 - width) / 2;
    var platter = $('platter');
    platter.style.display = n ? '' : 'none';
    platter.style.left = (left - pad) + 'px';
    platter.style.width = (width + 2 * pad) + 'px';
    platter.style.top = (814 + 126 - th) + 'px';
    platter.style.height = (th + 2 * pad) + 'px';
    $('quotes').style.right = (1920 - left - width) + 'px';
    var tiles = $('tiles');
    tiles.innerHTML = '';
    tileStep = tw + gap;
    tileLeft = left;
    shelfFirst = Math.max(0, Math.min(shelfFirst, shelf.length - n));
    for (var i = 0; i < shelf.length; i++) {
      var t = el('div', 'tile', tiles);
      t.style.top = (854 + 126 - th) + 'px';
      t.style.width = tw + 'px';
      t.style.height = th + 'px';
      face(shelf[i], t, wordFit(shelf[i].title, tw, 30));
      hover(t, Z.SHELF, i);
    }
    // More apps than fit: a small arrow inside the glass's edge on each side that has more, where no tile reaches
    // even focused (inside the screen's safe area, as on Android).
    platter.innerHTML = '';
    for (var a = 0; a < 2; a++) {
      var arrow = sym('chevron_right', platter);
      arrow.className += a ? ' more' : ' more back';
      arrow.style.left = (a ? width + 2 * pad - 14 : 14) - 8.5 + 'px';
      arrow.style.top = (pad + th / 2 - 8.5) + 'px';
    }
    st.shelf = Math.min(st.shelf, Math.max(0, shelf.length - 1));
    placeTiles();
  }

  /** The row slides (a transform on #tiles, which old TVs animate), and the apps it takes past the glass fade out. */
  function placeTiles() {
    var row = $('tiles'), tiles = row.children, n = Math.min(shelf.length, SHELF_VISIBLE);
    for (var i = 0; i < shelf.length; i++) {
      var shown = i >= shelfFirst && i < shelfFirst + n;
      tiles[i].style.left = (tileLeft + i * tileStep) + 'px';
      tiles[i].style.opacity = shown ? '' : '0';
      tiles[i].style.pointerEvents = shown ? '' : 'none';
    }
    row.style.webkitTransform = row.style.transform = 'translateX(' + (-shelfFirst * tileStep) + 'px)';
    var arrows = $('platter').children;
    arrows[0].style.visibility = shelfFirst > 0 ? '' : 'hidden';
    arrows[1].style.visibility = shelfFirst + n < shelf.length ? '' : 'hidden';
  }

  /** Scrolls the shelf, one app at a time, so the focused app is shown. */
  function revealShelf() {
    var n = Math.min(shelf.length, SHELF_VISIBLE);
    var first = Math.max(0, Math.min(Math.max(shelfFirst, st.shelf - n + 1), Math.min(st.shelf, shelf.length - n)));
    if (first === shelfFirst || !shelf.length) return;
    shelfFirst = first;
    placeTiles();
  }

  // MARK: - Drawer

  var drawerItems = [], drawerInputs = 0;

  function renderDrawer() {
    var d = $('drawer');
    d.innerHTML = '';
    drawerItems = [];
    for (var i = 0; i < inputs.length; i++) {
      var x = inputs[i];
      drawerItems.push({label: x.label || tr('Live TV'), symbol: x.symbol, off: !x.connected, run: launcher(x.id, x.label)});
    }
    drawerInputs = drawerItems.length;
    if (!Prefs.ambient()) drawerItems.push({label: tr('All Apps'), symbol: 'apps', run: openApps});
    drawerItems.push({label: tr('Home Settings'), symbol: 'settings', run: openSettings});
    if (TV.canOpenSettings) drawerItems.push({label: tr('TV Settings'), symbol: 'tv_settings', run: tvSettings});
    if (TV.lgHome) drawerItems.push({label: tr('LG Home'), symbol: 'home', run: launcher(TV.lgHome, tr('LG Home'))});
    var n = drawerItems.length, gap = 18, groupGap = 56, groups = drawerInputs > 0 && drawerInputs < n ? 2 : 1;
    var tw = Math.min(230, (1760 - Math.max(0, n - groups) * gap - (groups - 1) * groupGap) / Math.max(1, n));
    var xPos = 80;
    for (var k = 0; k < n; k++) {
      if (k === drawerInputs && k > 0) {
        xPos += groupGap - gap;
        el('div', 'row-title', d, tr('Shortcuts')).style.left = (xPos + 4) + 'px';
      }
      if (k === 0 && drawerInputs) el('div', 'row-title', d, tr('Inputs')).style.left = '84px';
      var item = drawerItems[k], key = el('div', 'key glass' + (item.off ? ' off' : ''), d);
      key.style.left = xPos + 'px';
      key.style.width = tw + 'px';
      sym(item.symbol, key);
      el('div', 'label', key, item.label);
      hover(key, Z.DRAWER, k);
      xPos += tw + gap;
    }
    if (Prefs.ambient()) renderAllApps(d);
    renderPanels();
    updateFocus();
  }

  function renderPanels() {
    var d = $('drawer');
    var old = d.querySelectorAll('.panel');
    for (var o = 0; o < old.length; o++) d.removeChild(old[o]);
    if (Prefs.ambient()) return;   // the weather is at the top left; every app takes their place
    var wx = Prefs.weather(), coins = Data.activeCoins(), qt = coins.length > 0;
    var split = 80 + 1760 * 0.585;
    if (wx) {
      var w = el('div', 'panel glass', d);
      w.id = 'weather';
      w.style.left = '80px';
      w.style.width = ((qt ? split - 16 : 1840) - 80) + 'px';
      renderWeather(w);
    }
    if (qt) {
      var q = el('div', 'panel glass', d);
      q.id = 'prices';
      var left = wx ? split + 16 : 80;
      q.style.left = left + 'px';
      q.style.width = (1840 - left) + 'px';
      renderPrices(q, coins);
    }
  }

  function renderWeather(card) {
    el('div', 'head', card, Data.city || tr('Weather'));
    var w = Data.weather;
    if (!w) {
      el('div', 'cond', card, tr('No weather data right now.')).style.top = '96px';
      return;
    }
    var now = el('div', 'now', card);
    sym(Data.symbol(w.code, w.isDay), now);
    el('span', 'temp', now, Data.degrees(w.temp));
    el('div', 'cond', card, Data.condition(w.code, w.isDay));
    el('div', 'range', card, trf('H:{max}', {max: Data.degrees(w.max)}) + '   ' + trf('L:{min}', {min: Data.degrees(w.min)}));
    el('div', 'split', card);
    // Home Settings → Forecast: the next 6 hours or the next 5 days (the hours until a forecast has days).
    var days = Prefs.forecast() === 'days' && w.days && w.days.length > 0, list = days ? w.days : w.hours, n = days ? 5 : 6;
    var hours = el('div', 'hours', card), width = parseFloat(card.style.width) - 30 - 422, hw = width / n;
    for (var i = 0; list && i < list.length && i < n; i++) {
      var h = el('div', 'hour', hours), x = list[i];
      h.style.left = (hw * i) + 'px';
      h.style.width = hw + 'px';
      el('div', 't', h, days ? Data.weekday(x.at) : Data.hour(x.at));
      sym(Data.symbol(x.code, days || x.day), h);
      var t = el('div', 'd', h, Data.degrees(days ? x.max : x.temp));
      if (days) el('span', 'low', t, Data.degrees(x.min));
    }
    var sun = el('div', 'sun', card);
    if (w.sunrise) { var a = el('span', '', sun); sym('sunrise', a); a.appendChild(document.createTextNode(trf('Sunrise {time}', {time: Data.time(w.sunrise)}))); }
    if (w.sunset) { var b = el('span', '', sun); sym('sunset', b); b.appendChild(document.createTextNode(trf('Sunset {time}', {time: Data.time(w.sunset)}))); }
  }

  function renderPrices(card, coins) {
    el('div', 'head', card, tr('Crypto'));
    var stale = Data.staleness(Data.pricesAt, 5 * 60000);
    el('div', 'side', card, stale ? trf('quotes|{ago}', {ago: stale}) : tr('24h change'));
    for (var j = 0; j < coins.length; j++) {
      var i = coins[j], row = el('div', 'coin', card);
      row.style.top = (86 + 52 * j) + 'px';
      coin(i, row);
      el('span', 'n', row, Data.coinName(i));
      el('span', 'p', row, Data.money(Data.prices[i]));
      var ch = Data.changes[i];
      if (!isNaN(ch)) el('span', 'c ' + (ch >= 0 ? 'up' : 'down'), row, Data.change(ch));
    }
  }

  function openDrawer() {
    if (!drawerItems.length) return;
    var tiles = $('tiles').children;
    st.zone = Z.DRAWER;
    st.drawer = Math.min(drawerItems.length - 1, nearest(document.querySelectorAll('#drawer .key'), centerX(tiles[st.shelf])));
    updateFocus();
  }

  function closeDrawer() {
    var from = st.zone === Z.ALL ? document.querySelectorAll('#drawer .cell')[st.all] : document.querySelectorAll('#drawer .key')[st.drawer];
    st.zone = Z.SHELF;
    if (shelf.length) st.shelf = nearest($('tiles').children, centerX(from));
    updateFocus();
  }

  // MARK: - All Apps

  function renderApps() {
    var sheet = $('apps');
    sheet.firstChild.textContent = tr('All Apps');
    var grid = sheet.lastChild;
    grid.innerHTML = '';
    for (var i = 0; i < others.length; i++) {
      var r = Math.floor(i / 5), c = i % 5, cell = el('div', 'cell', grid);
      cell.style.left = (130 + c * 340) + 'px';
      cell.style.top = (196 + r * 239) + 'px';
      face(others[i], el('div', 'face', cell), wordFit(others[i].title, 300, 34));
      el('div', 'label', cell, others[i].title);
      hover(cell, Z.APPS, i);
    }
  }

  function openApps() {
    renderApps();
    st.zone = Z.APPS;
    st.grid = 0;
    setClass($('apps'), 'open', true);
    fitLogos($('apps'));
    updateFocus();
  }

  function closeSheets() {
    setClass($('apps'), 'open', false);
    setClass($('settings'), 'open', false);
    setClass($('shelfedit'), 'open', false);
    setClass($('langpick'), 'open', false);
    setClass($('about'), 'open', false);
    closeField('citypick');
    closeField('keypick');
    setClass($('citypick'), 'open', false);
    setClass($('keypick'), 'open', false);
    setClass($('seerrpick'), 'open', false);
    langHint = null;
    st.zone = Z.SHELF;
    updateFocus();
  }

  // MARK: - Home Settings

  function settingRows() {
    var unit = Prefs.temperature(), theme = Prefs.theme();
    var auto = tr('Automatic'), picked = pickedLanguage();
    var rows = [
      {cat: 'General', label: tr('Language'), value: picked === 'auto' ? auto : I18N.languageName(picked), opens: true, language: true,
        step: function (d) { if (d >= 0) openLanguages(); }},
      {cat: 'Weather', label: tr('Temperature'), value: unit === 'C' ? '°C' : unit === 'F' ? '°F' : tr('unit|Automatic'),
        step: function (d) { cycle('temperature', ['auto', 'C', 'F'], unit, d); renderPanels(); }},
      {cat: 'Home Screen', label: tr('Theme'), value: theme === 'light' ? tr('Light') : theme === 'dark' ? tr('Dark') : auto,
        step: function (d) { cycle('theme', ['auto', 'light', 'dark'], theme, d); checkNight(); }},
      {cat: 'Home Screen', label: tr('Picks per tab'), value: String(Prefs.cards()),
        step: function (d) { Prefs.set('cards', 3 + (Prefs.cards() - 3 + (d || 1) + 4) % 4); renderCards(); }},
      {cat: 'Home Screen', label: tr('Ambient home'), toggle: Prefs.ambient(),
        step: function () { Prefs.set('ambient', !Prefs.ambient()); updateFocus(); }},
      {cat: 'Home Screen', label: tr('Holidays'), toggle: Prefs.holidays(),
        step: function () { Prefs.set('holidays', !Prefs.holidays()); applyScene(); }},
      {cat: 'Home Screen', label: tr('Watch from the screensaver'), toggle: Prefs.saverWatch(),
        step: function () { Prefs.set('saverWatch', !Prefs.saverWatch()); }},
      {cat: 'Weather', label: tr('Weather widget'), toggle: Prefs.weather(),
        step: function () { Prefs.set('weather', !Prefs.weather()); renderPanels(); }},
      {cat: 'Weather', label: tr('City'), value: Prefs.city() || '—', opens: true, city: true,
        step: function (d) { if (d >= 0) openCities(); }},
      {cat: 'Weather', label: tr('Forecast'), value: Prefs.forecast() === 'days' ? tr('Next days') : tr('Next hours'),
        step: function (d) { cycle('forecast', ['hours', 'days'], Prefs.forecast(), d); renderPanels(); }},
      {cat: 'Quotes widget', label: tr('Quotes widget'), toggle: Prefs.quotes(),
        step: function () { Prefs.set('quotes', !Prefs.quotes()); Data.settingsChanged(); }}
    ];
    var names = ['Bitcoin', 'Ethereum', 'Solana', tr('Dollar')];
    var count = Data.currency === 'BRL' ? 4 : 3;
    for (var i = 0; i < count; i++) {
      (function (i) {
        rows.push({cat: 'Quotes widget', label: names[i], toggle: Prefs.quotes() && Prefs.coin(i), dim: !Prefs.quotes(),
          step: function () { if (Prefs.quotes()) { Prefs.setCoin(i, !Prefs.coin(i)); Data.settingsChanged(); } }});
      })(i);
    }
    var seerrHost = Prefs.seerrKey() ? Prefs.seerrUrl().replace(/^https?:\/\//, '') : tr('Not set');
    rows.push({cat: 'Picks', label: 'Seerr', value: seerrHost, opens: true, seerr: true, step: function (d) { if (d >= 0) openSeerr(); }});
    rows.push({cat: 'Picks', label: tr('TMDB key'), value: Prefs.tmdbKey().length >= 4 ? '•••• ' + Prefs.tmdbKey().slice(-4) : tr('Not set'), opens: true, tmdb: true,
      step: function (d) { if (d >= 0) openKey(); }});
    var sv = Data.services();
    if (sv.length) {
      var someOff = false;   // only the services this TV has count
      for (var q = 0; q < sv.length; q++) someOff = someOff || Prefs.serviceOff(sv[q].key);
      rows.push({cat: 'Picks', label: tr('Picks from'), value: someOff ? tr('services|Some') : tr('services|All'),
        step: function () { Prefs.set('servicesOff', []); Data.settingsChanged(); }});
      for (var j = 0; j < sv.length; j++) {
        (function (key, name) {
          rows.push({cat: 'Picks', label: name, toggle: !Prefs.serviceOff(key),
            step: function () { Prefs.setServiceOff(key, !Prefs.serviceOff(key)); Data.refresh(); Data.settingsChanged(); }});
        })(sv[j].key, sv[j].name);
      }
    }
    rows.push({cat: 'Home Screen', label: tr('Shelf'), value: '›', shelf: true, step: function (d) { if (d >= 0) openShelfEdit(); }});
    rows.push({cat: 'General', label: tr('About this TV'), value: '›', about: true, step: function (d) { if (d >= 0) openAbout(); }});
    if (TV.canOpenSettings) rows.push({cat: 'General', label: tr('TV Settings'), value: '›', step: function (d) { if (d >= 0) tvSettings(); }});
    return rows;
  }

  function cycle(name, values, current, d) {
    var i = values.indexOf(current);
    Prefs.set(name, values[(i + (d || 1) + values.length) % values.length]);
  }

  // Home Settings: the categories on the left (↑ ↓), their rows on the right (→ or OK goes in, Back comes out).
  var rowsNow = [], CATS = ['General', 'Home Screen', 'Weather', 'Picks', 'Quotes widget'];
  function catName(c) {
    return {General: tr('General'), 'Home Screen': tr('Home Screen'), Weather: tr('Weather'), Picks: tr('Picks'), 'Quotes widget': tr('Quotes widget')}[c];
  }

  function renderSettings() {
    var box = $('settings').firstChild;
    box.innerHTML = '';
    var title = el('div', 'title', box);
    sym('settings', title);
    title.appendChild(document.createTextNode(tr('Home Settings')));
    var all = settingRows(), cats = [];
    for (var c = 0; c < CATS.length; c++) {
      for (var k = 0; k < all.length; k++) if (all[k].cat === CATS[c]) { cats.push(CATS[c]); break; }
    }
    st.cat = Math.max(0, Math.min(cats.length - 1, st.cat));
    var side = el('div', 'side', box);
    for (var n = 0; n < cats.length; n++) {
      (function (n) {
        var item = el('div', 'cat', side, catName(cats[n]));
        item.onmouseover = function () {
          if (st.zone !== Z.SETTINGS) return;
          st.side = true;
          if (st.cat !== n) { st.cat = n; st.row = 0; renderSettings(); } else updateFocus();
        };
        item.onclick = function () { item.onmouseover(); };
      })(n);
    }
    rowsNow = all.filter(function (r) { return r.cat === cats[st.cat]; });
    var main = el('div', 'main', box), list = el('div', 'list', main), holder = el('div', 'rows', list);
    list.style.height = Math.min(Math.max(rowsNow.length, cats.length), 7) * 78 + 'px';
    for (var i = 0; i < rowsNow.length; i++) {
      var r = rowsNow[i], row = el('div', 'row' + (r.dim ? ' dim' : ''), holder, r.label);
      if (r.toggle !== undefined) setClass(el('div', 'toggle', row), 'on', r.toggle);
      else {
        var v = el('span', 'value', row);
        if (r.value === '›') v.textContent = '›';
        else if (r.opens) { v.appendChild(document.createTextNode(r.value)); el('span', 'chev', v, '›'); }
        else { el('span', 'chev', v, '‹'); v.appendChild(document.createTextNode(r.value)); el('span', 'chev', v, '›'); }
      }
      hover(row, Z.SETTINGS, i);
    }
    el('div', 'hint', main, tr('OK or the arrows change the value.'));
    updateFocus();
  }

  function openSettings() {
    st.zone = Z.SETTINGS;
    st.row = 0;
    st.cat = 0;
    st.side = true;
    renderSettings();
    setClass($('settings'), 'open', true);
    updateFocus();
  }

  /** Back from a sheet Home Settings opened: on its row, in the category it was in. */
  function backToSettings(flag) {
    st.zone = Z.SETTINGS;
    st.side = false;
    renderSettings();
    setClass($('settings'), 'open', true);
    for (var i = 0; i < rowsNow.length; i++) if (rowsNow[i][flag]) st.row = i;
  }

  // MARK: - Language: a list of every catalogue in its own name, as on Android (moving through it doesn't switch the app)

  var langHint = null;

  function languageChoices() {
    return ['auto'].concat(I18N.languages());
  }

  /** The language in use: "auto", or the catalogue the setting resolved to ("pt-BR" in config.properties is "pt"). */
  function pickedLanguage() {
    return Prefs.language() === 'auto' ? 'auto' : I18N.lang;
  }

  function renderLanguages() {
    var box = $('langpick').firstChild, choices = languageChoices(), current = choices.indexOf(pickedLanguage());
    box.innerHTML = '';
    el('div', 'title', box, tr('Language'));
    var list = el('div', 'list', box), holder = el('div', 'rows', list);
    list.style.height = Math.min(choices.length, 7) * 78 + 'px';
    for (var i = 0; i < choices.length; i++) {
      var row = el('div', 'row', holder, choices[i] === 'auto' ? tr('Automatic') : I18N.languageName(choices[i]));
      if (i === current) sym('check', el('span', 'value', row));
      hover(row, Z.LANG, i);
    }
    langHint = el('div', 'hint', box);
    updateFocus();
  }

  function openLanguages() {
    setClass($('settings'), 'open', false);
    st.zone = Z.LANG;
    st.lang = Math.max(0, languageChoices().indexOf(pickedLanguage()));
    renderLanguages();
    setClass($('langpick'), 'open', true);
    updateFocus();
  }

  /** OK: the language under the focus; Back: none. Either way, back to Home Settings, on the Language row. */
  function closeLanguages(pick) {
    setClass($('langpick'), 'open', false);
    langHint = null;
    var code = languageChoices()[st.lang];
    if (pick && code !== pickedLanguage()) {
      Prefs.set('language', code);
      I18N.set(Prefs.language());
      renderAll();
      Data.refresh();   // the picks' titles and genres come in the new language
    }
    backToSettings('language');
    updateFocus();
  }

  // MARK: - Text fields: typed with the TV's keyboard (the city, the TMDB key)

  /** A row with a text field; on the TV, the focus in it brings up the keyboard. */
  function textField(holder, zone, value, placeholder, label) {
    var field = el('input', '', el('div', 'row field', holder));
    field.type = 'text';
    field.value = value;
    field.placeholder = placeholder;
    field.setAttribute('aria-label', label);
    field.setAttribute('autocomplete', 'off');
    field.setAttribute('spellcheck', 'false');
    hover(field.parentNode, zone, 0);
    return field;
  }

  function fieldOf(sheet) { return $(sheet).querySelector('input'); }

  function typingIn(sheet) { var f = fieldOf(sheet); return !!f && document.activeElement === f; }

  /** Into the field: the TV shows its keyboard. */
  function openField(sheet) {
    var f = fieldOf(sheet);
    if (!f) return;
    f.focus();
    try { f.setSelectionRange(f.value.length, f.value.length); } catch (e) {}
  }

  function closeField(sheet) {
    if (typingIn(sheet)) fieldOf(sheet).blur();
  }

  // MARK: - City: typed with the TV's keyboard, found by Open-Meteo, as on Android (the weather is for its coordinates)

  var cityFound = [], cityStatus = '', cityTimer = 0, citySeq = 0;

  /** The field to type in, the Search row, then the places found. */
  function cityRows() { return 2 + cityFound.length; }

  function renderCities() {
    var box = $('citypick').firstChild, old = fieldOf('citypick'), typed = old ? old.value : '', inField = typingIn('citypick');
    box.innerHTML = '';
    el('div', 'title', box, tr('City'));
    var list = el('div', 'list', box), holder = el('div', 'rows', list);
    list.style.height = Math.min(cityRows(), 7) * 78 + 'px';
    textField(holder, Z.CITY, typed, tr("Type the city's name"), tr('City'));
    var search = el('div', 'row', holder, tr('Search'));
    sym('chevron_right', el('span', 'value', search));
    hover(search, Z.CITY, 1);
    for (var i = 0; i < cityFound.length; i++) {
      var row = el('div', 'row', holder, cityFound[i].label);
      hover(row, Z.CITY, 2 + i);
    }
    el('div', 'hint', box, cityStatus || tr('OK picks, Back cancels.'));
    if (inField) openField('citypick');   // a message that went away while typing: the keyboard stays
    updateFocus();
  }

  function openCities() {
    setClass($('settings'), 'open', false);
    st.zone = Z.CITY;
    st.city = 0;
    cityFound = [];
    cityStatus = '';
    $('citypick').firstChild.innerHTML = '';
    renderCities();
    setClass($('citypick'), 'open', true);
    openField('citypick');
  }

  function setCityStatus(text) {
    cityStatus = text;
    clearTimeout(cityTimer);
    // Clears only the hint: a new render would rebuild the field and interrupt the TV's keyboard while someone types.
    if (text && text !== tr('Searching…')) cityTimer = setTimeout(function () {
      cityStatus = '';
      var hint = st.zone === Z.CITY && $('citypick').querySelector('.hint');
      if (hint) hint.textContent = tr('OK picks, Back cancels.');
    }, 4000);
    if (st.zone === Z.CITY) renderCities();
  }

  function searchCity() {
    var f = fieldOf('citypick'), name = f ? f.value : '';
    closeField('citypick');
    if (!name.trim()) { st.city = 0; openField('citypick'); updateFocus(); return; }
    if (cityStatus === tr('Searching…')) return;
    setCityStatus(tr('Searching…'));
    var mine = ++citySeq;   // an answer for a sheet already closed (and opened again) is dropped
    Data.findCity(name, function (err, found) {
      if (mine !== citySeq) return;
      if (st.zone !== Z.CITY) { cityStatus = ''; return; }
      cityFound = found || [];
      if (cityFound.length) st.city = 2;   // on the first place found
      setCityStatus(err ? trf("Couldn't search now: {error}", {error: err.message}) : cityFound.length ? '' : tr('No city with that name.'));
    });
  }

  /** OK on a place: the weather moves there. Back (pick false): nothing changes. Either way, back on the City row. */
  function closeCities(pick) {
    var place = pick && cityFound[st.city - 2];
    closeField('citypick');
    setClass($('citypick'), 'open', false);
    cityFound = [];
    citySeq++;
    clearTimeout(cityTimer);
    cityStatus = '';
    if (place) {
      Prefs.setCity(place.city, place.lat, place.lon);
      Data.cityChanged();
    }
    backToSettings('city');
    updateFocus();
  }

  function activateCity() {
    if (st.city === 0) openField('citypick');
    else if (st.city === 1) searchCity();
    else closeCities(true);
  }

  // MARK: - TMDB key: typed on the TV, so builds without one (the releases) get the picks too; TMDB checks it first

  var keyStatus = '', keyWarn = false, keyTimer = 0, keySeq = 0, keyAsking = false;

  function keyRows() { return keyAsking ? 2 : (Prefs.tmdbKeyOnTV() ? 3 : 2) + (canUninstall ? 1 : 0); }
  function keyRow() { var rows = ['field'].concat(canUninstall ? ['phone'] : [], ['save'], Prefs.tmdbKeyOnTV() ? ['remove'] : []); return rows[st.key]; }

  function keySteps() {
    return tr("The key brings the picks: what's trending on your streaming apps, with their photos on the screensaver.") + '\n'
      + tr('Free, and it takes two minutes:') + '\n1. ' + tr('Create an account at themoviedb.org.')
      + '\n2. ' + tr('Open Settings → API and request a developer key.');
  }

  function renderKey() {
    var box = $('keypick').firstChild, old = fieldOf('keypick'), typed = old ? old.value : '', inField = typingIn('keypick');
    box.innerHTML = '';
    el('div', 'title', box, keyAsking ? tr('Remove the TMDB key?') : tr('TMDB key'));
    var list = el('div', 'list', box), holder = el('div', 'rows', list);
    list.style.height = keyRows() * 78 + 'px';
    if (keyAsking) {
      hover(el('div', 'row', holder, tr('Cancel')), Z.KEY, 0);
      hover(el('div', 'row', holder, tr('Remove')), Z.KEY, 1);
      updateFocus();
      return;
    }
    var keyField = textField(holder, Z.KEY, typed, tr('API Read Access Token or API Key'), tr('TMDB key'));
    // A v3 key is lowercase hex: the TV's keyboard mustn't capitalize it (the city's field wants capitals).
    keyField.setAttribute('autocapitalize', 'none');
    keyField.setAttribute('autocorrect', 'off');
    var n = 1;
    if (canUninstall) {
      var ph = el('div', 'row', holder, tr('Enter with your phone'));
      sym('chevron_right', el('span', 'value', ph));
      hover(ph, Z.KEY, n++);
    }
    var save = el('div', 'row', holder, tr('Save'));
    sym('chevron_right', el('span', 'value', save));
    hover(save, Z.KEY, n++);
    if (Prefs.tmdbKeyOnTV()) hover(el('div', 'row', holder, tr('Remove the key')), Z.KEY, n);
    if (keyStatus) setClass(el('div', 'hint', box, keyStatus), 'warn', keyWarn);
    el('div', 'hint steps', box, keySteps());
    if (inField) openField('keypick');
    updateFocus();
  }

  function openKey() {
    setClass($('settings'), 'open', false);
    st.zone = Z.KEY;
    st.key = 0;
    keyStatus = '';
    keyAsking = false;
    $('keypick').firstChild.innerHTML = '';
    renderKey();
    setClass($('keypick'), 'open', true);
    openField('keypick');
  }

  function setKeyStatus(text, warn) {
    keyStatus = text;
    keyWarn = !!warn;
    clearTimeout(keyTimer);
    if (text && text !== tr('Checking the key with TMDB…')) keyTimer = setTimeout(function () {
      keyStatus = '';
      var line = st.zone === Z.KEY && $('keypick').querySelector('.hint:not(.steps)');
      if (line) line.parentNode.removeChild(line);
    }, 6000);
    if (st.zone === Z.KEY) renderKey();
  }

  function cleanKey(typed) {
    var key = typed.replace(/\s+/g, '');
    return /^[A-Za-z0-9._-]{16,1024}$/.test(key) ? key : '';
  }

  function saveKey() {
    var f = fieldOf('keypick'), typed = f ? f.value : '', key = cleanKey(typed);
    closeField('keypick');
    if (!typed.replace(/\s+/g, '')) { st.key = 0; openField('keypick'); updateFocus(); return; }
    if (keyStatus === tr('Checking the key with TMDB…')) return;
    if (!key) { setKeyStatus(tr("That doesn't look like a TMDB key."), true); return; }
    setKeyStatus(tr('Checking the key with TMDB…'));
    var mine = ++keySeq;   // an answer for a sheet already closed is dropped
    Data.checkKey(key, function (err) {
      if (mine !== keySeq || st.zone !== Z.KEY) return;
      if (err) { setKeyStatus(err.rejected ? tr('TMDB refused this key.') : trf("Couldn't reach TMDB: {error}", {error: err.message}), true); return; }
      Prefs.set('tmdbKey', key);
      if (fieldOf('keypick')) fieldOf('keypick').value = '';
      Data.keyChanged();
      setKeyStatus(tr('Saved. The picks arrive in a moment.'));
    });
  }

  /** Back to config.properties' key (none in the releases): the picks go. */
  function removeKey() {
    Prefs.set('tmdbKey', undefined);   // left out of the saved settings
    closeKey();
    Data.keyChanged();
  }

  /** Back on the TMDB key row of Home Settings. */
  function closeKey() {
    closeField('keypick');
    setClass($('keypick'), 'open', false);
    keySeq++;
    clearTimeout(keyTimer);
    keyStatus = '';
    keyAsking = false;
    var f = fieldOf('keypick');
    if (f) f.value = '';
    backToSettings('tmdb');
    updateFocus();
  }

  function askRemoveKey(on) {
    keyAsking = on;
    keyStatus = '';
    clearTimeout(keyTimer);
    st.key = on ? 0 : keyRows() - 1;
    renderKey();
  }

  function activateKey() {
    if (keyAsking) { if (st.key === 1) removeKey(); else askRemoveKey(false); }
    else if (keyRow() === 'field') openField('keypick');
    else if (keyRow() === 'phone') {
      openPhone({title: tr('TMDB key'), lang: I18N.lang, texts: phoneTexts(), fields: [{name: 'key', label: tr('TMDB key'), value: ''}]}, function (v) {
        var f = fieldOf('keypick');
        if (f && v.key) { f.value = v.key; saveKey(); }
      });
    }
    else if (keyRow() === 'save') saveKey();
    else askRemoveKey(true);
  }

  // MARK: - With the phone: a QR code for a one-time page in the home network (rooted LG: the watcher serves it)

  var phoneSpec = null, phoneDone = null, phoneFrom = '', phoneTimer = 0, phoneSeq = 0;

  /** Shows the code; done(values) when the phone sent them. Back closes (and the page goes). */
  function openPhone(spec, done) {
    var mine = ++phoneSeq;
    phoneSpec = spec;
    phoneDone = done;
    phoneFrom = st.zone;
    var box = $('phone');
    box.innerHTML = '';
    el('div', 'title', box, tr('With your phone'));
    el('div', 'wait', box, tr('Opening the page…'));
    st.zone = Z.PHONE;
    setClass(box, 'on', true);
    updateFocus();
    TV.handoffStart(spec, function (r) {
      if (mine !== phoneSeq || st.zone !== Z.PHONE) return;
      if (!r || !r.url) { closePhone(); toast(tr("Couldn't open the page for the phone.")); return; }
      box.innerHTML = '';
      el('div', 'title', box, tr('With your phone'));
      var code = el('div', 'qr', box);
      code.innerHTML = r.svg;
      el('div', 'steps', box, tr('Scan the code with your phone\'s camera, paste the values and tap Send.'));
      el('div', 'url', box, r.url.replace(/^http:\/\//, '').replace(/\/[0-9a-f]{32}$/, '/…'));
      el('div', 'hint', box, tr('The phone has to be on the same network. The page closes after 5 minutes.'));
      pollPhone(mine);
    });
  }

  function pollPhone(mine) {
    phoneTimer = setTimeout(function () {
      if (mine !== phoneSeq || st.zone !== Z.PHONE) return;
      TV.handoffPoll(function (r) {
        if (mine !== phoneSeq || st.zone !== Z.PHONE) return;
        if (r && r.state === 'done' && r.values) { var done = phoneDone; closePhone(true); done(r.values); return; }
        if (!r || r.state === 'expired' || r.state === 'none') { closePhone(); toast(tr('The page for the phone has closed.')); return; }
        pollPhone(mine);
      });
    }, 1000);
  }

  function closePhone(got) {
    phoneSeq++;
    clearTimeout(phoneTimer);
    if (!got) TV.handoffStop();
    setClass($('phone'), 'on', false);
    st.zone = phoneFrom || Z.SHELF;
    phoneSpec = null;
    updateFocus();
  }

  function phoneTexts() {
    return {send: tr('Send'), done: tr('Done: look at the TV.'), hint: tr('Only for this TV, for 5 minutes.')};
  }

  // MARK: - Seerr: its address and an API key, typed on the TV (Home Settings > Seerr), checked before they're saved

  var seerrStatusText = '', seerrWarn = false, seerrSeq = 0;

  function seerrPhone() { return canUninstall; }   // the rooted LG's watcher serves the phone's page
  function seerrRows() { return (Prefs.seerrKey() ? 4 : 3) + (seerrPhone() ? 1 : 0); }
  function seerrRow(name) { var rows = ['url', 'key'].concat(seerrPhone() ? ['phone'] : [], ['save'], Prefs.seerrKey() ? ['remove'] : []); return name ? rows.indexOf(name) : rows[st.seerr]; }
  function seerrFields() { return $('seerrpick').querySelectorAll('input'); }
  function seerrTyping() { var f = seerrFields(); return document.activeElement === f[0] || document.activeElement === f[1]; }

  function renderSeerr() {
    var box = $('seerrpick').firstChild, old = seerrFields();
    var url = old.length ? old[0].value : Prefs.seerrUrl(), key = old.length ? old[1].value : '';
    var inField = old.length && document.activeElement === old[1] ? 1 : old.length && document.activeElement === old[0] ? 0 : -1;
    box.innerHTML = '';
    el('div', 'title', box, 'Seerr');
    var list = el('div', 'list', box), holder = el('div', 'rows', list);
    list.style.height = seerrRows() * 78 + 'px';
    var a = textField(holder, Z.SEERR, url, 'http://192.168.1.20:5055', tr('Address'));
    var b = textField(holder, Z.SEERR, key, Prefs.seerrKey() ? '•••• ' + Prefs.seerrKey().slice(-4) : tr('API key'), tr('API key'));
    hover(b.parentNode, Z.SEERR, 1);
    var fields = [a, b];
    for (var i = 0; i < 2; i++) {
      fields[i].setAttribute('autocapitalize', 'none');
      fields[i].setAttribute('autocorrect', 'off');
    }
    if (seerrPhone()) {
      var ph = el('div', 'row', holder, tr('Enter with your phone'));
      sym('chevron_right', el('span', 'value', ph));
      hover(ph, Z.SEERR, seerrRow('phone'));
    }
    var save = el('div', 'row', holder, tr('Save'));
    sym('chevron_right', el('span', 'value', save));
    hover(save, Z.SEERR, seerrRow('save'));
    if (Prefs.seerrKey()) hover(el('div', 'row', holder, tr('Remove')), Z.SEERR, seerrRow('remove'));
    if (seerrStatusText) setClass(el('div', 'hint', box, seerrStatusText), 'warn', seerrWarn);
    el('div', 'hint steps', box, tr('With Seerr, the info card (OK held on a title) can request it.') + '\n'
      + tr('The API key is in Seerr: Settings → General → API Key.'));
    if (inField >= 0) seerrFields()[inField].focus();
    updateFocus();
  }

  function openSeerr() {
    setClass($('settings'), 'open', false);
    st.zone = Z.SEERR;
    st.seerr = 0;
    seerrStatusText = '';
    $('seerrpick').firstChild.innerHTML = '';
    renderSeerr();
    setClass($('seerrpick'), 'open', true);
    seerrFields()[Prefs.seerrUrl() ? 1 : 0].focus();
    st.seerr = Prefs.seerrUrl() ? 1 : 0;
    updateFocus();
  }

  function closeSeerr() {
    var f = seerrFields();
    for (var i = 0; i < f.length; i++) f[i].blur();
    setClass($('seerrpick'), 'open', false);
    seerrSeq++;
    seerrStatusText = '';
    $('seerrpick').firstChild.innerHTML = '';
    backToSettings('seerr');
    updateFocus();
  }

  function setSeerrStatus(text, warn) {
    seerrStatusText = text;
    seerrWarn = !!warn;
    if (st.zone === Z.SEERR) renderSeerr();
  }

  function saveSeerr() {
    var f = seerrFields(), url = f[0].value.replace(/\s+/g, '').replace(/\/+$/, ''), key = f[1].value.replace(/\s+/g, '') || Prefs.seerrKey();
    f[0].blur(); f[1].blur();
    if (!/^https?:\/\/[^\/]+/.test(url)) { setSeerrStatus(tr('The address must start with http:// or https://.'), true); return; }
    if (!key) { st.seerr = 1; f[1].focus(); updateFocus(); return; }
    setSeerrStatus(tr('Checking with Seerr…'));
    var mine = ++seerrSeq;
    Data.seerrCheck(url, key, function (err) {
      if (mine !== seerrSeq || st.zone !== Z.SEERR) return;
      if (err) { setSeerrStatus(err.rejected ? tr('Seerr refused this key.') : trf("Couldn't reach Seerr: {error}", {error: err.message}), true); return; }
      Prefs.set('seerrUrl', url);
      Prefs.set('seerrKey', key);
      seerrFields()[1].value = '';
      setSeerrStatus(tr('Saved.'));
    });
  }

  function activateSeerr() {
    var row = seerrRow();
    if (row === 'url' || row === 'key') seerrFields()[row === 'url' ? 0 : 1].focus();
    else if (row === 'phone') {
      var f = seerrFields();
      openPhone({title: 'Seerr', lang: I18N.lang, texts: phoneTexts(), fields: [
        {name: 'url', label: tr('Address'), value: f[0].value || Prefs.seerrUrl()}, {name: 'key', label: tr('API key'), value: ''}]}, function (v) {
        var g = seerrFields();
        if (v.url) g[0].value = v.url;
        if (v.key) g[1].value = v.key;
        saveSeerr();
      });
    }
    else if (row === 'save') saveSeerr();
    else { Prefs.set('seerrUrl', undefined); Prefs.set('seerrKey', undefined); closeSeerr(); }
  }

  // MARK: - About this TV: what to quote when reporting a problem, without LG's or Samsung's slow menus

  function renderAbout(info) {
    var box = $('about').firstChild;
    box.innerHTML = '';
    el('div', 'title', box, tr('About this TV'));
    var list = el('div', 'list', box), holder = el('div', 'rows', list);
    var rows = [
      [tr('Model'), info && info.model], [tr('Firmware'), info && info.firmware], [tr('System'), info && info.system],
      [tr('IP address'), info && info.ip], [tr('Time zone'), TV.zone()], ['Foyer', info && info.version]
    ];
    for (var i = 0; i < rows.length; i++) {
      var row = el('div', 'row', holder), label = el('span', '', row, rows[i][0]);
      fitValue(row, label, el('span', 'value', row, info ? rows[i][1] || tr('Unavailable') : '…'));
    }
    el('div', 'hint', box, tr('Back closes.'));
  }

  /** A long value (Samsung's firmware) gets smaller instead of running over its label, and ends in "…" if even the smallest size is too wide. */
  function fitValue(row, label, value) {
    var room = row.clientWidth - label.offsetWidth - 2 * 24 - 24;   // the row's padding, and a gap after the label
    for (var size = 30; value.offsetWidth > room && size > 18; size -= 2) value.style.fontSize = size - 2 + 'px';
    if (value.offsetWidth > room) { value.style.maxWidth = room + 'px'; setClass(value, 'cut', true); }
  }

  function openAbout() {
    setClass($('settings'), 'open', false);
    st.zone = Z.ABOUT;
    renderAbout(null);
    setClass($('about'), 'open', true);
    updateFocus();
    TV.about(function (info) { if (st.zone === Z.ABOUT) renderAbout(info); });
  }

  function closeAbout() {
    setClass($('about'), 'open', false);
    backToSettings('about');
    updateFocus();
  }

  // MARK: - Shelf editor: which apps, in what order

  function editList() {
    var ids = shelf.map(function (a) { return a.id; });
    return {ids: ids, rows: apps.slice().sort(function (a, b) {
      var ia = ids.indexOf(a.id), ib = ids.indexOf(b.id);
      if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      return a.title.toLowerCase() < b.title.toLowerCase() ? -1 : 1;
    })};
  }

  function renderShelfEdit() {
    var box = $('shelfedit').firstChild, e = editList();
    box.innerHTML = '';
    var title = el('div', 'title', box);
    sym('apps', title);
    title.appendChild(document.createTextNode(tr('Shelf')));
    var list = el('div', 'list', box), holder = el('div', 'rows', list);
    list.style.height = Math.min(e.rows.length, 7) * 78 + 'px';
    for (var i = 0; i < e.rows.length; i++) {
      var a = e.rows[i], at = e.ids.indexOf(a.id), row = el('div', 'row', holder, a.title);
      var place = el('span', 'value', row, at >= 0 ? '#' + (at + 1) : tr('shelf|Off'));
      if (at >= 0) sym('check', place).style.marginLeft = '16px';   // on the shelf: a check, as in the pickers
      hover(row, Z.EDIT, i);
    }
    el('div', 'hint', box, tr('OK adds or removes an app. ← → change the order.'));
    updateFocus();
  }

  function openShelfEdit() {
    setClass($('settings'), 'open', false);
    st.zone = Z.EDIT;
    st.edit = 0;
    renderShelfEdit();
    setClass($('shelfedit'), 'open', true);
    updateFocus();
  }

  function editShelf(dx) {
    var e = editList(), app = e.rows[st.edit];
    if (!app) return;
    var ids = e.ids.slice(), at = ids.indexOf(app.id);
    if (dx === 0) {
      if (at >= 0) ids.splice(at, 1);
      else ids.push(app.id);
    } else {
      if (at < 0) return;
      var to = Math.max(0, Math.min(ids.length - 1, at + dx));
      ids.splice(at, 1);
      ids.splice(to, 0, app.id);
    }
    Prefs.set('shelf', ids);
    pickShelf();
    renderShelf();
    var again = editList();
    for (var i = 0; i < again.rows.length; i++) if (again.rows[i].id === app.id) st.edit = i;
    renderShelfEdit();
  }

  // MARK: - Opening things

  function launcher(id, name, params) {
    return function () {
      TV.launch(id, params || null, function (ok) {
        if (!ok) toast(trf("Couldn't open {app}.", {app: name || id}));
      });
    };
  }

  // Litefin (LG) opens a title from its TMDB id: the library's page, else Seerr's to request it.
  function pickParams(p, app) {
    if (p.app !== 'jellyfin' || !/litefin/i.test(app.id)) return null;
    return {tmdbId: p.id, mediaType: p.kind, title: p.title || ''};
  }

  function tvSettings() {
    TV.settings(function (ok) {
      if (!ok) toast(tr("Couldn't open TV Settings"));
    });
  }

  function liveTV() {
    for (var i = 0; i < inputs.length; i++) if (inputs[i].key === 'live') return inputs[i];
    return null;
  }

  function activate() {
    if (st.moving) { endMove(true); return; }
    switch (st.zone) {
      case Z.TOP:
        if (st.top < NT) return;
        if (st.top === NT) { var live = liveTV(); if (live) launcher(live.id, tr('Live TV'))(); }
        else if (st.top === NT + 1) { st.zone = Z.SHELF; openDrawer(); st.drawer = 1 < drawerInputs ? 1 : 0; updateFocus(); }
        else openSettings();
        return;
      case Z.CARDS:
      case Z.HERO:
        var p = cards[st.card], app = p && Data.appFor(p.app);
        if (app) launcher(app.id, app.title, pickParams(p, app))();
        return;
      case Z.SHELF:
        if (shelf[st.shelf]) launcher(shelf[st.shelf].id, shelf[st.shelf].title)();
        return;
      case Z.RESUME:
        if (rowItems[st.resume] && rowItems[st.resume].kind === 'more') openDiscover();
        else if (rowItems[st.resume]) openRowItem(rowItems[st.resume]);
        return;
      case Z.INFO:
        if (infoActions[st.info]) infoActions[st.info].run();
        return;
      case Z.DISCOVER:
        openDiscovered();
        return;
      case Z.DRAWER:
        if (drawerItems[st.drawer]) drawerItems[st.drawer].run();
        return;
      case Z.ALL:
        if (allList[st.all]) launcher(allList[st.all].id, allList[st.all].title)();
        return;
      case Z.MENU:
        if (menuItems[st.menu]) menuItems[st.menu].run();
        return;
      case Z.APPS:
        if (others[st.grid]) launcher(others[st.grid].id, others[st.grid].title)();
        return;
      case Z.SETTINGS:
        if (st.side) { if (rowsNow.length) { st.side = false; st.row = 0; updateFocus(); } return; }
        if (rowsNow[st.row]) { rowsNow[st.row].step(1); if (st.zone === Z.SETTINGS) renderSettings(); }
        return;
      case Z.EDIT:
        editShelf(0);
        return;
      case Z.LANG:
        closeLanguages(true);
        return;
      case Z.CITY:
        activateCity();
        return;
      case Z.KEY:
        activateKey();
        return;
      case Z.SEERR:
        activateSeerr();
        return;
      case Z.ABOUT:
        closeAbout();
        return;
    }
  }

  function selectTab(i) {
    if (i === st.tab) return;
    st.tab = i;
    if (ambient()) st.card = 0;
    renderCards();
  }

  /** ↑ into the carousel, on the pick it showed last; without picks the tabs (or nothing, without a key). */
  function toHero() {
    if (cards.length) { st.zone = Z.HERO; st.card = Math.min(st.card, cards.length - 1); }
    else if (Data.hasKey()) { st.zone = Z.TOP; st.top = st.tab; }
  }

  function move(dx, dy) {
    var tiles = $('tiles').children, cardNodes = $('cards').children;
    if (st.moving) { moveApp(dx, dy); return; }
    switch (st.zone) {
      case Z.SHELF:
        if (dx) st.shelf = Math.max(0, Math.min(shelf.length - 1, st.shelf + dx));
        else if (dy > 0) { openDrawer(); return; }
        else if (dy < 0 && ambient()) {
          // The carousel, on the pick it showed last; without picks the tabs (or nothing, without a key).
          // The carousel is gone from the ambient home: ↑ goes to Keep watching and For you (More opens Discover).
          if (rowItems.length) { st.zone = Z.RESUME; st.resume = Math.min(st.resume, rowItems.length - 1); }
        } else if (dy < 0) {
          if (cards.length) { st.zone = Z.CARDS; st.card = nearest(cardNodes, centerX(tiles[st.shelf])); }
          else { st.zone = Z.TOP; st.top = Data.hasKey() ? st.tab : NT; }
        }
        break;
      case Z.HERO:
        if (dx && cards.length) st.card = (st.card + dx + cards.length) % cards.length;
        else if (dy < 0) { st.zone = Z.TOP; st.top = st.tab; }
        else if (dy > 0) st.zone = rowItems.length ? Z.RESUME : shelf.length ? Z.SHELF : Z.HERO;
        break;
      case Z.DISCOVER:
        moveDiscover(dx, dy);
        break;
      case Z.INFO:
        if (dx) st.info = Math.max(0, Math.min(infoActions.length - 1, st.info + dx));
        break;
      case Z.RESUME:
        if (dx) st.resume = Math.max(0, Math.min(rowItems.length - 1, st.resume + dx));
        else if (dy > 0 && shelf.length) st.zone = Z.SHELF;
        break;
      case Z.CARDS:
        if (dx) st.card = Math.max(0, Math.min(cards.length - 1, st.card + dx));
        else if (dy < 0) { st.zone = Z.TOP; st.top = st.tab; }
        else if (shelf.length) { st.zone = Z.SHELF; st.shelf = nearest(tiles, centerX(cardNodes[st.card])); }
        break;
      case Z.TOP:
        if (dx) {
          // Without the picks the tabs can't hold focus; ambient has no round buttons.
          st.top = Math.max(Data.hasKey() ? 0 : NT, Math.min(ambient() ? NT - 1 : NT + 2, st.top + dx));
          if (st.top < NT) selectTab(st.top);   // as on Apple TV: focusing a tab selects it
        } else if (dy > 0) {
          if (cards.length && ambient()) st.zone = Z.HERO;
          else if (cards.length) { st.zone = Z.CARDS; st.card = Math.min(cards.length - 1, st.top < NT ? 0 : cards.length - 1); }
          else st.zone = Z.SHELF;
        }
        break;
      case Z.DRAWER:
        if (dx) st.drawer = Math.max(0, Math.min(drawerItems.length - 1, st.drawer + dx));
        else if (dy < 0) { closeDrawer(); return; }
        else if (dy > 0 && allList.length && Prefs.ambient()) {
          var keys = document.querySelectorAll('#drawer .key'), cells = document.querySelectorAll('#drawer .cell');
          st.zone = Z.ALL;
          st.all = Math.min(ALL_COLS - 1, nearest(cells, centerX(keys[st.drawer])) % ALL_COLS, allList.length - 1);
        }
        break;
      case Z.ALL:
        var a = st.all + dx + dy * ALL_COLS, lastRow = Math.floor((allList.length - 1) / ALL_COLS);
        if (dy < 0 && st.all < ALL_COLS) {
          st.zone = Z.DRAWER;
          st.drawer = nearest(document.querySelectorAll('#drawer .key'), centerX(document.querySelectorAll('#drawer .cell')[st.all]));
        } else if (a >= 0 && a < allList.length && (dx === 0 || Math.floor(a / ALL_COLS) === Math.floor(st.all / ALL_COLS))) st.all = a;
        else if (dy > 0 && Math.floor(st.all / ALL_COLS) < lastRow) st.all = allList.length - 1;
        break;
      case Z.MENU:
        if (dy) st.menu = Math.max(0, Math.min(menuItems.length - 1, st.menu + dy));
        break;
      case Z.APPS:
        var g = st.grid + dx + dy * 5;
        if (g >= 0 && g < others.length && (dx === 0 || Math.floor(g / 5) === Math.floor(st.grid / 5))) st.grid = g;
        break;
      case Z.SETTINGS:
        if (st.side) {
          var cats = $('settings').querySelectorAll('.cat').length;
          if (dy && st.cat + dy >= 0 && st.cat + dy < cats) { st.cat += dy; st.row = 0; renderSettings(); }
          else if (dx > 0 && rowsNow.length) { st.side = false; st.row = 0; }
          break;
        }
        if (dy) st.row = Math.max(0, Math.min(rowsNow.length - 1, st.row + dy));
        else if (dx && rowsNow[st.row]) {
          var r = rowsNow[st.row];
          // ← on a row without values to go through: back to the categories.
          if (dx < 0 && (r.toggle !== undefined || r.opens || r.value === '›')) st.side = true;
          else if (r.value !== '›') { r.step(dx); if (st.zone === Z.SETTINGS) renderSettings(); }
        }
        break;
      case Z.EDIT:
        if (dy) st.edit = Math.max(0, Math.min(apps.length - 1, st.edit + dy));
        else if (dx) editShelf(dx);
        break;
      case Z.LANG:
        if (dy) st.lang = Math.max(0, Math.min(languageChoices().length - 1, st.lang + dy));
        break;
      case Z.CITY:
        if (dy) st.city = Math.max(0, Math.min(cityRows() - 1, st.city + dy));
        break;
      case Z.KEY:
        if (dy) st.key = Math.max(0, Math.min(keyRows() - 1, st.key + dy));
        break;
      case Z.SEERR:
        if (dy) st.seerr = Math.max(0, Math.min(seerrRows() - 1, st.seerr + dy));
        break;
    }
    updateFocus();
  }

  function back() {
    if (st.moving) { endMove(false); return; }
    if (st.zone === Z.MENU) { if (menuAsk) { menuAsk = false; st.menu = 0; menuShown = ''; updateFocus(); } else closeMenu(); return; }
    if (st.zone === Z.EDIT) {
      setClass($('shelfedit'), 'open', false);
      backToSettings('shelf');
      updateFocus();
      return;
    }
    if (st.zone === Z.LANG) { closeLanguages(false); return; }
    if (st.zone === Z.CITY) { closeCities(false); return; }
    if (st.zone === Z.KEY) { if (keyAsking) askRemoveKey(false); else closeKey(); return; }
    if (st.zone === Z.PHONE) { closePhone(); return; }
    if (st.zone === Z.SEERR) { closeSeerr(); return; }
    if (st.zone === Z.ABOUT) { closeAbout(); return; }
    if (st.zone === Z.SETTINGS && !st.side) { st.side = true; updateFocus(); return; }
    if (st.zone === Z.INFO) { closeInfo(); return; }
    if (st.zone === Z.DISCOVER) { closeDiscover(); return; }
    if (sheetOpen()) { closeSheets(); return; }
    if (st.zone === Z.DRAWER || st.zone === Z.ALL) { closeDrawer(); return; }
    if (st.zone !== Z.SHELF && shelf.length) { st.zone = Z.SHELF; updateFocus(); return; }
    TV.back();
  }

  /** The pointer focuses what it's over (the Magic Remote, or a mouse when previewing). */
  function hover(node, zone, index) {
    node.onmouseover = function () {
      if ((st.zone === Z.DISCOVER) !== (zone === Z.DISCOVER)) return;   // the page covers everything else
      if ((st.zone === Z.INFO) !== (zone === Z.INFO)) return;
      if (st.moving || (st.zone === Z.MENU) !== (zone === Z.MENU)) return;
      if (zone === Z.ALL && st.zone !== Z.DRAWER && st.zone !== Z.ALL) return;
      if (saverOn || (sheetOpen() !== (zone === Z.APPS || zone === Z.SETTINGS || zone === Z.EDIT || zone === Z.LANG || zone === Z.CITY || zone === Z.KEY || zone === Z.SEERR || zone === Z.ABOUT))) return;
      if (zone === Z.DRAWER && st.zone !== Z.DRAWER && st.zone !== Z.ALL) return;
      if (zone !== Z.DRAWER && zone !== Z.ALL && (st.zone === Z.DRAWER || st.zone === Z.ALL) && zone !== Z.SHELF) return;
      if (zone === Z.TOP && index < NT && !Data.hasKey()) return;   // the tabs are hidden without the picks
      if (zone === Z.SHELF && (st.zone === Z.DRAWER || st.zone === Z.ALL)) closeDrawer();
      st.zone = zone;
      if (zone === Z.TOP) { st.top = index; if (index < NT) selectTab(index); }
      else if (zone === Z.CARDS) st.card = index;
      else if (zone === Z.SHELF) st.shelf = index;
      else if (zone === Z.RESUME) st.resume = index;
      else if (zone === Z.INFO) st.info = index;
      else if (zone === Z.DISCOVER) { st.drow = Math.floor(index / 100); discoverCols[st.drow] = index % 100; }
      else if (zone === Z.DRAWER) st.drawer = index;
      else if (zone === Z.ALL) st.all = index;
      else if (zone === Z.MENU) st.menu = index;
      else if (zone === Z.APPS) st.grid = index;
      else if (zone === Z.SETTINGS) { st.row = index; st.side = false; }
      else if (zone === Z.EDIT) st.edit = index;
      else if (zone === Z.LANG) st.lang = index;
      else if (zone === Z.CITY) st.city = index;
      else if (zone === Z.KEY) st.key = index;
      else if (zone === Z.SEERR) st.seerr = index;
      updateFocus();
    };
    node.onclick = function () { node.onmouseover(); activate(); };
  }

  // MARK: - Toast

  var toastTimer = 0;
  function toast(text) {
    var t = $('toast');
    t.textContent = text;
    setClass(t, 'on', true);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { setClass(t, 'on', false); }, 6000);
  }

  // MARK: - Night, clock, screensaver

  var lastNight = null;

  function checkNight() {
    var night = Data.isNight(Date.now());
    setClass(body, 'night', night || ambient());
    if (night === lastNight) return;
    lastNight = night;
    document.documentElement.style.background = night ? '#0B0B0D' : '';
    try { localStorage.setItem('foyer.night', night ? 'true' : 'false'); } catch (e) {}   // for index.html, next start
  }

  var saverOn = false, idleAt = Date.now(), saverIndex = 0, saverTimer = 0, saverPick = null, SAVER_AFTER = 5 * 60000;

  /** The screensaver's photos: picks with an app on the TV. */
  function saverPhotos() {
    return Data.showcase().filter(function (p) { return p.backdrop && Data.usable(p.app); });
  }

  function showSaver() {
    if (ambient()) {
      // The ambient home's screensaver is its landscape alone: the rows and the dock go, the scenery drifts slowly
      // (an OLED's pixels shouldn't hold one picture for hours).
      if (st.zone === Z.DISCOVER || st.zone === Z.MENU || st.zone === Z.INFO) closeOverlays();
      saverOn = true;
      saverPick = null;
      setClass(body, 'saver-scene', true);
      applyScene();
      updateFocus();
      return;
    }
    var photos = saverPhotos();
    saverOn = true;
    saverPick = null;
    var s = $('saver');
    s.innerHTML = '';
    var a = el('div', 'photo', s), b = el('div', 'photo', s);
    el('div', 'shade', s);
    var clock = el('div', 'clock', s);
    el('div', 'time', clock);
    el('div', 'date', clock);
    el('div', 'title', clock);
    var hint = el('div', 'hint', clock);
    var front = a;
    function next() {
      if (!saverOn) return;
      var p = photos.length ? photos[saverIndex++ % photos.length] : null;
      var back = front === a ? b : a;
      if (p) {
        back.style.backgroundImage = 'url(' + Data.image(p.backdrop, 'original') + ')';
        back.style.webkitTransform = back.style.transform = 'scale(1.0)';
        clock.children[2].textContent = p.title;
        saverPick = p;
        // With Watch from the screensaver on, OK opens this title's app (any other key only closes).
        var app = Prefs.saverWatch() && Data.appFor(p.app);
        hint.textContent = app ? trf('Press OK to watch on {app} · any other button to close', {app: app.title}) : '';
        setTimeout(function () {
          setClass(back, 'on', true);
          setClass(front, 'on', false);
          back.style.webkitTransform = back.style.transform = 'scale(1.08) translateX(-1.5%)';
          front = back;
        }, 60);
      }
      tickSaverClock(clock);
      saverTimer = setTimeout(next, 12000);
    }
    setClass(s, 'on', true);
    next();
  }

  function tickSaverClock(clock) {
    var d = new Date();
    clock.firstChild.textContent = formatDate('format|h:mm', d.getTime());
    clock.children[1].textContent = formatDate('format|EEEE, MMMM d', d.getTime());
  }

  function hideSaver() {
    saverOn = false;
    setClass(body, 'saver-scene', false);
    clearTimeout(saverTimer);
    setClass($('saver'), 'on', false);
  }

  function poke(ok) {
    idleAt = Date.now();
    if (!saverOn) return false;
    var app = ok && saverPick && Prefs.saverWatch() && Data.appFor(saverPick.app);
    hideSaver();
    if (app) launcher(app.id, app.title, pickParams(saverPick, app))();
    return true;
  }

  // MARK: - Keys

  document.addEventListener('keydown', function (e) {
    var k = e.keyCode;
    if (poke(k === TV.keys.ok)) { e.preventDefault(); return; }   // the first press only wakes the screen (or OK watches)
    if (typing(k)) return;
    // OK on an app opens it when let go; held, its menu (Move, the shelf, Uninstall). The key repeats while held.
    var holdable = (st.zone === Z.SHELF || st.zone === Z.ALL) ? !!focusedApp()
        : st.zone === Z.DISCOVER ? !!discoverPick() : st.zone === Z.RESUME ? !!rowItems[st.resume] && rowItems[st.resume].kind !== 'more' && !rowItems[st.resume].it.next : false;
    if (k === TV.keys.ok && (okDown || (!st.moving && holdable))) {
      e.preventDefault();
      if (okDown) return;
      okDown = true;
      holdTimer = setTimeout(function () { holdTimer = 0; openMenu(); }, HOLD_MS);
      return;
    }
    if (k === TV.keys.left) move(-1, 0);
    else if (k === TV.keys.right) move(1, 0);
    else if (k === TV.keys.up) move(0, -1);
    else if (k === TV.keys.down) move(0, 1);
    else if (k === TV.keys.ok) activate();
    else if (k === TV.keys.back || k === 27 || k === 8) back();
    else return;
    e.preventDefault();
  });
  document.addEventListener('keyup', function (e) {
    if (e.keyCode !== TV.keys.ok || !okDown) return;
    okDown = false;
    if (holdTimer) { clearTimeout(holdTimer); holdTimer = 0; activate(); }
  });
  document.addEventListener('mousemove', function () { poke(); });

  /**
   * In a text field, the keys type (← → move in the text, Delete erases). OK or the keyboard's Done searches (or saves); Back,
   * its Cancel or ↑ ↓ leave the field. Samsung's keyboard sends Done as 65376 and Cancel as 65385. True: handled here.
   */
  function typing(k) {
    if (st.zone === Z.SEERR && seerrTyping()) {
      var f = seerrFields(), inKey = document.activeElement === f[1];
      if (k === TV.keys.ok || k === 65376) { if (inKey) saveSeerr(); else { f[1].focus(); st.seerr = 1; updateFocus(); } }
      else if (k === TV.keys.back || k === 27 || k === 65385) { document.activeElement.blur(); updateFocus(); }
      else if (k === TV.keys.up || k === TV.keys.down) { document.activeElement.blur(); move(0, k === TV.keys.up ? -1 : 1); }
      return true;
    }
    var sheet = st.zone === Z.CITY ? 'citypick' : st.zone === Z.KEY ? 'keypick' : '';
    if (!sheet || !typingIn(sheet)) return false;
    if (k === TV.keys.ok || k === 65376) { if (st.zone === Z.CITY) searchCity(); else saveKey(); }
    else if (k === TV.keys.back || k === 27 || k === 65385) { closeField(sheet); updateFocus(); }
    else if (k === TV.keys.up || k === TV.keys.down) { closeField(sheet); move(0, k === TV.keys.up ? -1 : 1); }
    return true;   // anything else types into the field
  }

  // MARK: - Start

  function renderAll() {
    renderTop();
    renderQuotes();
    cards = [];
    renderCards();
    renderShelf();
    renderDrawer();
    renderResume();
    renderClock();
    checkNight();
    if (st.zone === Z.SETTINGS) renderSettings();
    updateFocus();
  }

  /** hide_apps in config.properties: left out of the shelf, All Apps and the picks, by id or name (part of it). */
  var HIDE = (CONFIG.hideApps || []).map(function (s) { return s.toLowerCase(); });
  function hidden(app) {
    var id = (app.id || '').toLowerCase(), title = (app.title || '').toLowerCase();
    for (var i = 0; i < HIDE.length; i++) if (id.indexOf(HIDE[i]) >= 0 || title.indexOf(HIDE[i]) >= 0) return true;
    return false;
  }

  // The TV's apps and inputs as last listed: the shelf shows from these at once (the TV takes about half a second).
  var listed = '';
  try { listed = localStorage.getItem('foyer.apps') || ''; } catch (e) {}

  function useApps(list, list2) {
    apps = list.filter(function (a) { return !hidden(a); });
    Data.setApps(apps);
    pickShelf();
    inputs = list2;
  }

  /** Lists the TV's apps and inputs; done(changed): whether they differ from the last list. */
  function loadApps(done) {
    TV.apps(function (list) {
      TV.inputs(function (list2) {
        var now = JSON.stringify({apps: list, inputs: list2}), changed = now !== listed;
        listed = now;
        if (changed) try { localStorage.setItem('foyer.apps', now); } catch (e) {}
        useApps(list, list2);
        if (done) done(changed);
      });
    });
  }

  /** Back to the home screen (the app was opened again): the shelf, everything closed, the first tab. */
  function reset() {
    hideSaver();
    closeSheets();
    st.zone = Z.SHELF;
    st.shelf = 0;
    if (st.tab !== 0) { st.tab = 0; renderCards(); }
    updateFocus();
    restInDrawer();   // drawer_first: out again at once, not only after the TV lists its apps
  }

  Data.onChange(function () {
    renderQuotes();
    renderCards();
    renderPanels();
    renderAmbient();
    renderResume();
    if (st.zone === Z.DISCOVER) renderDiscover();   // only redrawn when its rows changed
    if (ambient()) applyScene();
    checkNight();
    updateFocus();
  });

  /** drawer_first: the home screen rests with the drawer open (shelf in the middle, inputs and weather below). */
  function restInDrawer() {
    if (!CONFIG.drawerFirst || !drawerItems.length || st.zone !== Z.SHELF) return;
    st.zone = Z.DRAWER;
    st.drawer = 0;
    updateFocus();
  }

  function reopened(e) {
    // LG: with handlesRelaunch the app has to come to the front itself, or opening it again while it runs shows nothing.
    if (window.PalmSystem && window.PalmSystem.activate) window.PalmSystem.activate();
    var params = {};
    // The launch's parameters: webOSRelaunch carries them, else PalmSystem has the last ones.
    if (e && e.detail && typeof e.detail === 'object') params = e.detail;
    else try { params = JSON.parse((window.PalmSystem && window.PalmSystem.launchParams) || '{}') || {}; } catch (err) {}
    if (!backFromTrailer(params.closed)) reset();
    loadApps(function (changed) { if (changed) { renderShelf(); renderDrawer(); } restInDrawer(); Data.refresh(); });
  }

  window.addEventListener('resize', fit);
  document.addEventListener('webOSRelaunch', reopened);   // LG: opened again while running
  window.addEventListener('appcontrol', reopened);        // Samsung: the same
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { hideSaver(); return; }
    idleAt = Date.now();
    fireworks();
    loadApps(function (changed) { if (changed) { renderShelf(); renderDrawer(); updateFocus(); } Data.refresh(); });
  });

  I18N.set(Prefs.language());
  checkNight();   // now, from the last forecast: not after the TV lists its apps, with the day look until then
  // LG's screensaver waits only when ours will show: not under a sheet (ours waits there), and not without photos.
  TV.holdScreenSaver(function () { return !sheetOpen() && (ambient() || saverPhotos().length > 0); });
  fit();
  renderTop();
  tickClock();
  var early = null;
  try { early = listed && JSON.parse(listed); } catch (e) {}
  if (early && early.apps) {
    useApps(early.apps, early.inputs || []);
    renderAll();
    if (ambient()) applyScene();
    restInDrawer();
  }
  loadApps(function (changed) {
    if (!early) renderAll();
    else if (changed) { renderShelf(); renderDrawer(); updateFocus(); }
    if (ambient()) applyScene();
    restInDrawer();
    Data.refresh();
  });
  setInterval(function () {
    checkNight();
    Data.refresh();
    if (!saverOn && !sheetOpen() && st.zone !== Z.PHONE && Date.now() - idleAt > SAVER_AFTER) showSaver();
    if (saverOn) tickSaverClock($('saver').querySelector('.clock'));
  }, 30000);

  // For the browser preview and tests.
  window.Foyer = {state: st, sceneNow: sceneNow, holidayAt: holidayAt,
    fakeScene: function (at, wx) { sceneFake = at ? {at: at, wx: wx} : null; applyScene(); }, move: move, activate: activate, back: back, showSaver: showSaver, hideSaver: hideSaver, toast: toast};
})();
