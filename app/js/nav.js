/* Kumanda ile yön tuşu gezinmesi (spatial navigation) ve tuş kodları. */
var Nav = (function () {
  'use strict';
  var KEY = {
    LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13, BACK: 10009, ESC: 27, BACKSPACE: 8,
    PLAY: 415, PAUSE: 19, PLAYPAUSE: 10252, STOP: 413, FF: 417, RW: 412, SPACE: 32,
    IME_DONE: 65376, IME_CANCEL: 65385
  };
  var scope = null, focused = null, focusHook = null;

  function registerKeys() {
    try {
      if (window.tizen && tizen.tvinputdevice) {
        var keys = ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'MediaStop', 'MediaFastForward', 'MediaRewind'];
        if (tizen.tvinputdevice.registerKeyBatch) tizen.tvinputdevice.registerKeyBatch(keys);
        else for (var i = 0; i < keys.length; i++) tizen.tvinputdevice.registerKey(keys[i]);
      }
    } catch (e) {}
  }

  /* One pass: each focusable's position is read exactly once per key press. Hidden elements
     (display:none screens, hidden sections) have an empty rect and are skipped. */
  function candidates() {
    if (!scope) return [];
    var all = scope.querySelectorAll('.focusable'), out = [];
    for (var i = 0; i < all.length; i++) {
      var r = all[i].getBoundingClientRect();
      if (r.width > 0 && r.height > 0) out.push({ el: all[i], r: r });
    }
    return out;
  }
  function indexOfEl(list, el) { for (var i = 0; i < list.length; i++) if (list[i].el === el) return i; return -1; }

  function scrollIntoView(el) {
    var sc = el.parentNode;
    while (sc && sc !== document.body && !(sc.classList && sc.classList.contains('scroller'))) sc = sc.parentNode;
    if (!sc || sc === document.body) return;
    var er = el.getBoundingClientRect(), sr = sc.getBoundingClientRect(), margin = 90;
    // Öğenin içerikteki konumu: en üste kaydırınca da görünüyorsa başlıkları göstermek için en üste dön.
    var offset = er.top - sr.top + sc.scrollTop;
    if (offset + er.height + margin <= sc.clientHeight) { sc.scrollTop = 0; return; }
    if (er.top < sr.top + margin) sc.scrollTop -= (sr.top + margin - er.top);
    else if (er.bottom > sr.bottom - margin) sc.scrollTop += (er.bottom - (sr.bottom - margin));
  }

  function focus(el) {
    if (!el) return;
    if (focused && focused !== el) {
      focused.classList.remove('focused');
      if (focused.tagName === 'INPUT') focused.blur();
    }
    focused = el;
    el.classList.add('focused');
    scrollIntoView(el);
    if (el.onfocusnav) el.onfocusnav();
    if (focusHook) focusHook(el);
  }

  function move(dir) {
    var list = candidates();
    if (!list.length) return false;
    var at = focused ? indexOfEl(list, focused) : -1;
    if (at < 0) { focus(list[0].el); return true; }
    var cr = list[at].r, cx = cr.left + cr.width / 2, cy = cr.top + cr.height / 2;
    var vertical = dir === 'up' || dir === 'down', found = [];
    for (var i = 0; i < list.length; i++) {
      if (i === at) continue;
      var el = list[i].el, r = list[i].r, x = r.left + r.width / 2, y = r.top + r.height / 2;
      var main, cross, overlap;
      if (dir === 'left') { if (r.right > cr.left + 4) continue; main = cr.left - r.right; cross = Math.abs(y - cy); }
      else if (dir === 'right') { if (r.left < cr.right - 4) continue; main = r.left - cr.right; cross = Math.abs(y - cy); }
      else if (dir === 'up') { if (r.bottom > cr.top + 4) continue; main = cr.top - r.bottom; cross = Math.abs(x - cx); }
      else { if (r.top < cr.bottom - 4) continue; main = r.top - cr.bottom; cross = Math.abs(x - cx); }
      // Geniş bir öğeden (ör. arama kutusu) yukarı/aşağı inerken en soldaki öğeye git, ortadakine değil.
      if (vertical && cr.width > r.width * 1.5) cross = Math.abs(r.left - cr.left);
      overlap = vertical ? false : (r.top < cr.bottom - 4 && r.bottom > cr.top + 4);
      found.push({ el: el, main: Math.max(main, 0), cross: cross, overlap: overlap });
    }
    if (!found.length) return false;
    var pool = found;
    if (vertical) {
      // Yukarı/aşağı: önce en yakın satır, sonra o satırda yatayda en yakın öğe.
      var minMain = Infinity;
      found.forEach(function (c) { if (c.main < minMain) minMain = c.main; });
      pool = found.filter(function (c) { return c.main <= minMain + 30; });
    } else {
      // Sola/sağa: aynı satırdakiler öncelikli.
      var sameRow = found.filter(function (c) { return c.overlap; });
      if (sameRow.length) pool = sameRow;
    }
    var best = null, bestScore = Infinity;
    pool.forEach(function (c) {
      var score = vertical ? c.cross : c.main + c.cross * 2.5;
      if (score < bestScore) { bestScore = score; best = c.el; }
    });
    focus(best);
    return true;
  }

  /* Gezinme alanını değiştir (ekran ya da menü). preferred verilirse ona odaklan. */
  function setScope(el, preferred) {
    scope = el;
    var list = candidates();
    if (preferred && indexOfEl(list, preferred) >= 0) focus(preferred);
    else if (focused && indexOfEl(list, focused) >= 0) focus(focused);
    else if (list.length) focus(list[0].el);
    else focused = null;
  }

  function isBack(code) { return code === KEY.BACK || code === KEY.ESC || code === KEY.BACKSPACE; }

  return {
    KEY: KEY, registerKeys: registerKeys, move: move, focus: focus, setScope: setScope,
    getFocused: function () { return focused; }, isBack: isBack,
    onFocus: function (fn) { focusHook = fn; }
  };
}());
