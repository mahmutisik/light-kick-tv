/* TV üzerinde kalıcı küçük veriler: son kanallar, VOD devam noktaları, tercihler. */
var Store = (function () {
  'use strict';
  function read(key, fallback) {
    try { var v = JSON.parse(localStorage.getItem(key)); return v === null || v === undefined ? fallback : v; } catch (e) { return fallback; }
  }
  function write(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {} }

  function recent() { return read('kickizle.recent', []); }
  function addRecent(ch) {
    if (!ch || !ch.slug) return;
    var list = recent().filter(function (x) { return x.slug !== ch.slug; });
    list.unshift({ slug: ch.slug, name: ch.name || ch.slug, pic: ch.pic || '' });
    write('kickizle.recent', list.slice(0, 8));
  }

  /* Takip edilen kanallar: sadece bu TV'de tutulur, Kick hesabı gerekmez. */
  function follows() { return read('kickizle.follows', []); }
  function isFollowed(slug) { return follows().some(function (x) { return x.slug === slug; }); }
  function follow(ch) {
    if (!ch || !ch.slug || isFollowed(ch.slug)) return;
    var list = follows();
    list.unshift({ slug: ch.slug, name: ch.name || ch.slug, pic: ch.pic || '' });
    write('kickizle.follows', list.slice(0, 50));
  }
  function unfollow(slug) { write('kickizle.follows', follows().filter(function (x) { return x.slug !== slug; })); }

  /* Arama geçmişi: en yeni başta, en fazla 10, büyük/küçük harf farkı yok sayılır. */
  function searches() { return read('kickizle.searches', []); }
  function addSearch(q) {
    q = String(q || '').replace(/^\s+|\s+$/g, '');
    if (q.length < 2) return;
    var low = q.toLowerCase();
    var list = searches().filter(function (x) { return x.toLowerCase() !== low; });
    list.unshift(q);
    write('kickizle.searches', list.slice(0, 10));
  }
  function clearSearches() { write('kickizle.searches', []); }

  function resumeAll() { return read('kickizle.resume', {}); }
  function getResume(id) { var r = resumeAll()[id]; return r || null; }
  function setResume(id, time, duration) {
    if (!id) return;
    var all = resumeAll();
    // Within the last minute counts as watched to the end: no resume point (it starts from the
    // beginning next time), but it is remembered as watched.
    if (time >= 30 && duration && duration - time < 60) setWatched(id);
    if (!time || time < 30 || (duration && duration - time < 60)) delete all[id];
    else all[id] = { t: Math.floor(time), d: Math.floor(duration || 0), at: Date.now() };
    var ids = Object.keys(all).sort(function (a, b) { return all[b].at - all[a].at; });
    for (var i = 60; i < ids.length; i++) delete all[ids[i]];
    write('kickizle.resume', all);
  }

  /* What "Continue watching" needs to show and play a broadcast without opening its channel
     (title, picture, video address...), kept for the 20 most recently played. */
  function saveContinue(v) {
    if (!v || !v.id || !v.source) return;
    var all = read('kickizle.continue', {});
    all[v.id] = { id: v.id, source: v.source, title: v.title || '', thumb: v.thumb || '', thumbFallback: v.thumbFallback || '',
      duration: v.duration || 0, created: v.created || '', channel: v.channel || '', slug: v.slug || '', at: Date.now() };
    var ids = Object.keys(all).sort(function (a, b) { return all[b].at - all[a].at; });
    for (var i = 20; i < ids.length; i++) delete all[ids[i]];
    write('kickizle.continue', all);
  }
  /* Half-watched broadcasts (a resume point exists), most recently watched first. */
  function continueList(max) {
    var all = read('kickizle.continue', {}), res = resumeAll();
    return Object.keys(all).filter(function (id) { return res[id] && res[id].t; })
      .sort(function (a, b) { return res[b].at - res[a].at; })
      .slice(0, max).map(function (id) { return all[id]; });
  }

  /* Past broadcasts watched to the end (id -> when), the newest 200. */
  function watchedAll() { return read('kickizle.watched', {}); }
  function isWatched(id) { return !!(id && watchedAll()[id]); }
  function setWatched(id) {
    if (!id) return;
    var all = watchedAll();
    all[id] = Date.now();
    var ids = Object.keys(all).sort(function (a, b) { return all[b] - all[a]; });
    for (var i = 200; i < ids.length; i++) delete all[ids[i]];
    write('kickizle.watched', all);
  }

  return {
    get: read, set: write,
    recent: recent, addRecent: addRecent,
    follows: follows, isFollowed: isFollowed, follow: follow, unfollow: unfollow,
    searches: searches, addSearch: addSearch, clearSearches: clearSearches,
    getResume: getResume, setResume: setResume, isWatched: isWatched, setWatched: setWatched,
    saveContinue: saveContinue, continueList: continueList
  };
}());
