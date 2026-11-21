/* Web tabanlı oynatıcı: hls.js + HTML5 video (kick.com'un tarayıcıda kullandığı yönteme benzer). */
var Player = (function () {
  'use strict';
  var K = Nav.KEY;
  var video, hls = null, opts = null, onExit = null;
  var osdTimer = null, seekTimer = null, saveTimer = null, retryTimer = null;
  var pendingSeek = null, lastSeekAt = 0, seekStreak = 0, retries = 0;
  var menuOpen = false, chatOn = false, levels = [];
  var loadingStopped = false, frameOnly = false, lastProgressAt = 0;
  var SEEK_SETTLE_MS = 2000;  // sarmayı bıraktıktan sonra karenin yükleneceği bekleme süresi

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
    if (!keep && !menuOpen && !(isVod() && video.paused)) osdTimer = setTimeout(function () { el('osd').classList.add('faded'); }, 4000);
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
    el('osdTime').textContent = fmt(t) + ' / ' + fmt(d) + (video.paused ? '  ·  ' + I18n.t('paused') : '');
  }
  function qualityLabel(i) {
    var l = levels[i]; if (!l) return '';
    var fps = l.frameRate && l.frameRate > 31 ? Math.round(l.frameRate) : '';
    return l.height + 'p' + fps;
  }
  function updateQualityText() {
    if (!hls) { el('osdQuality').textContent = ''; return; }
    var cur = hls.currentLevel, txt = cur >= 0 ? qualityLabel(cur) : '';
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
  function load(url, startAt) {
    destroyHls();
    clearTimeout(retryTimer);
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
      hls = new Hls(cfg);
      loadingStopped = false; frameOnly = false;
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
        play();
        updateQualityText();
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, updateQualityText);
      hls.on(Hls.Events.FRAG_BUFFERED, function (e, d) {
        // Duraklatılmış sarmada hedef noktayı içeren parça geldiyse indirmeyi hemen kes.
        var f = d && d.frag;
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
      status('playError', 'HLS desteklenmiyor', true);
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
    video.addEventListener('waiting', function () { if (opts && !video.paused) status('buffering', ''); });
    video.addEventListener('playing', function () { retries = 0; hideStatus(); el('pauseIcon').classList.add('hidden'); showOsd(); });
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
    video.addEventListener('ended', function () {
      if (!opts) return;
      if (isVod()) { Store.setResume(opts.vodId, 0, 0); exit(); }
      else { status('streamEnded', '', true); }
    });
    video.addEventListener('error', function () {
      if (opts && !hls) status('playError', video.error ? 'MEDIA_ERR ' + video.error.code : '', true);
    });
  }

  /* ---------- Sarma ---------- */
  function seekBy(dir) {
    if (!isVod()) return;
    var now = Date.now();
    seekStreak = now - lastSeekAt < 700 ? seekStreak + 1 : 0;
    lastSeekAt = now;
    var step = seekStreak < 4 ? 10 : seekStreak < 10 ? 30 : seekStreak < 20 ? 60 : 180;
    var base = pendingSeek !== null ? pendingSeek : video.currentTime, d = duration();
    pendingSeek = Math.max(0, Math.min(d ? d - 3 : base + step, base + dir * step));
    // Sarmaya başlayınca yayını duraklat: sarma sırasında video çözülmesin, boşuna indirilmesin.
    if (!video.paused) video.pause();
    updateProgress(pendingSeek);
    showOsd(true);
    clearTimeout(seekTimer);
    // Tuşa basmayı bırakıp SEEK_SETTLE_MS beklenince o noktanın tek karesini getir; OK ile oradan devam edilir.
    seekTimer = setTimeout(function () {
      if (pendingSeek === null) return;
      var target = pendingSeek;
      pendingSeek = null;
      if (hls) {
        frameOnly = true;
        setFrameBuffer(true);
        if (!isBuffered(target)) { loadingStopped = false; hls.startLoad(target); }
      }
      video.currentTime = target;
      updateProgress();
    }, SEEK_SETTLE_MS);
  }

  /* ---------- Kalite menüsü ---------- */
  function openMenu() {
    if (!hls || !levels.length) return;
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
    if (isVod() || !opts) return;
    chatOn = !chatOn;
    Store.set('kickizle.chat', chatOn);
    applyChat();
    if (chatOn) Chat.connect(opts.channelId, opts.chatroomId); else Chat.disconnect();
  }

  /* ---------- Aç / kapat ---------- */
  function open(o, exitCb) {
    if (!video) bindVideo();
    opts = o; onExit = exitCb; retries = 0; menuOpen = false; pendingSeek = null;
    el('qualityMenu').classList.add('hidden');
    el('pauseIcon').classList.add('hidden');
    el('osdChannel').textContent = o.channelName || '';
    el('osdTitle').textContent = o.title || '';
    el('osdLive').textContent = I18n.t('live');
    el('osdLive').classList.toggle('hidden', isVod());
    el('progress').classList.toggle('hidden', !isVod());
    el('osdTime').textContent = '';
    el('osdHint').textContent = I18n.t(isVod() ? 'hintVod' : 'hintLive');
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
    if (!opts) return;
    if (isVod() && video.currentTime > 0) Store.setResume(opts.vodId, video.currentTime, duration());
    clearInterval(saveTimer); clearTimeout(seekTimer); clearTimeout(osdTimer); clearTimeout(retryTimer);
    Chat.disconnect();
    destroyHls();
    try { video.pause(); video.removeAttribute('src'); video.load(); } catch (e) {}
    opts = null;
  }
  function exit() { stop(); if (onExit) onExit(); }

  function pauseForBackground() { if (opts && !video.paused) { video.pause(); if (isVod()) Store.setResume(opts.vodId, video.currentTime, duration()); } }

  function togglePause() {
    if (!isVod()) { if (video.paused) play(); return; }
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
    showOsd();
    switch (code) {
      case K.UP: openMenu(); break;
      case K.DOWN: toggleChat(); break;
      case K.LEFT: case K.RW: seekBy(-1); break;
      case K.RIGHT: case K.FF: seekBy(1); break;
      case K.ENTER: case K.PLAYPAUSE: case K.SPACE: togglePause(); break;
      case K.PLAY: play(); break;
      case K.PAUSE: if (isVod()) video.pause(); break;
      case K.STOP: exit(); break;
      default: if (Nav.isBack(code)) exit(); else return false;
    }
    return true;
  }

  var toastTimer = null;
  function toast(msg) {
    var t = el('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.add('hidden'); }, 3500);
  }

  return { open: open, stop: stop, handleKey: handleKey, pauseForBackground: pauseForBackground, toast: toast, isOpen: function () { return !!opts; } };
}());
