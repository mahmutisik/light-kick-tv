/* Web tabanlı oynatıcı: hls.js + HTML5 video (kick.com'un tarayıcıda kullandığı yönteme benzer). */
var Player = (function () {
  'use strict';
  var K = Nav.KEY;
  var video, hls = null, opts = null, onExit = null;
  var osdTimer = null, seekTimer = null, saveTimer = null, retryTimer = null;
  var pendingSeek = null, lastSeekAt = 0, seekStreak = 0, retries = 0;
  var menuOpen = false, chatOn = false, levels = [];
  var loadingStopped = false, frameOnly = false, lastProgressAt = 0, waitTimer = null;
  /* Rewind (live): Kick records a running stream and serves the recording so far as a finished
     playlist. Rewinding switches the player to that recording (it then behaves like a past broadcast)
     and back to the live stream when you reach its end. */
  var rewind = null;              // { snapAt: ms when the recording was opened } while rewinding
  var rewindBusy = false, startPaused = false;
  // While the recording is opening the player doesn't know its position yet (it reads 0), so ← / →
  // pressed in that time only change how far back to go (rewindTarget, seconds from the end).
  var rewindLoading = false, rewindTarget = 10;
  var RECORD_LAG_S = 15;          // the recording's end trails the live picture by roughly this much
  var SEEK_SETTLE_MS = 1000;  // sarmayı bıraktıktan sonra karenin yükleneceği bekleme süresi
  var OSD_HIDE_MS = 2500;     // oynatma sırasında bilgi çubuğunun kaybolma süresi

  function el(id) { return document.getElementById(id); }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function fmt(s) {
    s = Math.max(0, Math.floor(s || 0));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    return (h ? h + ':' + pad(m) : m) + ':' + pad(sec);
  }
  function isVod() { return opts && opts.kind === 'vod'; }

  /* ---------- Durum katmanı ---------- */
  function status(titleKey, detail, isError) {
    var box = el('playerStatus');
    box.classList.remove('hidden');
    box.classList.toggle('error', !!isError);
    el('statusTitle').textContent = I18n.t(titleKey);
    el('statusDetail').textContent = detail || '';
  }
  function hideStatus() { el('playerStatus').classList.add('hidden'); }

  /* ---------- Ekran bilgisi (OSD) ---------- */
  function osdVisible() { return !el('osd').classList.contains('faded'); }
  function showOsd(keep) {
    if (!osdVisible()) { el('osd').classList.remove('faded'); if (pendingSeek === null) updateProgress(); }
    clearTimeout(osdTimer);
    if (!keep && !menuOpen && !(isVod() && video.paused)) osdTimer = setTimeout(function () { el('osd').classList.add('faded'); }, OSD_HIDE_MS);
  }
  function duration() {
    var d = video.duration;
    if (isFinite(d) && d > 0) return d;
    if (video.seekable && video.seekable.length) return video.seekable.end(video.seekable.length - 1);
    return (opts && opts.duration) || 0;
  }
  function updateProgress(at) {
    if (!isVod()) return;
    // Sarma sürerken her zaman hedef noktayı göster (eski konuma geri sıçramasın).
    var d = duration(), t = at !== undefined && at !== null ? at : (pendingSeek !== null ? pendingSeek : video.currentTime);
    var pct = d ? Math.min(100, t / d * 100) : 0;
    el('progressFill').style.width = pct + '%';
    el('progressKnob').style.left = pct + '%';
    var buf = 0;
    for (var i = 0; i < video.buffered.length; i++) if (video.buffered.start(i) <= video.currentTime + 1) buf = video.buffered.end(i);
    el('progressBuffer').style.width = (d ? Math.min(100, buf / d * 100) : 0) + '%';
    var label = fmt(t) + ' / ' + fmt(d);
    if (opts.rewind && rewind) label = I18n.t('behindLive', { t: fmt(Math.max(0, d - t) + (Date.now() - rewind.snapAt) / 1000 + RECORD_LAG_S) });
    el('osdTime').textContent = label + (video.paused ? '  ·  ' + I18n.t('paused') : '');
  }
  function qualityLabel(i) {
    var l = levels[i]; if (!l) return '';
    // A single-quality playlist (clips) doesn't state its size: take it from the video itself.
    var h = l.height || (levels.length === 1 ? video.videoHeight : 0);
    if (!h) return '';
    var fps = l.frameRate && l.frameRate > 31 ? Math.round(l.frameRate) : '';
    return h + 'p' + fps;
  }
  function updateQualityText() {
    if (!hls) { el('osdQuality').textContent = ''; return; }
    var cur = hls.currentLevel, txt = cur >= 0 ? qualityLabel(cur) : '';
    if (levels.length <= 1) { el('osdQuality').textContent = qualityLabel(0); return; }  // nothing to choose
    el('osdQuality').textContent = hls.autoLevelEnabled ? I18n.t('auto') + (txt ? ' (' + txt + ')' : '') : txt;
  }

  /* ---------- Yükleme ---------- */
  function destroyHls() {
    if (hls) { try { hls.destroy(); } catch (e) {} hls = null; }
    levels = [];
  }
  function play() {
    var p = video.play();
    if (p && p['catch']) p['catch'](function () {});
  }
  /* hls.js (~600 KB) is fetched and parsed only when it is first needed, so the app starts faster. */
  var hlsLoading = null, loadSeq = 0;
  function ensureHls(cb) {
    if (window.Hls) { cb(); return; }
    if (!hlsLoading) {
      hlsLoading = [];
      var s = document.createElement('script');
      s.src = 'lib/hls.min.js';
      s.onload = s.onerror = function () { var q = hlsLoading; hlsLoading = null; for (var i = 0; i < q.length; i++) q[i](); };
      document.head.appendChild(s);
    }
    hlsLoading.push(cb);
  }
  /* Called when a channel page opens: likely to play soon, so warm the player up in the background. */
  function preload() { ensureHls(function () {}); }

  /* Live start-up: the stream's main playlist is fetched as soon as a live channel page opens.
     When "Watch live" is pressed within 90 s with the same link, the player gets it instantly instead
     of waiting for that request (the slowest single step before the first picture). Kick serves it
     uncacheable, so the browser can't do this on its own. */
  var prefetched = {}, PREFETCH_MS = 90000;
  function prefetchManifest(url) {
    if (!url || (prefetched[url] && Date.now() - prefetched[url].at < PREFETCH_MS)) return;
    var xhr = new XMLHttpRequest();
    try {
      xhr.open('GET', Api.proxied(url), true);
      xhr.timeout = 8000;
      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300 && xhr.responseText.indexOf('#EXTM3U') === 0) {
          prefetched = {};  // keep only the latest one
          prefetched[url] = { text: xhr.responseText, at: Date.now() };
        }
      };
      xhr.send();
    } catch (e) {}
  }
  function takePrefetched(url) {
    var hit = prefetched[url];
    delete prefetched[url];
    return hit && Date.now() - hit.at < PREFETCH_MS ? hit.text : null;
  }
  /* Playlist loader that answers the main playlist from the prefetch, and otherwise behaves
     exactly like hls.js's own loader. */
  function makePlaylistLoader() {
    var Base = Hls.DefaultConfig.loader;
    function Loader(config) { this.inner = new Base(config); this.stats = this.inner.stats; this.context = null; }
    Loader.prototype.load = function (context, config, callbacks) {
      var text = context.type === 'manifest' ? takePrefetched(context.url) : null;
      if (text) {
        var now = performance.now(), st = this.stats;
        st.loading.start = st.loading.first = st.loading.end = now;
        st.loaded = st.total = text.length;
        this.context = context;
        var self = this;
        setTimeout(function () { callbacks.onSuccess({ url: context.url, data: text }, st, context, null); self.stats = st; }, 0);
        return;
      }
      this.inner.load(context, config, callbacks);
      this.stats = this.inner.stats;
      this.context = context;
    };
    Loader.prototype.abort = function () { this.inner.abort(); };
    Loader.prototype.destroy = function () { this.inner.destroy(); };
    Loader.prototype.getCacheAge = function () { return this.inner.getCacheAge ? this.inner.getCacheAge() : null; };
    Loader.prototype.getResponseHeader = function (n) { return this.inner.getResponseHeader ? this.inner.getResponseHeader(n) : null; };
    return Loader;
  }

  function load(url, startAt, paused) {
    var my = ++loadSeq;
    destroyHls();
    clearTimeout(retryTimer);
    startPaused = !!paused;
    ensureHls(function () { if (my === loadSeq && opts) loadNow(url, startAt); });
  }
  function loadNow(url, startAt) {
    if (window.Hls && Hls.isSupported()) {
      var cfg = {
        enableWorker: true, startPosition: startAt || -1,
        capLevelToPlayerSize: false, enableWebVTT: false, enableIMSC1: false, enableCEA708Captions: false,
        // TV belleği az: VOD'da ~30 sn, canlıda ~15 sn ileriyi tut.
        maxBufferLength: isVod() ? 30 : 15, maxMaxBufferLength: isVod() ? 40 : 20, backBufferLength: isVod() ? 10 : 5,
        maxBufferSize: 40 * 1000 * 1000,
        // Bağlantı iyiyse en baştan yüksek kaliteyle başla (düşükten başlayıp aynı parçaları tekrar indirmesin).
        abrEwmaDefaultEstimate: 8000000,
        liveSyncDurationCount: 3, liveMaxLatencyDurationCount: 12,
        manifestLoadingMaxRetry: 4, levelLoadingMaxRetry: 4, fragLoadingMaxRetry: 6
      };
      if (Api.DEV) cfg.xhrSetup = function (xhr, u) { xhr.open('GET', Api.proxied(u), true); };
      cfg.startFragPrefetch = true;
      try { cfg.pLoader = makePlaylistLoader(); } catch (e) {}
      if (startPaused) { cfg.maxBufferLength = 1; cfg.maxMaxBufferLength = 1; }  // just the frame
      hls = new Hls(cfg);
      loadingStopped = false; frameOnly = startPaused;
      if (opts.rewind) {
        // The recording's real length is known once its playlist arrives: if our estimate of the
        // start point overshot the end, move back to the requested distance from the end.
        hls.once(Hls.Events.LEVEL_LOADED, function (e, d) {
          var total = d && d.details && d.details.totalduration;
          if (!total) return;
          var want = Math.max(0, total - rewindTarget);
          if (startAt > total - 3 || Math.abs(want - startAt) > 2) video.currentTime = want;
        });
      }
      hls.on(Hls.Events.MANIFEST_PARSED, function () {
        levels = hls.levels || [];
        try { hls.subtitleTrack = -1; hls.subtitleDisplay = false; } catch (e) {}
        var pref = Store.get('kickizle.quality', 'auto'), i;
        if (pref !== 'auto') {
          for (i = 0; i < levels.length; i++) if (levels[i].height === pref) { hls.currentLevel = i; break; }
        } else {
          // Otomatik: en yüksek kaliteden (1080p60) başla; bağlantı yetmezse hls.js kendisi düşürür.
          var best = 0;
          for (i = 1; i < levels.length; i++) if (levels[i].height > levels[best].height || (levels[i].height === levels[best].height && levels[i].bitrate > levels[best].bitrate)) best = i;
          hls.startLevel = best;
        }
        if (!startPaused) play();
        updateQualityText();
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, updateQualityText);
      hls.on(Hls.Events.FRAG_BUFFERED, function (e, d) {
        // Duraklatılmış sarmada hedef noktayı içeren parça geldiyse indirmeyi hemen kes.
        var f = d && d.frag;
        if (startPaused && video.paused) {
          // Opened on a still frame (rewind): it's here, stop downloading and show the pause icon.
          startPaused = false; frameOnly = false; stopLoading();
          hideStatus(); el('pauseIcon').classList.remove('hidden');
          if (opts.rewind && rewindLoading) {
            rewindLoading = false;
            var want = Math.max(0, duration() - rewindTarget);
            if (duration() && Math.abs(video.currentTime - want) > 3) { pendingSeek = want; settleSeek(); }
          }
          updateProgress(); showOsd(true);
          return;
        }
        if (frameOnly && video.paused && f && f.start <= video.currentTime + 0.1 && f.start + f.duration > video.currentTime) stopLoading();
      });
      hls.on(Hls.Events.ERROR, function (e, d) {
        if (!d || !d.fatal) return;
        if (d.type === Hls.ErrorTypes.NETWORK_ERROR && retries < 6) {
          retries++;
          status('networkError', '');
          var h = hls;
          retryTimer = setTimeout(function () { if (h === hls) h.startLoad(); }, 1500 * retries);
        } else if (d.type === Hls.ErrorTypes.MEDIA_ERROR && retries < 3) {
          retries++;
          hls.recoverMediaError();
        } else {
          status('playError', d.details || '', true);
          showOsd(true);
        }
      });
      hls.loadSource(url);
      hls.attachMedia(video);
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url;
      video.load();
      if (startAt) video.currentTime = startAt;
      play();
    } else {
      status('playError', I18n.t('hlsUnsupported'), true);
    }
  }

  /* ---------- Duraklatınca indirmeyi durdur ---------- */
  function stopLoading() {
    if (hls && isVod() && !loadingStopped) { hls.stopLoad(); loadingStopped = true; }
  }
  function resumeLoading() {
    setFrameBuffer(false);
    if (hls && loadingStopped) { loadingStopped = false; hls.startLoad(video.currentTime); }
  }
  /* Kare modu: tampon sınırı 1 sn olunca hls.js sadece hedef noktayı içeren tek parçayı indirir. */
  function setFrameBuffer(on) {
    if (!hls) return;
    var c = hls.config;
    c.maxBufferLength = on ? 1 : (isVod() ? 30 : 15);
    c.maxMaxBufferLength = on ? 1 : (isVod() ? 40 : 20);
  }
  function isBuffered(t) {
    for (var i = 0; i < video.buffered.length; i++) if (video.buffered.start(i) <= t + 0.1 && video.buffered.end(i) > t + 0.5) return true;
    return false;
  }

  /* ---------- Video olayları (bir kez bağlanır) ---------- */
  function bindVideo() {
    video = el('video');
    // Show "Buffering" only if the stall lasts: brief decoder hiccups shouldn't flash a message.
    video.addEventListener('waiting', function () {
      clearTimeout(waitTimer);
      waitTimer = setTimeout(function () { if (opts && !video.paused && video.readyState < 3) status('buffering', ''); }, 600);
    });
    video.addEventListener('canplay', function () { clearTimeout(waitTimer); });
    video.addEventListener('playing', function () { clearTimeout(waitTimer); retries = 0; hideStatus(); el('pauseIcon').classList.add('hidden'); showOsd(); });
    video.addEventListener('play', function () { frameOnly = false; el('pauseIcon').classList.add('hidden'); resumeLoading(); });
    video.addEventListener('pause', function () {
      if (!opts || video.ended) return;
      hideStatus();  // duraklatınca dönen arabellek göstergesini kaldır
      if (isVod()) { el('pauseIcon').classList.remove('hidden'); stopLoading(); }
      updateProgress();
      showOsd(true);
    });
    video.addEventListener('seeked', function () {
      // Duraklatılmışken sarıldıysa: o noktadaki kare göründü, gerisini indirme.
      if (frameOnly && video.paused) { frameOnly = false; stopLoading(); hideStatus(); el('pauseIcon').classList.remove('hidden'); updateProgress(); }
    });
    video.addEventListener('timeupdate', function () {
      if (!opts || pendingSeek !== null || !osdVisible()) return;
      var now = Date.now();
      if (now - lastProgressAt < 900) return;
      lastProgressAt = now;
      updateProgress();
    });
    // The picture size is known (or changed): single-quality clips show it as their quality.
    video.addEventListener('resize', function () { if (opts && levels.length === 1) updateQualityText(); });
    video.addEventListener('ended', function () {
      if (!opts) return;
      if (opts.rewind) { rewindReachedEnd(); return; }
      if (isVod()) { Store.setResume(opts.vodId, 0, 0); exit(); }
      else { status('streamEnded', '', true); }
    });
    video.addEventListener('error', function () {
      if (opts && !hls) status('playError', video.error ? 'MEDIA_ERR ' + video.error.code : '', true);
    });
  }

  /* ---------- Sarma ---------- */
  function seekStep() {
    var now = Date.now();
    seekStreak = now - lastSeekAt < 700 ? seekStreak + 1 : 0;
    lastSeekAt = now;
    return seekStreak < 4 ? 10 : seekStreak < 10 ? 30 : seekStreak < 20 ? 60 : 180;
  }
  /* Presses while the recording is still opening: move the target, show how far back. */
  function adjustRewind(dir) {
    rewindTarget = Math.max(10, rewindTarget - dir * seekStep());
    el('osdTime').textContent = I18n.t('behindLive', { t: fmt(rewindTarget + RECORD_LAG_S) });
    showOsd(true);
  }
  function seekBy(dir) {
    if (!isVod()) return;
    if (opts.rewind && rewindLoading) { adjustRewind(dir); return; }
    var step = seekStep();
    var base = pendingSeek !== null ? pendingSeek : video.currentTime, d = duration();
    if (opts.rewind && dir > 0 && d && base + step >= d - 3) { goLive(); return; }
    pendingSeek = Math.max(0, Math.min(d ? d - 3 : base + step, base + dir * step));
    // Sarmaya başlayınca yayını duraklat: sarma sırasında video çözülmesin, boşuna indirilmesin.
    if (!video.paused) video.pause();
    // Seeking again while the previous spot's frame is still downloading: cancel that download,
    // the viewer has moved on. stopLoad() aborts the in-flight request.
    if (frameOnly) {
      frameOnly = false;
      stopLoading();
      hideStatus();
      el('pauseIcon').classList.remove('hidden');
    }
    updateProgress(pendingSeek);
    showOsd(true);
    clearTimeout(seekTimer);
    // Tuşa basmayı bırakıp SEEK_SETTLE_MS beklenince o noktanın tek karesini getir; OK ile oradan devam edilir.
    seekTimer = setTimeout(settleSeek, SEEK_SETTLE_MS);
  }
  /* The seek target is chosen: fetch just that frame (paused) or jump there (playing). */
  function settleSeek() {
    clearTimeout(seekTimer);
    if (pendingSeek === null) return;
    if (!video.paused) { commitSeek(); return; }  // playback already resumed: never use frame-only mode
    var target = pendingSeek;
    pendingSeek = null;
    if (hls) {
      frameOnly = true;
      setFrameBuffer(true);
      if (!isBuffered(target)) {
        loadingStopped = false;
        hls.startLoad(target);
        // The frame needs a download: show a spinner instead of the pause icon until it arrives.
        el('pauseIcon').classList.add('hidden');
        status('buffering', '');
      }
    }
    video.currentTime = target;
    updateProgress();
  }
  /* Apply a seek that is still waiting for the settle delay, right now and with normal buffering.
     Used when the viewer presses play before the delay ends, so playback starts at the target
     instead of playing a moment from the old position first. */
  function commitSeek() {
    if (pendingSeek === null) return false;
    clearTimeout(seekTimer);
    var target = pendingSeek;
    pendingSeek = null;
    frameOnly = false;
    setFrameBuffer(false);
    if (hls && loadingStopped) { loadingStopped = false; hls.startLoad(target); }
    video.currentTime = target;
    updateProgress();
    return true;
  }

  /* ---------- Kalite menüsü ---------- */
  function openMenu() {
    if (!hls || levels.length < 2) return;  // one quality only (clips): no menu
    var listEl = el('qualityList'), selected = null;
    listEl.innerHTML = '';
    var order = levels.map(function (l, i) { return i; }).sort(function (a, b) { return levels[b].height - levels[a].height || levels[b].bitrate - levels[a].bitrate; });
    order.unshift(-1);
    order.forEach(function (idx) {
      var b = document.createElement('button');
      b.className = 'menu-item focusable';
      b.textContent = idx < 0 ? I18n.t('auto') : qualityLabel(idx);
      var isSel = idx < 0 ? hls.autoLevelEnabled : (!hls.autoLevelEnabled && hls.currentLevel === idx);
      if (isSel) { b.classList.add('selected'); selected = b; }
      b.onclick = function () {
        hls.currentLevel = idx;
        Store.set('kickizle.quality', idx < 0 ? 'auto' : levels[idx].height);
        closeMenu();
        updateQualityText();
      };
      listEl.appendChild(b);
    });
    menuOpen = true;
    el('qualityMenu').classList.remove('hidden');
    Nav.setScope(el('qualityMenu'), selected);
    showOsd(true);
  }
  function closeMenu() {
    menuOpen = false;
    el('qualityMenu').classList.add('hidden');
    Nav.setScope(el('player'));
    showOsd();
  }

  /* ---------- Sohbet ---------- */
  function applyChat() {
    el('player').classList.toggle('with-chat', chatOn);
    el('chatPanel').classList.toggle('hidden', !chatOn);
  }
  function toggleChat() {
    if (!opts || isVod()) return;  // past broadcasts and rewind have no chat
    chatOn = !chatOn;
    Store.set('kickizle.chat', chatOn);
    applyChat();
    if (chatOn) Chat.connect(opts.channelId, opts.chatroomId); else Chat.disconnect();
  }

  /* ---------- Rewind ---------- */
  function applyMode() {
    var badge = el('osdLive');
    badge.textContent = I18n.t(opts.rewind ? 'rewindBadge' : 'live');
    badge.className = 'badge ' + (opts.rewind ? 'behind' : 'live') + (isVod() && !opts.rewind ? ' hidden' : '');
    el('progress').classList.toggle('hidden', !isVod());
    el('osdHint').textContent = I18n.t(opts.rewind ? 'hintRewind' : isVod() ? 'hintVod' : 'hintLive');
    if (!isVod()) el('osdTime').textContent = '';
  }
  /* From live: open the recording `back` seconds behind the live picture, paused on that frame. */
  function enterRewind(back) {
    if (!opts || opts.kind !== 'live' || !opts.getRecording) return;
    if (rewindBusy) { adjustRewind(-1); return; }  // already opening: go further back
    rewindBusy = true;
    rewindLoading = true;
    rewindTarget = back;
    seekStep();  // start the press streak so held presses accelerate
    status('loadingStream', '');
    opts.getRecording(function (src, startedAt) {
      rewindBusy = false;
      if (!opts || opts.kind !== 'live') return;
      if (!src) { rewindLoading = false; hideStatus(); toast(I18n.t('rewindUnavailable')); return; }
      // Estimate the recording's length from the stream start; corrected when its playlist loads.
      var started = startedAt ? Date.parse(String(startedAt).replace(' ', 'T') + (/Z|[+-]\d\d:?\d\d$/.test(startedAt) ? '' : 'Z')) : NaN;
      var length = isNaN(started) ? 0 : (Date.now() - started) / 1000 - RECORD_LAG_S;
      opts.liveUrl = opts.url; opts.url = src; opts.kind = 'vod'; opts.rewind = true;
      rewind = { snapAt: Date.now() };
      pendingSeek = null; clearTimeout(seekTimer);
      // The chat belongs to the live moment, not to what you're rewatching: close it (the saved
      // preference stays, so it comes back with live).
      if (chatOn) { chatOn = false; applyChat(); Chat.disconnect(); }
      applyMode();
      showOsd(true);
      load(src, Math.max(0, length - rewindTarget), true);
    });
  }
  /* Back to the live stream (fresh link: the old one may have expired while rewinding). */
  function goLive() {
    if (!opts || !opts.rewind) return;
    clearTimeout(seekTimer); pendingSeek = null; frameOnly = false; startPaused = false;
    rewindLoading = false;
    opts.kind = 'live'; opts.rewind = false; rewind = null;
    if (Store.get('kickizle.chat', true) && !chatOn) { chatOn = true; applyChat(); Chat.connect(opts.channelId, opts.chatroomId); }
    el('pauseIcon').classList.add('hidden');
    applyMode();
    toast(I18n.t('backToLive'));
    status('loadingStream', '');
    var get = opts.getLiveUrl || function (cb) { cb(opts.liveUrl); };
    get(function (url) {
      if (!opts || opts.kind !== 'live') return;
      if (!url) { status('streamEnded', '', true); return; }
      opts.url = url;
      load(url, 0);
    });
  }
  /* Playing reached the end of the recording as it was when opened. Still well behind live
     (e.g. after a long pause)? Reopen the recording where we are; otherwise rejoin live. */
  function rewindReachedEnd() {
    var behind = (Date.now() - rewind.snapAt) / 1000 + RECORD_LAG_S;
    if (behind < 40) { goLive(); return; }
    var at = video.currentTime;
    rewind.snapAt = Date.now();
    status('buffering', '');
    load(opts.url, at);
  }

  /* ---------- Aç / kapat ---------- */
  function open(o, exitCb) {
    if (!video) bindVideo();
    opts = o; onExit = exitCb; retries = 0; menuOpen = false; pendingSeek = null;
    el('qualityMenu').classList.add('hidden');
    el('pauseIcon').classList.add('hidden');
    el('osdChannel').textContent = o.channelName || '';
    el('osdTitle').textContent = o.title || '';
    rewind = null;
    applyMode();  // badge, progress bar and hint for live / past broadcast
    el('osdTime').textContent = '';
    el('osdQuality').textContent = '';
    chatOn = !isVod() && Store.get('kickizle.chat', true);
    applyChat();
    if (chatOn) Chat.connect(o.channelId, o.chatroomId);
    status('loadingStream', '');
    showOsd();
    Nav.setScope(el('player'));

    var startAt = 0;
    if (isVod()) {
      var r = Store.getResume(o.vodId);
      if (r && r.t) { startAt = r.t; toast(I18n.t('resumed', { t: fmt(r.t) })); }
      clearInterval(saveTimer);
      saveTimer = setInterval(function () { if (opts && !video.paused) Store.setResume(opts.vodId, video.currentTime, duration()); }, 10000);
    }
    load(o.url, startAt);
  }

  function stop() {
    loadSeq++;
    if (!opts) return;
    var at = pendingSeek !== null ? pendingSeek : video.currentTime;  // leaving mid-seek keeps the target
    if (isVod() && at > 0) Store.setResume(opts.vodId, at, duration());
    pendingSeek = null;
    clearInterval(saveTimer); clearTimeout(seekTimer); clearTimeout(osdTimer); clearTimeout(retryTimer); clearTimeout(waitTimer);
    Chat.disconnect();
    destroyHls();
    try { video.pause(); video.removeAttribute('src'); video.load(); } catch (e) {}
    rewind = null; rewindBusy = false; rewindLoading = false; startPaused = false;
    opts = null;
  }
  function exit() { stop(); if (onExit) onExit(); }

  /* App in the background (another app, TV menu, screen off): stop the video, downloads, chat and
     timers; nothing runs while you're away. On return a live stream rejoins at the live edge with
     chat; a past broadcast stays paused where it was. */
  var inBackground = false, bgWasPlaying = false;
  function pauseForBackground() {
    if (!opts || inBackground) return;
    inBackground = true;
    bgWasPlaying = !video.paused;
    commitSeek();
    if (!video.paused) video.pause();            // VOD: the pause handler also stops downloading
    if (isVod()) Store.setResume(opts.vodId, video.currentTime, duration());
    else if (hls) { hls.stopLoad(); loadingStopped = true; }
    clearInterval(saveTimer); clearTimeout(osdTimer); clearTimeout(retryTimer); clearTimeout(waitTimer);
    Chat.disconnect();
  }
  function resumeFromBackground() {
    if (!opts || !inBackground) return;
    inBackground = false;
    if (isVod()) {
      saveTimer = setInterval(function () { if (opts && !video.paused) Store.setResume(opts.vodId, video.currentTime, duration()); }, 10000);
      showOsd(true);
      return;
    }
    if (chatOn) Chat.connect(opts.channelId, opts.chatroomId);
    if (hls) {
      loadingStopped = false;
      hls.startLoad(-1);
      if (hls.liveSyncPosition) video.currentTime = hls.liveSyncPosition;
    }
    if (bgWasPlaying) play();
    showOsd();
  }

  function togglePause() {
    if (!isVod()) { if (video.paused) play(); return; }
    if (commitSeek()) { play(); return; }
    if (video.paused) play(); else video.pause();
  }

  function handleKey(code) {
    if (!opts) return false;
    if (menuOpen) {
      if (code === K.UP) Nav.move('up');
      else if (code === K.DOWN) Nav.move('down');
      else if (code === K.ENTER) { var f = Nav.getFocused(); if (f) f.click(); }
      else if (Nav.isBack(code)) closeMenu();
      return true;
    }
    // Bilgi çubuğu gizliyken ↑ ← → ilk basışta sadece çubuğu açar; işlem ikinci basışta yapılır.
    // (Yanlışlıkla sarma/duraklatma ya da kalite menüsü açılmasın. ⏪ ⏩ ⏯ ve OK her zaman doğrudan çalışır.)
    var wasHidden = !osdVisible();
    showOsd();
    if (wasHidden && (code === K.UP || code === K.LEFT || code === K.RIGHT)) return true;
    switch (code) {
      case K.UP: openMenu(); break;
      case K.DOWN: toggleChat(); break;
      case K.LEFT: case K.RW: if (opts.kind === 'live') enterRewind(10); else seekBy(-1); break;
      case K.RIGHT: case K.FF: seekBy(1); break;
      case K.ENTER: case K.PLAYPAUSE: case K.SPACE: togglePause(); break;
      case K.PLAY: commitSeek(); play(); break;
      case K.PAUSE: if (isVod()) video.pause(); break;
      case K.STOP: exit(); break;
      default: if (Nav.isBack(code)) exit(); else return false;
    }
    return true;
  }

  var toastTimer = null;
  function toast(msg, ms) {
    var t = el('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.add('hidden'); }, ms || 3500);
  }

  return { open: open, stop: stop, preload: preload, prefetch: prefetchManifest, handleKey: handleKey,
    pauseForBackground: pauseForBackground, resumeFromBackground: resumeFromBackground, toast: toast, isOpen: function () { return !!opts; } };
}());
