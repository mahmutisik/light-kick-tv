/* Ekranlar: ana sayfa, arama, kanal (canlı + geçmiş yayınlar), oynatıcı. */
(function () {
  'use strict';
  var K = Nav.KEY;
  var stack = [], current = null, lastBackAt = 0;
  // Stream languages offered in the filter (Kick language codes, shown in their own language).
  var LANGS = I18n.languages();
  function loadFilter() {
    var f = Store.get('kickizle.filter', null);
    if (!f || !f.langs) {
      var old = Store.get('kickizle.lang', null);  // from the old Turkish/English tabs
      f = { langs: [old || I18n.getLang()], sort: 'featured' };
    }
    var known = LANGS.map(function (l) { return l.c; });
    f.langs = f.langs.filter(function (c) { return known.indexOf(c) >= 0; });
    if (f.sort !== 'viewers') f.sort = 'featured';
    return f;
  }
  var home = { filter: loadFilter(), cursor: null, items: [], hasMore: false, loading: false, seq: 0 };
  var draft = null, filterOpen = false, newsOpen = false, newsReturn = null;
  var chan = { slug: null, data: null, vods: [], seq: 0, watching: 0 };
  var cats = { page: 1, items: [], hasMore: false, loading: false, seq: 0 };  // games & categories list
  var cat = { data: null, cursor: null, items: [], hasMore: false, loading: false, seq: 0 };  // one category's streams
  var MAX_CARDS = 96;  // more cards than this fill up the TV's memory
  var searchSeq = 0, searchTimer = null, searchXhr = null;
  var followCache = { at: 0, key: '', items: [] }, followSeq = 0;

  function el(id) { return document.getElementById(id); }
  function make(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  }
  /* Lazy images: cards only remember their image URL (data-bg) and load it once they come near the
     visible part of their scroll area: up to ~1 screen below and a little above. Checked after each
     list update and each focus move, so it needs no IntersectionObserver and works on any engine. */
  function bg(node, url, fallback) {
    if (url) node.setAttribute('data-bg', String(url));
    if (url && fallback && fallback !== url) node.setAttribute('data-bg2', String(fallback));
  }
  function cssUrl(u) { return 'url("' + String(u).replace(/"/g, '%22') + '")'; }
  function loadBg(node) {
    var u = node.getAttribute('data-bg');
    if (!u) return;
    var f = node.getAttribute('data-bg2');
    // With a fallback, both are layers: the first on top; if it fails to load, the second shows.
    node.style.backgroundImage = cssUrl(u) + (f ? ', ' + cssUrl(f) : '');
    node.removeAttribute('data-bg');
    node.removeAttribute('data-bg2');
  }
  function scrollerOf(node) {
    while (node && node !== document && !(node.classList && node.classList.contains('scroller'))) node = node.parentNode;
    return node && node !== document ? node : null;
  }
  /* Far-off images are let go again: a decoded 640x360 thumbnail takes about 0.9 MB, so a list
     scrolled down to 96 cards would otherwise keep ~90 MB of pictures. Only images more than ~2
     screens away are released, and only after the list has moved ~1 screen since the last pass. */
  var FAR_PX = 2000, RECHECK_PX = 900;
  function checkLazy(sc) {
    if (!sc || splashOpen) return;  // image decoding waits until the splash is gone (TV CPU is busy then)
    var sr = sc.getBoundingClientRect();
    if (!sr.height) return;  // screen not visible yet; checked again when it is shown
    var nodes = sc.querySelectorAll('[data-bg]'), i, r;
    for (i = 0; i < nodes.length; i++) {
      r = nodes[i].getBoundingClientRect();
      if (r.height && r.bottom >= sr.top - 300 && r.top <= sr.bottom + 950) loadBg(nodes[i]);
    }
    var at = sc.scrollTop, last = sc.getAttribute('data-unload-at');
    if (last !== null && Math.abs(at - Number(last)) < RECHECK_PX) return;
    sc.setAttribute('data-unload-at', String(at));
    var shown = sc.querySelectorAll('[style*="background-image"]');
    for (i = 0; i < shown.length; i++) {
      r = shown[i].getBoundingClientRect();
      if (r.height && (r.bottom < sr.top - FAR_PX || r.top > sr.bottom + FAR_PX)) unloadBg(shown[i]);
    }
  }
  function observeImages(container) {
    var sc = scrollerOf(container);
    if (sc) checkLazy(sc);
    else { var nodes = container.querySelectorAll('[data-bg]'); for (var i = 0; i < nodes.length; i++) loadBg(nodes[i]); }
  }
  function avatar(pic, name) {
    var av = make('span', 'avatar');
    if (pic) bg(av, pic); else { av.textContent = String(name || '?').charAt(0).toUpperCase(); av.className += ' initial'; }
    return av;
  }

  /* ---------- Ekran yığını ---------- */
  function showScreen(id, preferred) {
    var screens = document.querySelectorAll('.screen');
    for (var i = 0; i < screens.length; i++) screens[i].classList.toggle('hidden', screens[i].id !== id);
    current = id;
    Nav.setScope(el(id), preferred);
    var scs = el(id).querySelectorAll('.scroller');
    for (var j = 0; j < scs.length; j++) checkLazy(scs[j]);
  }
  function go(id) {
    if (current) stack.push({ id: current, focus: Nav.getFocused() });
    showScreen(id);
  }
  function back() {
    if (!stack.length) { tryExit(); return; }
    if (current === 'player') clearTimeout(releaseTimer);
    if (current === 'channel') { stopWatch(); chan.seq++; }  // late answers for the closed page are ignored
    // The screen being closed lets go of its images (they reload lazily if it is opened again).
    if (current !== 'player') { var scs = el(current).querySelectorAll('.scroller'); for (var i = 0; i < scs.length; i++) unloadImages(scs[i]); }
    var prev = stack.pop(), preferred = prev.focus;
    if (prev.id === 'home') {
      if (homeStale) {
        // Watched for a while: the old list was released; load a fresh one and start at the top.
        homeStale = false;
        renderRecent();
        renderContinue();
        renderFollowed(true);
        showScreen('home', el('btnFilter'));
        loadLive(true);
        return;
      }
      // Son izlenenler / takip listesi değişmiş olabilir: yeniden çiz, odağı aynı yerde tut.
      var path = focusPath(prev.focus);
      renderRecent();
      renderContinue();
      renderFollowed(false);
      if (!preferred || !document.body.contains(preferred)) preferred = fromPath(path);
    }
    showScreen(prev.id, preferred);
    if (prev.id === 'channel') { refreshVodProgress(); updateFollowBtn(); }
    else if (prev.id === 'settings') renderSettings();
    else if (prev.id === 'home') { setTimeout(maybeShowNews, 300); checkRecentLive(); }
  }

  /* Memory while watching: after RELEASE_MS in the player, the screens behind it give up their
     images (the home list is dropped and reloaded fresh on return, since its thumbnails, viewer
     counts and live streams are outdated by then anyway). A short look into a stream keeps
     everything as it was. */
  var RELEASE_MS = 120000, releaseTimer = null, homeStale = false;
  function enteredPlayer() {
    clearTimeout(releaseTimer);
    releaseTimer = setTimeout(releaseBackground, RELEASE_MS);
  }
  function releaseBackground() {
    if (current !== 'player') return;
    home.seq++;  // cancel a page that may still be loading
    home.items = []; home.cursor = null; home.hasMore = false; home.loading = false;
    el('liveGrid').innerHTML = '';
    el('followGrid').innerHTML = '';
    homeStale = true;
    // Other screens keep their cards (and the focus position); only their images are let go and
    // reload lazily from the browser cache when the screen is shown again.
    ['channelScroll', 'searchScroll', 'homeScroll', 'settingsScroll', 'categoriesScroll', 'categoryScroll'].forEach(function (id) { unloadImages(el(id)); });
  }
  function unloadImages(container) {
    var nodes = container.querySelectorAll('[style*="background-image"]');
    for (var i = 0; i < nodes.length; i++) unloadBg(nodes[i]);
    container.removeAttribute('data-unload-at');
  }
  /* Give an image back: its URL returns to data-bg, so it loads again when it comes near. */
  function unloadBg(node) {
    var re = /url\(["']?([^"')]+)["']?\)/g, m1 = re.exec(node.style.backgroundImage), m2 = m1 && re.exec(node.style.backgroundImage);
    if (!m1) return;
    node.setAttribute('data-bg', m1[1]);
    if (m2) node.setAttribute('data-bg2', m2[1]);
    node.style.backgroundImage = '';
  }
  function focusPath(node) {
    if (!node || !node.parentNode || !node.parentNode.id) return null;
    return { parent: node.parentNode.id, idx: Array.prototype.indexOf.call(node.parentNode.children, node) };
  }
  function fromPath(p) {
    var c = p && el(p.parent);
    if (!c || !c.children.length) return null;
    return c.children[Math.min(p.idx, c.children.length - 1)];
  }
  /* Bir kapsayıcıyı yeniden çizerken içindeki odağı koru. */
  function redrawKeepFocus(container, draw) {
    var f = Nav.getFocused(), inside = f && container.contains(f), path = inside ? focusPath(f) : null;
    draw();
    if (inside) {
      var target = fromPath(path);
      if (target) Nav.focus(target); else if (current) Nav.setScope(el(current));
    }
  }
  function tryExit() {
    var now = Date.now();
    if (now - lastBackAt < 2500) {
      try { tizen.application.getCurrentApplication().exit(); } catch (e) {}
      return;
    }
    lastBackAt = now;
    Player.toast(I18n.t('exitHint'));
  }

  /* Kick's times: "2026-11-28 16:34:52" (UTC) or ISO with a zone. -> ms, or NaN */
  function parseTime(s) {
    if (!s) return NaN;
    s = String(s);
    return new Date(s.replace(' ', 'T') + (/Z|[+-]\d\d:?\d\d$/.test(s) ? '' : 'Z')).getTime();
  }
  /* How long a live stream has been on: "2 h 15 m" style, in the interface language. */
  function liveFor(started) {
    var mins = Math.floor((Date.now() - parseTime(started)) / 60000);
    if (!(mins >= 1)) return '';
    var h = Math.floor(mins / 60);
    return h ? I18n.t('durHM', { h: h, m: mins % 60 }) : I18n.t('durM', { m: mins });
  }

  /* ---------- Kartlar ---------- */
  function liveCard(x) {
    var c = make('div', 'card focusable'), th = make('div', 'thumb');
    bg(th, x.thumb);
    th.appendChild(make('span', 'badge live', I18n.t('live')));
    th.appendChild(make('span', 'corner', '● ' + I18n.t('viewers', { n: I18n.number(x.viewers) })));
    var on = liveFor(x.started);
    if (on) th.appendChild(make('span', 'corner left', on));
    c.appendChild(th);
    var body = make('div', 'card-body');
    body.appendChild(make('div', 'card-title', x.title));
    var sub = make('div', 'card-sub');
    sub.appendChild(make('b', '', x.name));
    if (x.category) sub.appendChild(document.createTextNode(' · ' + x.category));
    body.appendChild(sub);
    c.appendChild(body);
    c.onclick = function () { openChannel(x.slug, true); };
    return c;
  }
  function channelCard(x) {
    var c = make('div', 'card focusable');
    c.appendChild(avatar(x.pic, x.name));
    var body = make('div', 'card-body');
    var title = make('div', 'card-title', x.name);
    if (x.live) { title.appendChild(document.createTextNode(' ')); title.appendChild(make('span', 'badge live', I18n.t('live'))); }
    body.appendChild(title);
    body.appendChild(make('div', 'card-sub', I18n.t('followers', { n: I18n.number(x.followers) })));
    c.appendChild(body);
    c.onclick = function () { openChannel(x.slug, x.live); };
    return c;
  }
  function vodDate(s) {
    var d = new Date(String(s).replace(' ', 'T') + (/Z|[+-]\d\d:?\d\d$/.test(s) ? '' : 'Z'));
    if (isNaN(d.getTime())) return '';
    var days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(d.getTime()).setHours(0, 0, 0, 0)) / 86400000);
    if (days <= 0) return I18n.t('today');
    if (days === 1) return I18n.t('yesterday');
    if (days < 7) return I18n.t('daysAgo', { n: days });
    try { return d.toLocaleDateString(I18n.locale(), { day: 'numeric', month: 'short', year: 'numeric' }); }
    catch (e) { return d.getDate() + '.' + (d.getMonth() + 1) + '.' + d.getFullYear(); }
  }
  function fmtDur(s) {
    s = Math.floor(s || 0);
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return (h ? h + ':' + (m < 10 ? '0' : '') + m : m) + ':' + (x < 10 ? '0' : '') + x;
  }
  function vodCard(v, onHome) {
    var c = make('div', 'card focusable'), th = make('div', 'thumb');
    bg(th, v.thumb, v.thumbFallback);
    if (v.ongoing) th.appendChild(make('span', 'badge ongoing', I18n.t('ongoing')));
    else if (v.duration) th.appendChild(make('span', 'corner', fmtDur(v.duration)));
    // Came out since your last visit to this channel (and not started yet): NEW.
    if (!onHome && !v.ongoing && chan.since && parseTime(v.created) > chan.since && !Store.getResume(v.id) && !Store.isWatched(v.id))
      th.appendChild(make('span', 'badge new', I18n.t('newBadge')));
    showProgress(th, v);
    c.appendChild(th);
    var body = make('div', 'card-body');
    body.appendChild(make('div', 'card-title', v.title));
    var sub = make('div', 'card-sub'), parts = [vodDate(v.created)];
    if (onHome) { sub.appendChild(make('b', '', v.channel)); parts.unshift(''); }
    else {
      if (v.views) parts.push(I18n.t('views', { n: I18n.number(v.views) }));
      if (v.category) parts.push(v.category);
    }
    sub.appendChild(document.createTextNode(parts.join(' · ')));
    body.appendChild(sub);
    c.appendChild(body);
    c.onclick = function () { playVod(v); };
    return c;
  }
  function categoryCard(x) {
    var c = make('div', 'card focusable'), th = make('div', 'cat-thumb');
    bg(th, x.banner);
    c.appendChild(th);
    var body = make('div', 'card-body');
    body.appendChild(make('div', 'card-title', x.name));
    body.appendChild(make('div', 'card-sub', x.viewers ? I18n.t('viewers', { n: I18n.number(x.viewers) }) : '\u00a0'));
    c.appendChild(body);
    c.onclick = function () { openCategory(x); };
    return c;
  }
  function clipCard(v) {
    var c = make('div', 'card focusable'), th = make('div', 'thumb');
    bg(th, v.thumb);
    if (v.duration) th.appendChild(make('span', 'corner', fmtDur(v.duration)));
    c.appendChild(th);
    var body = make('div', 'card-body');
    body.appendChild(make('div', 'card-title', v.title));
    var parts = [vodDate(v.created)];
    if (v.views) parts.push(I18n.t('views', { n: I18n.number(v.views) }));
    if (v.category) parts.push(v.category);
    body.appendChild(make('div', 'card-sub', parts.join(' · ')));
    c.appendChild(body);
    c.onclick = function () { playClip(v); };
    return c;
  }
  /* Load the next page when the focus gets near the end of a growing grid. */
  function pagedCard(card, grid, state, loadMore) {
    card.onfocusnav = function () {
      var cards = grid.children, idx = Array.prototype.indexOf.call(cards, card);
      if (state.hasMore && !state.loading && idx >= cards.length - 6) loadMore();
    };
    return card;
  }
  /* Where you are in a past broadcast (green bar); watched to the end: a full bar and a label. */
  function showProgress(th, v) {
    var bar = th.querySelector('.resume'), tag = th.querySelector('.badge.watched');
    var r = Store.getResume(v.id), d = r && (r.d || v.duration), watched = !v.ongoing && Store.isWatched(v.id);
    var pct = r && r.t && d ? Math.min(100, r.t / d * 100) : watched ? 100 : 0;
    if (pct) {
      if (!bar) { bar = make('div', 'resume'); th.appendChild(bar); }
      bar.style.width = pct + '%';
    } else if (bar) th.removeChild(bar);
    if (watched && !tag) th.appendChild(make('span', 'badge watched', I18n.t('watched')));
    else if (!watched && tag) th.removeChild(tag);
    var fresh = th.querySelector('.badge.new');
    if (fresh && (pct || watched)) th.removeChild(fresh);
  }
  function retryButton(fn) {
    var b = make('button', 'btn focusable', I18n.t('loadFailed'));
    b.onclick = fn;
    return b;
  }

  /* ---------- Ana sayfa ---------- */
  function renderRecent() {
    var list = Store.recent(), wrap = el('recentWrap'), box = el('recentList');
    box.innerHTML = '';
    wrap.classList.toggle('hidden', !list.length);
    list.forEach(function (x) {
      var chip = make('div', 'chip focusable' + (recentLive.on[x.slug] ? ' is-live' : ''));
      chip.setAttribute('data-slug', x.slug);
      chip.appendChild(avatar(x.pic, x.name));
      chip.appendChild(make('span', '', x.name));
      chip.onclick = function () { openChannel(x.slug, false); };
      box.appendChild(chip);
    });
    observeImages(box);
  }
  /* Recently watched channels that are live now get a red dot. At most one small request per
     channel, at most once a minute, and only on the home screen after start-up. */
  var recentLive = { on: {}, at: 0, seq: 0 };
  function checkRecentLive() {
    var list = Store.recent();
    if (splashOpen || current !== 'home' || !list.length || Date.now() - recentLive.at < 60000) return;
    var my = ++recentLive.seq, res = {}, idx = 0, active = 0, finished = 0;
    recentLive.at = Date.now();
    function next() {
      while (active < 4 && idx < list.length) {
        active++;
        (function (slug) {
          Api.livestream(slug, function (err, ls) {
            active--; finished++;
            if (my !== recentLive.seq) return;
            res[slug] = !err && !!ls;
            if (finished < list.length) { next(); return; }
            recentLive.on = res;
            var chips = el('recentList').children;
            for (var i = 0; i < chips.length; i++) chips[i].classList.toggle('is-live', !!res[chips[i].getAttribute('data-slug')]);
          });
        }(list[idx++].slug));
      }
    }
    next();
  }
  /* "Continue watching": the last 4 half-watched past broadcasts, one row. */
  function renderContinue() {
    var list = Store.continueList(4), grid = el('continueGrid');
    el('continueWrap').classList.toggle('hidden', !list.length);
    redrawKeepFocus(grid, function () {
      grid.innerHTML = '';
      list.forEach(function (v) { grid.appendChild(vodCard(v, true)); });
    });
    observeImages(grid);
  }
  function langName(c) { for (var i = 0; i < LANGS.length; i++) if (LANGS[i].c === c) return LANGS[i].n; return c; }
  function langsSummary(f) {
    return !f.langs.length ? I18n.t('allLangsShort')
      : f.langs.length <= 2 ? f.langs.map(langName).join(', ')
      : langName(f.langs[0]) + ', ' + langName(f.langs[1]) + ' +' + (f.langs.length - 2);
  }
  function filterSummary(f) {
    return langsSummary(f) + '  ·  ' + I18n.t(f.sort === 'viewers' ? 'sortViewers' : 'sortFeatured');
  }
  function renderHomeHeader() {
    el('filterSummary').textContent = filterSummary(home.filter);
    el('liveTitle').textContent = I18n.t('liveStreams') + '  ·  ' + filterSummary(home.filter);
  }

  /* ---------- Stream filter ----------
     The panel edits a copy (draft). Nothing is fetched while choosing; "Apply" reloads the list
     once, and only if something actually changed. Back / "Cancel" throws the draft away. */
  function openFilter() {
    draft = { langs: home.filter.langs.slice(), sort: home.filter.sort };
    filterOpen = true;
    renderFilter();
    el('filterLayer').classList.remove('hidden');
    Nav.setScope(el('filterLayer'), el('filterLangs').querySelector('.active') || null);
  }
  function renderFilter() {
    var langsBox = el('filterLangs'), sortBox = el('filterSort');
    function chip(label, active, onClick) {
      var b = make('button', 'pill focusable' + (active ? ' active' : ''), (active ? '\u2713  ' : '') + label);
      b.onclick = function () { onClick(); renderFilter(); };
      return b;
    }
    redrawKeepFocus(langsBox, function () {
      langsBox.innerHTML = '';
      langsBox.appendChild(chip(I18n.t('allLanguages'), !draft.langs.length, function () { draft.langs = []; }));
      LANGS.forEach(function (l) {
        langsBox.appendChild(chip(l.n, draft.langs.indexOf(l.c) >= 0, function () {
          var i = draft.langs.indexOf(l.c);
          if (i >= 0) draft.langs.splice(i, 1); else draft.langs.push(l.c);
        }));
      });
    });
    redrawKeepFocus(sortBox, function () {
      sortBox.innerHTML = '';
      sortBox.appendChild(chip(I18n.t('sortFeatured'), draft.sort === 'featured', function () { draft.sort = 'featured'; }));
      sortBox.appendChild(chip(I18n.t('sortViewers'), draft.sort === 'viewers', function () { draft.sort = 'viewers'; }));
    });
    el('filterHint').textContent = !draft.langs.length && draft.sort === 'featured' ? I18n.t('featuredAllNote') : I18n.t('filterHint');
  }
  function closeFilter(apply) {
    filterOpen = false;
    el('filterLayer').classList.add('hidden');
    var cur = home.filter, next = draft;
    draft = null;
    var changed = apply && (next.sort !== cur.sort || next.langs.slice().sort().join() !== cur.langs.slice().sort().join());
    if (changed) {
      home.filter = next;
      Store.set('kickizle.filter', next);
      renderHomeHeader();
      loadLive(true);
    }
    Nav.setScope(el('home'), el('btnFilter'));
    maybeShowNews();
  }

  /* Takip edilen kanallardan canlı olanlar (en fazla 4 istek aynı anda, 1 dk önbellek). */
  function renderFollowed(force) {
    var list = Store.follows(), wrap = el('followWrap'), grid = el('followGrid'), note = el('followNote');
    wrap.classList.toggle('hidden', !list.length);
    if (!list.length) { grid.innerHTML = ''; return; }
    var key = list.map(function (x) { return x.slug; }).join(',');
    if (!force && followCache.key === key && Date.now() - followCache.at < 60000) { drawFollowed(followCache.items); return; }
    var my = ++followSeq, results = [], idx = 0, active = 0, finished = 0;
    if (!grid.children.length) note.textContent = I18n.t('loading');
    function after() {
      if (finished === list.length) {
        results.sort(function (a, b) { return b.viewers - a.viewers; });
        followCache = { at: Date.now(), key: key, items: results };
        drawFollowed(results);
      } else next();
    }
    function next() {
      while (active < 4 && idx < list.length) {
        active++;
        (function (f) {
          Api.livestream(f.slug, function (err, ls) {
            active--; finished++;
            if (my !== followSeq) return;
            if (!err && ls) results.push({ slug: f.slug, name: f.name, pic: f.pic, title: ls.title, viewers: ls.viewers, category: ls.category, thumb: ls.thumb, started: ls.started });
            after();
          });
        }(list[idx++]));
      }
    }
    next();
  }
  function drawFollowed(items) {
    var grid = el('followGrid'), note = el('followNote');
    redrawKeepFocus(grid, function () {
      grid.innerHTML = '';
      items.forEach(function (x) { grid.appendChild(liveCard(x)); });
    });
    observeImages(grid);
    note.textContent = items.length ? '' : I18n.t('noFollowedLive');
  }

  /* ---------- Ayarlar ---------- */
  function openSettings() {
    go('settings');
    renderSettings();
    Nav.setScope(el('settings'));
  }
  function renderSettings() {
    var langBox = el('uiLangs');
    redrawKeepFocus(langBox, function () {
      langBox.innerHTML = '';
      I18n.languages().forEach(function (l) {
        var on = l.c === I18n.getLang(), b = make('button', 'pill focusable' + (on ? ' active' : ''), (on ? '\u2713  ' : '') + l.n);
        b.onclick = function () { setUiLang(l.c); };
        langBox.appendChild(b);
      });
    });
    var box = el('followList'), list = Store.follows();
    redrawKeepFocus(box, function () {
      box.innerHTML = '';
      list.forEach(function (x, n) {
        var row = make('div', 'follow-row'), chip = make('div', 'chip focusable'), rm = make('button', 'btn focusable', I18n.t('remove'));
        row.id = 'followRow' + n;
        chip.appendChild(avatar(x.pic, x.name));
        chip.appendChild(make('span', '', x.name));
        chip.onclick = function () { openChannel(x.slug, false); };
        rm.onclick = function () {
          Store.unfollow(x.slug);
          followCache.at = 0;
          Player.toast(I18n.t('unfollowedToast', { name: x.name }));
          renderSettings();
          if (!el('followRow' + n)) { var up = el('followRow' + (n - 1)); Nav.focus(up ? up.querySelector('.btn') : el('aboutRow')); }
        };
        row.appendChild(chip);
        row.appendChild(rm);
        box.appendChild(row);
      });
    });
    observeImages(box);
    // Silinen satırın yerine bir sonrakinin "Kaldır" düğmesine odaklan.
    var f = Nav.getFocused();
    if (current === 'settings' && (!f || !document.body.contains(f))) Nav.setScope(el('settings'));
    el('followListNote').textContent = list.length ? '' : I18n.t('noFollows');
    renderAbout();
  }
  function setUiLang(lang) {
    if (lang === I18n.getLang()) return;
    I18n.setLang(lang);
    renderSettings();
    renderHomeHeader();
    loadLive(true);
    followCache.at = 0;
    cats.items = [];  // categories screen redraws with the new texts next time
  }
  function homeCard(x) {
    var grid = el('liveGrid'), card = liveCard(x);
    card.onfocusnav = function () {
      var cards = grid.children, idx = Array.prototype.indexOf.call(cards, card);
      if (home.hasMore && !home.loading && idx >= cards.length - 4) loadLive(false);
    };
    return card;
  }
  function loadLive(reset) {
    if (home.loading && !reset) return;
    var my = ++home.seq, grid = el('liveGrid'), note = el('liveNote');
    if (reset) { home.cursor = null; home.items = []; grid.innerHTML = ''; el('homeScroll').scrollTop = 0; }
    home.loading = true;
    note.innerHTML = ''; note.textContent = I18n.t('loading');
    Api.livestreams(home.filter, home.cursor, function (err, res) {
      if (my !== home.seq) return;
      home.loading = false;
      if (err && splashOpen) { showSplashError(); return; }
      if (!err && splashOpen) warmImages(res.items.slice(0, 12));
      if (!err) homeReady();
      note.textContent = '';
      if (err) { note.appendChild(retryButton(function () { loadLive(false); })); focusInto('home', note.firstChild); return; }
      var seen = {};
      home.items.forEach(function (x) { seen[x.slug] = true; });
      var fresh = res.items.filter(function (x) { return !seen[x.slug]; });
      home.items = home.items.concat(fresh);
      home.cursor = res.next;
      home.hasMore = !!res.next && fresh.length > 0 && home.items.length < MAX_CARDS;
      fresh.forEach(function (x) { grid.appendChild(homeCard(x)); });
      observeImages(grid);
      if (!home.items.length) note.textContent = I18n.t('nothingLive');
      focusInto('home', grid.children[home.items.length - fresh.length]);
    });
  }

  /* The first screen's thumbnails are downloaded during the splash (the network is idle then), but
     not shown or decoded: they come from the cache, ready, when the splash fades. */
  var warm = [];
  function warmImages(items) {
    items.forEach(function (x) { if (x.thumb) { var im = new Image(); im.src = x.thumb; warm.push(im); } });
  }

  /* ---------- Start-up splash ---------- */
  var splashOpen = !!document.getElementById('splash');
  var followPending = false, splashError = false, splashWatch = null, START_TIMEOUT_MS = 10000;
  function watchStart() {
    clearTimeout(splashWatch);
    splashWatch = setTimeout(function () { if (splashOpen && home.loading) showSplashError(); }, START_TIMEOUT_MS);
  }
  function showSplashError() {
    if (!splashOpen) return;
    clearTimeout(splashWatch);
    splashError = true;
    el('splashErr').textContent = I18n.t('startError');
    el('splashHint').textContent = I18n.t('startRetry');
    el('splashBar').classList.add('hidden');
    el('splashMsg').classList.remove('hidden');
  }
  function retryStart() {
    splashError = false;
    el('splashMsg').classList.add('hidden');
    el('splashBar').classList.remove('hidden');
    watchStart();
    loadLive(true);
  }
  function hideSplash() {
    var s = el('splash');
    if (!splashOpen || !s || s.classList.contains('out')) return;  // already fading or gone
    clearTimeout(splashWatch);
    s.classList.add('out');
    if (followPending) { followPending = false; renderFollowed(true); }  // network only: fine during the fade
    setTimeout(checkRecentLive, 1500);
    setTimeout(function () {
      splashOpen = false;
      warm = [];  // the cards use the cached files now
      if (s.parentNode) s.parentNode.removeChild(s);
      var scs = current ? el(current).querySelectorAll('.scroller') : [];
      for (var i = 0; i < scs.length; i++) checkLazy(scs[i]);  // now load the thumbnails
      setTimeout(maybeShowNews, 400);
      setTimeout(function () { checkUpdate(false); }, 4000);  // well after start-up
    }, 480);
  }
  // Called when the first live list request finishes: keep the splash up at least ~1 s overall,
  // so on a fast connection the logo still finishes its fade-in and shows for a moment.
  function homeReady() {
    var shown = window.performance && performance.now ? performance.now() : 0;
    setTimeout(hideSplash, Math.max(0, 1000 - shown));
  }

  /* ---------- Games & categories ---------- */
  function openCategories() {
    go('categories');
    if (cats.items.length) { Nav.setScope(el('categories')); return; }
    loadCategories(true);
  }
  function loadCategories(reset) {
    if (cats.loading && !reset) return;
    var my = ++cats.seq, grid = el('catGrid'), note = el('catNote');
    if (reset) { cats.page = 1; cats.items = []; grid.innerHTML = ''; el('categoriesScroll').scrollTop = 0; }
    cats.loading = true;
    note.innerHTML = ''; note.textContent = I18n.t('loading');
    Api.categories(cats.page, function (err, res) {
      if (my !== cats.seq) return;
      cats.loading = false;
      note.textContent = '';
      if (err) { note.appendChild(retryButton(function () { loadCategories(false); })); focusInto('categories'); return; }
      var seen = {};
      cats.items.forEach(function (x) { seen[x.id] = true; });
      var fresh = res.items.filter(function (x) { return !seen[x.id]; });
      cats.items = cats.items.concat(fresh);
      cats.page = res.next || cats.page;
      cats.hasMore = !!res.next && fresh.length > 0 && cats.items.length < MAX_CARDS;
      fresh.forEach(function (x) { grid.appendChild(pagedCard(categoryCard(x), grid, cats, function () { loadCategories(false); })); });
      observeImages(grid);
      if (!cats.items.length) note.textContent = I18n.t('noResults');
      focusInto('categories');
    });
  }
  /* A screen that had nothing to focus yet (still loading): focus its first card once there is one. */
  function focusInto(id, preferred) {
    var f = Nav.getFocused();
    if (current === id && (!f || !el(id).contains(f) || !f.offsetWidth)) Nav.setScope(el(id), preferred);
  }
  /* One game / category: its live streams, most watched first, in the home filter's languages. */
  function openCategory(c) {
    if (current === 'search') Store.addSearch(searchQuery());
    go('category');
    cat.data = c;
    el('catTitle').textContent = c.name;
    el('catSub').textContent = langsSummary(home.filter);
    loadCategoryLive(true);
  }
  function loadCategoryLive(reset) {
    if (cat.loading && !reset) return;
    var my = ++cat.seq, grid = el('catLiveGrid'), note = el('catLiveNote');
    if (reset) { cat.cursor = null; cat.items = []; grid.innerHTML = ''; el('categoryScroll').scrollTop = 0; }
    cat.loading = true;
    note.innerHTML = ''; note.textContent = I18n.t('loading');
    Api.livestreams({ langs: home.filter.langs, sort: 'viewers', category: cat.data.id }, cat.cursor, function (err, res) {
      if (my !== cat.seq) return;
      cat.loading = false;
      note.textContent = '';
      if (err) { note.appendChild(retryButton(function () { loadCategoryLive(false); })); focusInto('category'); return; }
      var seen = {};
      cat.items.forEach(function (x) { seen[x.slug] = true; });
      var fresh = res.items.filter(function (x) { return !seen[x.slug]; });
      cat.items = cat.items.concat(fresh);
      cat.cursor = res.next;
      cat.hasMore = !!res.next && fresh.length > 0 && cat.items.length < MAX_CARDS;
      fresh.forEach(function (x) { grid.appendChild(pagedCard(liveCard(x), grid, cat, function () { loadCategoryLive(false); })); });
      observeImages(grid);
      if (!cat.items.length) note.textContent = I18n.t('noCategoryStreams');
      focusInto('category');
    });
  }

  /* ---------- Arama ---------- */
  function searchQuery() { return el('searchInput').value.replace(/^\s+|\s+$/g, ''); }
  /* Son aramalar: kutu boşken (ya da sonuç yokken) arama kutusunun altında gösterilir. */
  function renderHistory() {
    var list = Store.searches(), wrap = el('historyWrap'), box = el('historyList');
    var show = list.length > 0 && searchQuery().length < 2;
    wrap.classList.toggle('hidden', !show);
    if (!show) return;
    redrawKeepFocus(box, function () {
      box.innerHTML = '';
      list.forEach(function (q) {
        var b = make('button', 'pill focusable', q);
        b.onclick = function () {
          el('searchInput').value = q;
          Store.addSearch(q);
          renderHistory();
          runSearch();
        };
        box.appendChild(b);
      });
      var clear = make('button', 'pill muted-pill focusable', I18n.t('clearHistory'));
      clear.onclick = function () {
        Store.clearSearches();
        renderHistory();
        Nav.focus(el('searchInput'));
      };
      box.appendChild(clear);
    });
  }
  function runSearch() {
    var q = searchQuery(), grid = el('searchGrid'), note = el('searchNote');
    var my = ++searchSeq;
    if (searchXhr) { try { searchXhr.abort(); } catch (e) {} }
    renderHistory();
    var catBox = el('searchCats');
    function clear() {
      grid.innerHTML = ''; catBox.innerHTML = '';
      el('searchCatWrap').classList.add('hidden'); el('searchChanTitle').classList.add('hidden');
    }
    if (q.length < 2) { clear(); note.textContent = Store.searches().length ? '' : I18n.t('searchHint'); return; }
    note.textContent = I18n.t('loading');
    searchXhr = Api.search(q, function (err, res) {
      if (my !== searchSeq) return;
      clear();
      note.textContent = '';
      if (err) { note.appendChild(retryButton(runSearch)); focusInto('search', note.firstChild); return; }
      var list = res.channels, games = res.categories;
      if (!list.length && !games.length) { note.textContent = I18n.t('noResults'); focusInto('search', el('searchInput')); return; }
      // Games first (most watched first, one row), then channels.
      games.sort(function (a, b) { return b.viewers - a.viewers; });
      games.slice(0, 6).forEach(function (x) { catBox.appendChild(categoryCard(x)); });
      el('searchCatWrap').classList.toggle('hidden', !games.length);
      el('searchChanTitle').classList.toggle('hidden', !games.length || !list.length);
      list.sort(function (a, b) { return (b.live - a.live) || (b.followers - a.followers); });
      list.forEach(function (x) { grid.appendChild(channelCard(x)); });
      observeImages(el('searchScroll'));
      if (current === 'search' && document.activeElement !== el('searchInput')) Nav.focus(catBox.children[0] || grid.children[0]);
      else focusInto('search', el('searchInput'));
    });
  }
  function openSearch() {
    go('search');
    var input = el('searchInput');
    input.placeholder = I18n.t('searchPlaceholder');
    renderHistory();
    if (!el('searchGrid').children.length && !el('searchCats').children.length) el('searchNote').textContent = Store.searches().length ? '' : I18n.t('searchHint');
    // Klavyeyi kendiliğinden açma: Samsung klavyesi geç açılıyor ve son aramalardan birini seçerken
    // önce kapatmak gerekiyordu. Kutu odakta bekler; OK ile klavye açılır, ↓ ile son aramalara inilir.
    Nav.focus(input);
  }

  /* ---------- Kanal ---------- */
  function openChannel(slug, focusLive) {
    if (current === 'search') Store.addSearch(searchQuery());  // aramadan bir kanala girildiyse aramayı kaydet
    var my = ++chan.seq;
    chan.slug = slug; chan.data = null; chan.vods = []; chan.clips = null;
    // Last visit (for NEW labels), then remember this one; the 60 most recent channels.
    var visits = Store.get('kickizle.visits', {}) || {};
    chan.since = visits[slug] || 0;
    visits[slug] = Date.now();
    var vs = Object.keys(visits).sort(function (a, b) { return visits[b] - visits[a]; });
    for (var vi = 60; vi < vs.length; vi++) delete visits[vs[vi]];
    Store.set('kickizle.visits', visits);
    el('channelScroll').scrollTop = 0;
    el('chAvatar').style.backgroundImage = '';
    el('chAvatar').removeAttribute('src');
    el('chName').textContent = slug;
    el('chMeta').textContent = I18n.t('loading');
    el('chTitle').textContent = '';
    el('chLive').classList.add('hidden');
    el('btnWatchLive').classList.add('hidden');
    el('btnFollow').classList.add('hidden');
    el('vodGrid').innerHTML = '';
    el('vodNote').textContent = I18n.t('loading');
    el('clipGrid').innerHTML = '';
    el('clipNote').textContent = I18n.t('loading');
    showTab('vods');
    stopWatch();
    go('channel');
    var pending = 2, openFocus = Nav.getFocused();
    function done() {
      if (--pending !== 0 || my !== chan.seq) return;
      var f = Nav.getFocused();
      if (current === 'channel' && (f === openFocus || !f || !f.offsetWidth))
        Nav.setScope(el('channel'), chan.data && chan.data.live && focusLive !== false ? el('btnWatchLive') : el('btnFollow'));
      // A stream is likely next: parse the player library (~380 KB) now that the page is drawn,
      // instead of while the channel's info and broadcasts are being put on screen.
      setTimeout(Player.preload, 150);
    }

    Api.channel(slug, function (err, ch) {
      if (my !== chan.seq) return;
      if (err) { el('chMeta').textContent = ''; el('chMeta').appendChild(retryButton(function () { back(); openChannel(slug, focusLive); })); done(); return; }
      chan.data = ch;
      showChannelInfo(ch);
      el('btnFollow').classList.remove('hidden');
      updateFollowBtn();
      Store.addRecent({ slug: ch.slug, name: ch.name, pic: ch.pic });
      if (!ch.live) startWatch(slug, my);
      done();
    });
    Api.videos(slug, function (err, vods) {
      if (my !== chan.seq) return;
      el('vodNote').textContent = '';
      if (err) { el('vodNote').appendChild(retryButton(function () { back(); openChannel(slug, focusLive); })); done(); return; }
      chan.vods = vods;
      vods.forEach(function (v) { el('vodGrid').appendChild(vodCard(v)); });
      observeImages(el('vodGrid'));
      if (!vods.length) el('vodNote').textContent = I18n.t('noVods');
      done();
    });
  }
  /* Past broadcasts or clips: only one list is on the page, so clips don't sit below 20+ broadcasts. */
  function showTab(which) {
    var clips = which === 'clips';
    el('tabVods').classList.toggle('active', !clips);
    el('tabClips').classList.toggle('active', clips);
    el('vodSection').classList.toggle('hidden', clips);
    el('clipSection').classList.toggle('hidden', !clips);
    if (clips && !chan.clips) loadClips();
    checkLazy(el('channelScroll'));  // the list just shown may have images still to load
  }
  /* Clips are fetched the first time their tab is opened, not with every channel page. */
  function loadClips() {
    var my = chan.seq, slug = chan.slug, grid = el('clipGrid'), note = el('clipNote');
    chan.clips = 'loading';
    note.innerHTML = ''; note.textContent = I18n.t('loading');
    Api.clips(slug, function (err, list) {
      if (my !== chan.seq) return;
      note.textContent = '';
      if (err) { chan.clips = null; note.appendChild(retryButton(loadClips)); focusInto('channel', note.firstChild); return; }
      chan.clips = list;
      list.forEach(function (v) { grid.appendChild(clipCard(v)); });
      observeImages(grid);
      if (!list.length) note.textContent = I18n.t('noClips');
      focusInto('channel', grid.children[0] || el('tabClips'));
    });
  }
  function showChannelInfo(ch) {
    if (ch.pic) el('chAvatar').src = ch.pic;
    el('chName').textContent = ch.name;
    el('chLive').textContent = I18n.t('live');
    el('chLive').classList.toggle('hidden', !ch.live);
    el('chMeta').textContent = I18n.t('followers', { n: I18n.number(ch.followers) }) +
      (ch.live ? ' · ' + I18n.t('viewers', { n: I18n.number(ch.viewers) }) + (ch.category ? ' · ' + ch.category : '') : ' · ' + I18n.t('offline'));
    el('chTitle').textContent = ch.title;
    el('btnWatchLive').classList.toggle('hidden', !ch.live);
    if (ch.live && Date.now() - ch.fetchedAt < 90000) Player.prefetch(ch.playbackUrl);
  }

  /* Offline channel: while its page is open (and the app is in front), ask every 15 s whether the
     stream has started; one small request each time. When it has, the page switches to live and a
     message says so. Nothing starts playing by itself. */
  var WATCH_MS = 15000, watchTimer = null;
  function startWatch(slug, my) {
    chan.watching = my;
    clearTimeout(watchTimer);
    watchTimer = setTimeout(function () { watchTick(slug, my); }, WATCH_MS);
  }
  function stopWatch() { chan.watching = 0; clearTimeout(watchTimer); }
  function watchTick(slug, my) {
    if (chan.watching !== my || chan.seq !== my) return;
    if (current !== 'channel' || document.hidden) { startWatch(slug, my); return; }  // e.g. watching a past broadcast
    Api.livestream(slug, function (err, ls) {
      if (chan.watching !== my || chan.seq !== my) return;
      if (err || !ls) { startWatch(slug, my); return; }
      Api.channel(slug, function (e2, ch) {
        if (chan.watching !== my || chan.seq !== my) return;
        if (e2 || !ch.live) { startWatch(slug, my); return; }  // stream link not ready yet: next round
        stopWatch();
        chan.data = ch;
        showChannelInfo(ch);
        var f = Nav.getFocused();
        if (current === 'channel' && (!f || f === el('btnFollow'))) Nav.focus(el('btnWatchLive'));
        Player.toast(I18n.t('wentLive', { name: ch.name }), 6000);
      }, true);
    });
  }
  function updateFollowBtn() {
    var b = el('btnFollow'), on = !!(chan.data && Store.isFollowed(chan.data.slug));
    b.textContent = I18n.t(on ? 'following' : 'follow');
    b.classList.toggle('followed', on);
  }
  function toggleFollow() {
    var ch = chan.data;
    if (!ch) return;
    if (Store.isFollowed(ch.slug)) { Store.unfollow(ch.slug); Player.toast(I18n.t('unfollowedToast', { name: ch.name })); }
    else { Store.follow({ slug: ch.slug, name: ch.name, pic: ch.pic }); Player.toast(I18n.t('followedToast', { name: ch.name })); }
    followCache.at = 0;
    updateFollowBtn();
  }
  /* Back from the player: update the resume bars in place (the cards and their images stay). */
  function refreshVodProgress() {
    var cards = el('vodGrid').children;
    chan.vods.forEach(function (v, i) {
      var th = cards[i] && cards[i].firstChild;
      if (th) showProgress(th, v);
    });
  }

  /* ---------- Oynatma ---------- */
  function watchLive() {
    var slug = chan.slug, d = chan.data;
    // A link fetched less than 90 s ago is still valid (Kick's links last ~10 min): start right away.
    if (d && d.live && d.playbackUrl && Date.now() - d.fetchedAt < 90000) { startLive(d); return; }
    Player.toast(I18n.t('loadingStream'));
    // Yayın linkindeki anahtar kısa ömürlü; izlemeden hemen önce tazele.
    Api.channel(slug, function (err, ch) {
      if (current !== 'channel' || chan.slug !== slug) return;
      if (err || !ch.live) { Player.toast(err ? I18n.t('loadFailed') : I18n.t('offline')); return; }
      chan.data = ch;
      startLive(ch);
    }, true);
  }
  function startLive(ch) {
    go('player');
    enteredPlayer();
    var slug = ch.slug;
    Player.open({
      kind: 'live', url: ch.playbackUrl, channelName: ch.name, title: ch.title,
      channelId: ch.id, chatroomId: ch.chatroomId, viewers: ch.viewers,
      getViewers: function (cb) { Api.livestream(slug, function (err, ls) { cb(!err && ls ? ls.viewers : 0); }); },
      // Rewind: the running stream's recording (the "ongoing" past broadcast), fetched fresh if the
      // cached list doesn't have it yet.
      getRecording: function (cb) {
        function pick(vods) { for (var i = 0; vods && i < vods.length; i++) if (vods[i].ongoing) return vods[i]; return null; }
        Api.videos(slug, function (err, vods) {
          var v = !err && pick(vods);
          if (v) { cb(v.source, v.created); return; }
          Api.videos(slug, function (e2, v2) { var w = !e2 && pick(v2); cb(w ? w.source : null, w ? w.created : null); }, true);
        });
      },
      // Back to live: always a fresh link.
      getLiveUrl: function (cb) { Api.channel(slug, function (err, c) { cb(!err && c.live ? c.playbackUrl : null); }, true); }
    }, back);
  }
  function playVod(v) {
    var name = v.channel || (chan.data ? chan.data.name : chan.slug);
    Store.saveContinue({ id: v.id, source: v.source, title: v.title, thumb: v.thumb, thumbFallback: v.thumbFallback,
      duration: v.duration, created: v.created, channel: name, slug: v.slug || chan.slug });
    go('player');
    enteredPlayer();
    Player.open({
      kind: 'vod', url: v.source, vodId: v.id, duration: v.duration,
      channelName: name, title: v.title
    }, back);
  }

  function playClip(v) {
    go('player');
    enteredPlayer();
    Player.open({
      kind: 'vod', url: v.source, vodId: null, duration: v.duration,  // short: no resume point
      channelName: chan.data ? chan.data.name : chan.slug, title: v.title
    }, back);
  }

  /* ---------- Version & update notice ----------
     At most once a day, after start-up, the newest release on GitHub is compared with this app's
     version. A newer one is announced once (a message on screen); Settings > About shows it too. */
  var appVersion = '', UPDATE_MS = 86400000;
  function readVersion(cb) {
    try { var v = tizen.application.getAppInfo().version; if (v) { cb(v); return; } } catch (e) {}
    try {
      var x = new XMLHttpRequest();
      x.open('GET', 'config.xml', true);
      x.onreadystatechange = function () {
        if (x.readyState !== 4) return;
        var m = /<widget[^>]*\sversion="([^"]+)"/.exec(x.responseText || '');
        cb(m ? m[1] : '');
      };
      x.send();
    } catch (e) { cb(''); }
  }
  function isNewer(a, b) {
    if (!a || !b) return false;
    var x = String(a).replace(/^v/i, '').split('.'), y = String(b).replace(/^v/i, '').split('.');
    for (var i = 0; i < Math.max(x.length, y.length); i++) {
      var p = parseInt(x[i], 10) || 0, q = parseInt(y[i], 10) || 0;
      if (p !== q) return p > q;
    }
    return false;
  }
  function updateInfo() { return Store.get('kickizle.update', null) || {}; }
  function renderAbout() {
    var u = updateInfo(), st = el('aboutStatus'), fresh = isNewer(u.latest, appVersion);
    el('aboutVersion').textContent = appVersion ? I18n.t('versionLabel', { v: appVersion }) : '';
    st.textContent = fresh ? I18n.t('updateAvailable', { v: u.latest }) : (u.latest && appVersion ? I18n.t('upToDate') : '');
    st.classList.toggle('new', fresh);
    el('btnSettings').classList.toggle('has-update', fresh);  // green dot on the home screen's ⚙
  }
  function checkUpdate(force) {
    if (!appVersion) return;
    var u = updateInfo();
    function decide() {
      renderAbout();
      if (isNewer(u.latest, appVersion) && u.notified !== u.latest) {
        u.notified = u.latest;
        Store.set('kickizle.update', u);
        Player.toast(I18n.t('updateAvailable', { v: u.latest }), 8000);
      }
    }
    if (!force && u.at && Date.now() - u.at < UPDATE_MS) { decide(); return; }
    Api.latestRelease(function (tag) {
      if (!tag) { renderAbout(); return; }  // offline / rate-limited: try again next start
      u.at = Date.now();
      u.latest = tag.replace(/^v/i, '');
      Store.set('kickizle.update', u);
      decide();
    });
  }

  /* ---------- What's new ----------
     After an update the app shows, once, what the new version brings (lists in whatsnew.js, in the
     interface language). A first install shows nothing. Settings > About opens it again. */
  var newsChecked = false;
  function newsSince(seen) {
    return (window.WhatsNew || []).filter(function (e) {
      return (!seen || isNewer(e.v, seen)) && !isNewer(e.v, appVersion);
    }).slice(0, 2);  // at most the last two versions, so the panel fits the screen
  }
  function openNews(entries) {
    if (!entries.length) return;
    var box = el('newsList'), lang = I18n.getLang();
    box.innerHTML = '';
    entries.forEach(function (e) {
      if (entries.length > 1 || e.v !== appVersion) box.appendChild(make('div', 'panel-label', I18n.t('versionLabel', { v: e.v })));
      var ul = make('ul', 'news');
      (e.items[lang] || e.items.en || []).forEach(function (t) { ul.appendChild(make('li', '', t)); });
      box.appendChild(ul);
    });
    newsReturn = Nav.getFocused();
    newsOpen = true;
    el('newsLayer').classList.remove('hidden');
    Nav.setScope(el('newsLayer'), el('newsOk'));
  }
  function closeNews() {
    newsOpen = false;
    el('newsLayer').classList.add('hidden');
    Nav.setScope(el(current), newsReturn);
  }
  function maybeShowNews() {
    if (newsChecked || !appVersion || splashOpen) return;
    if (current !== 'home' || filterOpen || newsOpen) return;  // tried again when back on home
    newsChecked = true;
    var seen = Store.get('kickizle.seenVersion', null);
    Store.set('kickizle.seenVersion', appVersion);
    if (seen === null) {
      // No record yet: a first install (nothing stored) shows nothing; an update from a version
      // before this feature (1.0.6 or older) shows the recent lists.
      var ui = null;
      try { ui = localStorage.getItem('kickizle.ui'); } catch (e) {}
      var used = Store.recent().length || Store.follows().length || Store.get('kickizle.filter', null) || ui;
      if (!used) return;
      seen = '1.0.5';
    }
    if (!isNewer(appVersion, seen)) return;
    openNews(newsSince(seen));
  }

  /* ---------- Tuşlar ---------- */
  function onKey(e) {
    var code = e.keyCode;
    if (splashOpen) {
      if (code === K.ENTER && splashError) retryStart();
      else if (Nav.isBack(code)) tryExit();
      e.preventDefault();
      return;
    }
    if (current === 'player') { if (Player.handleKey(code)) e.preventDefault(); return; }
    if (newsOpen) {
      if (code === K.ENTER) closeNews();
      else if (Nav.isBack(code)) closeNews();
      e.preventDefault();
      return;
    }
    if (filterOpen) {
      if (code === K.LEFT) Nav.move('left');
      else if (code === K.RIGHT) Nav.move('right');
      else if (code === K.UP) Nav.move('up');
      else if (code === K.DOWN) Nav.move('down');
      else if (code === K.ENTER) { var ff = Nav.getFocused(); if (ff) ff.click(); }
      else if (Nav.isBack(code)) closeFilter(false);
      else return;
      e.preventDefault();
      return;
    }

    var input = el('searchInput');
    if (current === 'search' && document.activeElement === input) {
      if (code === K.ENTER || code === K.IME_DONE) { input.blur(); clearTimeout(searchTimer); Store.addSearch(searchQuery()); runSearch(); Nav.move('down'); e.preventDefault(); }
      else if (code === K.DOWN) { input.blur(); Nav.move('down'); e.preventDefault(); }
      else if (code === K.IME_CANCEL || code === K.ESC || code === K.BACK) { input.blur(); e.preventDefault(); }
      return;
    }

    if (code === K.LEFT) Nav.move('left');
    else if (code === K.RIGHT) Nav.move('right');
    else if (code === K.UP) Nav.move('up');
    else if (code === K.DOWN) Nav.move('down');
    else if (code === K.ENTER) {
      var f = Nav.getFocused();
      if (f === input) input.focus(); else if (f) f.click();
    } else if (Nav.isBack(code)) back();
    else return;
    e.preventDefault();
  }

  /* ---------- Başlangıç ---------- */
  function init() {
    Nav.registerKeys();
    Nav.onFocus(function (node) { checkLazy(scrollerOf(node)); });
    I18n.apply();
    renderHomeHeader();
    renderRecent();
    renderContinue();
    try { localStorage.removeItem('kickizle.homeCache'); localStorage.removeItem('kickizle.followLive'); } catch (e) {}  // from a dev build
    if (splashOpen && Store.follows().length) {
      // Reserve the row now so nothing jumps later; its requests start when the splash fades.
      el('followWrap').classList.remove('hidden');
      el('followNote').textContent = I18n.t('loading');
      followPending = true;
    } else renderFollowed(true);

    el('btnSearch').onclick = openSearch;
    el('btnCategories').onclick = openCategories;
    el('aboutRow').onclick = function () { el('aboutStatus').textContent = I18n.t('loading'); checkUpdate(true); };
    readVersion(function (v) { appVersion = v; renderAbout(); maybeShowNews(); });
    el('newsOk').onclick = closeNews;
    el('btnWhatsNew').onclick = function () { openNews(newsSince(null)); };
    el('btnFilter').onclick = openFilter;
    el('filterApply').onclick = function () { closeFilter(true); };
    el('filterCancel').onclick = function () { closeFilter(false); };
    el('btnSettings').onclick = openSettings;
    el('btnWatchLive').onclick = watchLive;
    el('btnFollow').onclick = toggleFollow;
    el('tabVods').onclick = function () { showTab('vods'); };
    el('tabClips').onclick = function () { showTab('clips'); };
    el('searchInput').addEventListener('input', function () { clearTimeout(searchTimer); searchTimer = setTimeout(runSearch, 600); });

    document.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) Player.pauseForBackground(); else Player.resumeFromBackground();
    });
    // Fareyle test için: fare gerçekten hareket edince üzerindeki öğeye odaklan.
    // (Sayfa imlecin altında kayınca tarayıcı da olay üretir; onları ve tuş basımından hemen sonrasını yok say.)
    var lastMouse = { x: -1, y: -1 }, lastKeyAt = 0;
    document.addEventListener('keydown', function () { lastKeyAt = Date.now(); }, true);
    document.addEventListener('mousemove', function (e) {
      if (e.clientX === lastMouse.x && e.clientY === lastMouse.y) return;
      lastMouse = { x: e.clientX, y: e.clientY };
      if (Date.now() - lastKeyAt < 800) return;
      var t = e.target;
      while (t && t !== document && !(t.classList && t.classList.contains('focusable'))) t = t.parentNode;
      if (t && t !== document && current !== 'player') Nav.focus(t);
    });

    showScreen('home', el('btnSearch'));
    loadLive(true);
    watchStart();  // no list after 10 s: show the error on the splash
  }

  /* Start after the splash's first frame has been painted, so it appears without a hitch; the work
     itself doesn't take longer. (The timeout covers engines that don't paint while hidden.) */
  var started = false;
  function start() {
    if (started) return;
    started = true;
    init();
  }
  function startAfterPaint() {
    if (window.requestAnimationFrame) requestAnimationFrame(function () { requestAnimationFrame(start); });
    setTimeout(start, 120);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startAfterPaint); else startAfterPaint();
}());
