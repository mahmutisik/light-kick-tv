/* Ekranlar: ana sayfa, arama, kanal (canlı + geçmiş yayınlar), oynatıcı. */
(function () {
  'use strict';
  var K = Nav.KEY;
  var stack = [], current = null, lastBackAt = 0;
  var home = { lang: Store.get('kickizle.lang', I18n.getLang() === 'tr' ? 'tr' : 'en'), page: 1, items: [], hasMore: false, loading: false, seq: 0 };
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
  function bg(node, url) { if (url) node.style.backgroundImage = 'url("' + String(url).replace(/"/g, '%22') + '")'; }
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
  }
  function go(id) {
    if (current) stack.push({ id: current, focus: Nav.getFocused() });
    showScreen(id);
  }
  function back() {
    if (!stack.length) { tryExit(); return; }
    var prev = stack.pop(), preferred = prev.focus;
    if (prev.id === 'home') {
      // Son izlenenler / takip listesi değişmiş olabilir: yeniden çiz, odağı aynı yerde tut.
      var path = focusPath(prev.focus);
      renderRecent();
      renderFollowed(false);
      if (!preferred || !document.body.contains(preferred)) preferred = fromPath(path);
    }
    showScreen(prev.id, preferred);
    if (prev.id === 'channel') { refreshVodProgress(); updateFollowBtn(); }
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
    try { return d.toLocaleDateString(I18n.getLang() === 'tr' ? 'tr-TR' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' }); }
    catch (e) { return d.getDate() + '.' + (d.getMonth() + 1) + '.' + d.getFullYear(); }
  }
  function fmtDur(s) {
    s = Math.floor(s || 0);
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return (h ? h + ':' + (m < 10 ? '0' : '') + m : m) + ':' + (x < 10 ? '0' : '') + x;
  }
  function vodCard(v) {
    var c = make('div', 'card focusable'), th = make('div', 'thumb');
    bg(th, v.thumb);
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
  }
  function renderHomeHeader() {
    var tabs = document.querySelectorAll('.lang-tab');
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle('active', tabs[i].getAttribute('data-lang') === home.lang);
    el('liveTitle').textContent = I18n.t('liveNow', { lang: I18n.t(home.lang === 'tr' ? 'langNameTr' : 'langNameEn') });
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
    note.textContent = items.length ? '' : I18n.t('noFollowedLive');
  }

  /* ---------- Ayarlar ---------- */
  function openSettings() {
    go('settings');
    renderSettings();
    Nav.setScope(el('settings'));
  }
  function renderSettings() {
    var btns = document.querySelectorAll('.ui-lang');
    for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('active', btns[i].getAttribute('data-ui') === I18n.getLang());
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
  function loadLive(reset) {
    if (home.loading && !reset) return;
    var my = ++home.seq, grid = el('liveGrid'), note = el('liveNote');
    if (reset) { home.page = 1; home.items = []; grid.innerHTML = ''; el('homeScroll').scrollTop = 0; }
    home.loading = true;
    note.innerHTML = ''; note.textContent = I18n.t('loading');
    Api.livestreams(home.lang, home.page, function (err, res) {
      if (my !== home.seq) return;
      home.loading = false;
      note.textContent = '';
      if (err) { note.appendChild(retryButton(function () { loadLive(false); })); return; }
      var seen = {};
      home.items.forEach(function (x) { seen[x.slug] = true; });
      var fresh = res.items.filter(function (x) { return !seen[x.slug]; });
      home.items = home.items.concat(fresh);
      home.hasMore = res.hasMore && fresh.length > 0 && home.items.length < 96;  // çok kart TV belleğini doldurur
      home.page++;
      fresh.forEach(function (x) {
        var card = liveCard(x);
        card.onfocusnav = function () {
          var cards = grid.children, idx = Array.prototype.indexOf.call(cards, card);
          if (home.hasMore && !home.loading && idx >= cards.length - 4) loadLive(false);
        };
        grid.appendChild(card);
      });
      if (!home.items.length) note.textContent = I18n.t('nothingLive');
      if (current === 'home' && !Nav.getFocused()) Nav.setScope(el('home'));
    });
  }

  /* ---------- Arama ---------- */
  function runSearch() {
    var q = el('searchInput').value.replace(/^\s+|\s+$/g, ''), grid = el('searchGrid'), note = el('searchNote');
    var my = ++searchSeq;
    if (searchXhr) { try { searchXhr.abort(); } catch (e) {} }
    if (q.length < 2) { grid.innerHTML = ''; note.textContent = I18n.t('searchHint'); return; }
    note.textContent = I18n.t('loading');
    searchXhr = Api.search(q, function (err, list) {
      if (my !== searchSeq) return;
      grid.innerHTML = '';
      note.textContent = '';
      if (err) { note.appendChild(retryButton(runSearch)); return; }
      if (!list.length) { note.textContent = I18n.t('noResults'); return; }
      list.sort(function (a, b) { return (b.live - a.live) || (b.followers - a.followers); });
      list.forEach(function (x) { grid.appendChild(channelCard(x)); });
      if (current === 'search' && document.activeElement !== el('searchInput')) Nav.focus(grid.children[0]);
    });
  }
  function openSearch() {
    go('search');
    var input = el('searchInput');
    input.placeholder = I18n.t('searchPlaceholder');
    if (!el('searchGrid').children.length) el('searchNote').textContent = I18n.t('searchHint');
    Nav.focus(input);
    setTimeout(function () { input.focus(); }, 50);
  }

  /* ---------- Kanal ---------- */
  function openChannel(slug, focusLive) {
    go('channel');
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
    if (idx >= 0 && grid.children[idx]) Nav.setScope(el('channel'), grid.children[idx]);
  }

  /* ---------- Oynatma ---------- */
  function watchLive() {
    var slug = chan.slug;
    Player.toast(I18n.t('loadingStream'));
    // Yayın linkindeki anahtar kısa ömürlü; izlemeden hemen önce tazele.
    Api.channel(slug, function (err, ch) {
      if (current !== 'channel' || chan.slug !== slug) return;
      if (err || !ch.live) { Player.toast(err ? I18n.t('loadFailed') : I18n.t('offline')); return; }
      chan.data = ch;
      go('player');
      Player.open({
        kind: 'live', url: ch.playbackUrl, channelName: ch.name, title: ch.title,
        channelId: ch.id, chatroomId: ch.chatroomId
      }, back);
    });
  }
  function playVod(v) {
    go('player');
    Player.open({
      kind: 'vod', url: v.source, vodId: v.id, duration: v.duration,
      channelName: chan.data ? chan.data.name : chan.slug, title: v.title
    }, back);
  }

  /* ---------- Tuşlar ---------- */
  function onKey(e) {
    var code = e.keyCode;
    if (current === 'player') { if (Player.handleKey(code)) e.preventDefault(); return; }

    var input = el('searchInput');
    if (current === 'search' && document.activeElement === input) {
      if (code === K.ENTER || code === K.IME_DONE) { input.blur(); clearTimeout(searchTimer); runSearch(); Nav.move('down'); e.preventDefault(); }
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
    I18n.apply();
    renderHomeHeader();
    renderRecent();
    renderFollowed(true);

    el('btnSearch').onclick = openSearch;
    var tabs = document.querySelectorAll('.lang-tab');
    for (var i = 0; i < tabs.length; i++) tabs[i].onclick = (function (lang) {
      return function () { if (home.lang === lang) return; home.lang = lang; Store.set('kickizle.lang', lang); renderHomeHeader(); loadLive(true); };
    }(tabs[i].getAttribute('data-lang')));
    el('btnSettings').onclick = openSettings;
    var uiBtns = document.querySelectorAll('.ui-lang');
    for (var j = 0; j < uiBtns.length; j++) uiBtns[j].onclick = (function (l) { return function () { setUiLang(l); }; }(uiBtns[j].getAttribute('data-ui')));
    el('btnWatchLive').onclick = watchLive;
    el('btnFollow').onclick = toggleFollow;
    el('searchInput').addEventListener('input', function () { clearTimeout(searchTimer); searchTimer = setTimeout(runSearch, 600); });

    document.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', function () { if (document.hidden) Player.pauseForBackground(); });
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
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
}());
