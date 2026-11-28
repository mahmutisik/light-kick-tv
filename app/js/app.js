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
  var draft = null, filterOpen = false;
  var chan = { slug: null, data: null, vods: [], seq: 0 };
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
  function checkLazy(sc) {
    if (!sc || splashOpen) return;  // image decoding waits until the splash is gone (TV CPU is busy then)
    var sr = sc.getBoundingClientRect();
    if (!sr.height) return;  // screen not visible yet; checked again when it is shown
    var nodes = sc.querySelectorAll('[data-bg]');
    for (var i = 0; i < nodes.length; i++) {
      var r = nodes[i].getBoundingClientRect();
      if (r.height && r.bottom >= sr.top - 300 && r.top <= sr.bottom + 950) loadBg(nodes[i]);
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
    var prev = stack.pop(), preferred = prev.focus;
    if (prev.id === 'home') {
      if (homeStale) {
        // Watched for a while: the old list was released; load a fresh one and start at the top.
        homeStale = false;
        renderRecent();
        renderFollowed(true);
        showScreen('home', el('btnFilter'));
        loadLive(true);
        return;
      }
      // Son izlenenler / takip listesi değişmiş olabilir: yeniden çiz, odağı aynı yerde tut.
      var path = focusPath(prev.focus);
      renderRecent();
      renderFollowed(false);
      if (!preferred || !document.body.contains(preferred)) preferred = fromPath(path);
    }
    showScreen(prev.id, preferred);
    if (prev.id === 'channel') { refreshVodProgress(); updateFollowBtn(); }
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
    ['channelScroll', 'searchScroll', 'homeScroll', 'settingsScroll'].forEach(function (id) { unloadImages(el(id)); });
  }
  function unloadImages(container) {
    var nodes = container.querySelectorAll('[style*="background-image"]');
    for (var i = 0; i < nodes.length; i++) {
      var re = /url\(["']?([^"')]+)["']?\)/g, m1 = re.exec(nodes[i].style.backgroundImage), m2 = m1 && re.exec(nodes[i].style.backgroundImage);
      if (m1) {
        nodes[i].setAttribute('data-bg', m1[1]);
        if (m2) nodes[i].setAttribute('data-bg2', m2[1]);
        nodes[i].style.backgroundImage = '';
      }
    }
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

  /* ---------- Kartlar ---------- */
  function liveCard(x) {
    var c = make('div', 'card focusable'), th = make('div', 'thumb');
    bg(th, x.thumb);
    th.appendChild(make('span', 'badge live', I18n.t('live')));
    th.appendChild(make('span', 'corner', '● ' + I18n.t('viewers', { n: I18n.number(x.viewers) })));
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
  function vodCard(v) {
    var c = make('div', 'card focusable'), th = make('div', 'thumb');
    bg(th, v.thumb, v.thumbFallback);
    if (v.ongoing) th.appendChild(make('span', 'badge ongoing', I18n.t('ongoing')));
    else if (v.duration) th.appendChild(make('span', 'corner', fmtDur(v.duration)));
    var r = Store.getResume(v.id);
    if (r && r.t && (r.d || v.duration)) {
      var bar = make('div', 'resume');
      bar.style.width = Math.min(100, r.t / (r.d || v.duration) * 100) + '%';
      th.appendChild(bar);
    }
    c.appendChild(th);
    var body = make('div', 'card-body');
    body.appendChild(make('div', 'card-title', v.title));
    var parts = [vodDate(v.created)];
    if (v.views) parts.push(I18n.t('views', { n: I18n.number(v.views) }));
    if (v.category) parts.push(v.category);
    body.appendChild(make('div', 'card-sub', parts.join(' · ')));
    c.appendChild(body);
    c.onclick = function () { playVod(v); };
    return c;
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
      var chip = make('div', 'chip focusable');
      chip.appendChild(avatar(x.pic, x.name));
      chip.appendChild(make('span', '', x.name));
      chip.onclick = function () { openChannel(x.slug, false); };
      box.appendChild(chip);
    });
    observeImages(box);
  }
  function langName(c) { for (var i = 0; i < LANGS.length; i++) if (LANGS[i].c === c) return LANGS[i].n; return c; }
  function filterSummary(f) {
    var langs = !f.langs.length ? I18n.t('allLangsShort')
      : f.langs.length <= 2 ? f.langs.map(langName).join(', ')
      : langName(f.langs[0]) + ', ' + langName(f.langs[1]) + ' +' + (f.langs.length - 2);
    return langs + '  ·  ' + I18n.t(f.sort === 'viewers' ? 'sortViewers' : 'sortFeatured');
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
            if (!err && ls) results.push({ slug: f.slug, name: f.name, pic: f.pic, title: ls.title, viewers: ls.viewers, category: ls.category, thumb: ls.thumb });
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
  }
  function setUiLang(lang) {
    if (lang === I18n.getLang()) return;
    I18n.setLang(lang);
    renderSettings();
    renderHomeHeader();
    loadLive(true);
    followCache.at = 0;
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
      if (!err) homeReady();
      note.textContent = '';
      if (err) { note.appendChild(retryButton(function () { loadLive(false); })); return; }
      var seen = {};
      home.items.forEach(function (x) { seen[x.slug] = true; });
      var fresh = res.items.filter(function (x) { return !seen[x.slug]; });
      home.items = home.items.concat(fresh);
      home.cursor = res.next;
      home.hasMore = !!res.next && fresh.length > 0 && home.items.length < 96;  // çok kart TV belleğini doldurur
      fresh.forEach(function (x) { grid.appendChild(homeCard(x)); });
      observeImages(grid);
      if (!home.items.length) note.textContent = I18n.t('nothingLive');
      if (current === 'home' && !Nav.getFocused()) Nav.setScope(el('home'));
    });
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
    setTimeout(function () {
      splashOpen = false;
      if (s.parentNode) s.parentNode.removeChild(s);
      var scs = current ? el(current).querySelectorAll('.scroller') : [];
      for (var i = 0; i < scs.length; i++) checkLazy(scs[i]);  // now load the thumbnails
    }, 480);
  }
  // Called when the first live list request finishes: keep the splash up at least ~1.3 s overall,
  // so on a fast connection the logo still finishes its fade-in and shows for a moment.
  function homeReady() {
    var shown = window.performance && performance.now ? performance.now() : 0;
    setTimeout(hideSplash, Math.max(0, 1300 - shown));
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
    if (q.length < 2) { grid.innerHTML = ''; note.textContent = Store.searches().length ? '' : I18n.t('searchHint'); return; }
    note.textContent = I18n.t('loading');
    searchXhr = Api.search(q, function (err, list) {
      if (my !== searchSeq) return;
      grid.innerHTML = '';
      note.textContent = '';
      if (err) { note.appendChild(retryButton(runSearch)); return; }
      if (!list.length) { note.textContent = I18n.t('noResults'); return; }
      list.sort(function (a, b) { return (b.live - a.live) || (b.followers - a.followers); });
      list.forEach(function (x) { grid.appendChild(channelCard(x)); });
      observeImages(grid);
      if (current === 'search' && document.activeElement !== el('searchInput')) Nav.focus(grid.children[0]);
    });
  }
  function openSearch() {
    go('search');
    var input = el('searchInput');
    input.placeholder = I18n.t('searchPlaceholder');
    renderHistory();
    if (!el('searchGrid').children.length) el('searchNote').textContent = Store.searches().length ? '' : I18n.t('searchHint');
    // Klavyeyi kendiliğinden açma: Samsung klavyesi geç açılıyor ve son aramalardan birini seçerken
    // önce kapatmak gerekiyordu. Kutu odakta bekler; OK ile klavye açılır, ↓ ile son aramalara inilir.
    Nav.focus(input);
  }

  /* ---------- Kanal ---------- */
  function openChannel(slug, focusLive) {
    if (current === 'search') Store.addSearch(searchQuery());  // aramadan bir kanala girildiyse aramayı kaydet
    go('channel');
    Player.preload();  // a stream is likely next: fetch the player library in the background
    var my = ++chan.seq;
    chan.slug = slug; chan.data = null; chan.vods = [];
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
    var pending = 2;
    function done() { if (--pending === 0 && my === chan.seq && current === 'channel') Nav.setScope(el('channel'), chan.data && chan.data.live && focusLive !== false ? el('btnWatchLive') : null); }

    Api.channel(slug, function (err, ch) {
      if (my !== chan.seq) return;
      if (err) { el('chMeta').textContent = ''; el('chMeta').appendChild(retryButton(function () { back(); openChannel(slug, focusLive); })); done(); return; }
      chan.data = ch;
      if (ch.pic) el('chAvatar').src = ch.pic;
      el('chName').textContent = ch.name;
      el('chLive').textContent = I18n.t('live');
      el('chLive').classList.toggle('hidden', !ch.live);
      el('chMeta').textContent = I18n.t('followers', { n: I18n.number(ch.followers) }) +
        (ch.live ? ' · ' + I18n.t('viewers', { n: I18n.number(ch.viewers) }) + (ch.category ? ' · ' + ch.category : '') : ' · ' + I18n.t('offline'));
      el('chTitle').textContent = ch.title;
      el('btnWatchLive').classList.toggle('hidden', !ch.live);
      if (ch.live && Date.now() - ch.fetchedAt < 90000) Player.prefetch(ch.playbackUrl);
      el('btnFollow').classList.remove('hidden');
      updateFollowBtn();
      Store.addRecent({ slug: ch.slug, name: ch.name, pic: ch.pic });
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
  function refreshVodProgress() {
    var grid = el('vodGrid'), f = Nav.getFocused(), idx = Array.prototype.indexOf.call(grid.children, f);
    grid.innerHTML = '';
    chan.vods.forEach(function (v) { grid.appendChild(vodCard(v)); });
    observeImages(grid);
    if (idx >= 0 && grid.children[idx]) Nav.setScope(el('channel'), grid.children[idx]);
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
    Player.open({
      kind: 'live', url: ch.playbackUrl, channelName: ch.name, title: ch.title,
      channelId: ch.id, chatroomId: ch.chatroomId
    }, back);
  }
  function playVod(v) {
    go('player');
    enteredPlayer();
    Player.open({
      kind: 'vod', url: v.source, vodId: v.id, duration: v.duration,
      channelName: chan.data ? chan.data.name : chan.slug, title: v.title
    }, back);
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
    try { localStorage.removeItem('kickizle.homeCache'); localStorage.removeItem('kickizle.followLive'); } catch (e) {}  // from a dev build
    if (splashOpen && Store.follows().length) {
      // Reserve the row now so nothing jumps later; its requests start when the splash fades.
      el('followWrap').classList.remove('hidden');
      el('followNote').textContent = I18n.t('loading');
      followPending = true;
    } else renderFollowed(true);

    el('btnSearch').onclick = openSearch;
    el('btnFilter').onclick = openFilter;
    el('filterApply').onclick = function () { closeFilter(true); };
    el('filterCancel').onclick = function () { closeFilter(false); };
    el('btnSettings').onclick = openSettings;
    el('btnWatchLive').onclick = watchLive;
    el('btnFollow').onclick = toggleFollow;
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
