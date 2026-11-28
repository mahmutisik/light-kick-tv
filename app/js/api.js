/* Kick'in herkese açık uç noktaları. Hesap gerektirmez. */
var Api = (function () {
  'use strict';
  // Bilgisayarda tarayıcıyla test ederken (localhost) istekler dev/server.js proxy'si üzerinden gider.
  var DEV = /^https?:$/.test(location.protocol) && /^(localhost|127\.0\.0\.1)$/.test(location.hostname);

  function proxied(url) { return DEV ? '/proxy?u=' + encodeURIComponent(url) : url; }
  // Dev only: ?simulate=offline makes Kick requests fail, ?simulate=slow delays them 12 s (to test start-up errors).
  var simulate = DEV ? ((/[?&]simulate=(offline|slow)/.exec(location.search) || [])[1] || '') : '';

  function request(method, url, body, callback, timeout) {
    var xhr = new XMLHttpRequest(), done = false;
    function finish(err, data) { if (done) return; done = true; callback(err, data); }
    if (simulate === 'offline') { setTimeout(function () { finish({ status: 'network' }); }, 300); return xhr; }
    if (simulate === 'slow') { var real = callback; callback = function (e, d) { setTimeout(function () { real(e, d); }, 12000); }; }
    try {
      xhr.open(method, proxied(url), true);
      xhr.timeout = timeout || 15000;
      xhr.setRequestHeader('Accept', 'application/json');
      if (body) xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) return;
        if (xhr.status < 200 || xhr.status >= 300) { finish({ status: xhr.status }); return; }
        try { finish(null, JSON.parse(xhr.responseText)); } catch (e) { finish({ status: 'parse' }); }
      };
      xhr.onerror = function () { finish({ status: 'network' }); };
      xhr.ontimeout = function () { finish({ status: 'timeout' }); };
      xhr.send(body ? JSON.stringify(body) : null);
    } catch (e) { finish({ status: 'exception' }); }
    return xhr;
  }
  function get(url, cb) { return request('GET', url, null, cb); }

  /* Short-lived response cache: re-opening a channel within 2 minutes is instant and costs no
     network or parsing. `fresh` skips it (e.g. right before playing, the stream token must be new). */
  var cache = {}, CACHE_MS = 120000;
  function cachedGet(url, cb, fresh) {
    var now = Date.now(), hit = cache[url];
    if (!fresh && hit && now - hit.at < CACHE_MS) { setTimeout(function () { cb(null, hit.data, hit.at); }, 0); return null; }
    return get(url, function (err, data) {
      var at = Date.now();
      if (!err) {
        cache[url] = { at: at, data: data };
        var keys = Object.keys(cache);
        if (keys.length > 40) keys.forEach(function (k) { if (Date.now() - cache[k].at >= CACHE_MS) delete cache[k]; });
      }
      cb(err, data, at);
    });
  }

  function pickImage(img, wanted) {
    if (!img) return '';
    if (typeof img === 'string') return img;
    if (img.srcset) {
      var best = '', bestDiff = 1e9, parts = img.srcset.split(',');
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i].replace(/^\s+|\s+$/g, '').split(/\s+/), w = parseInt(p[1], 10) || 0;
        var diff = Math.abs(w - (wanted || 640));
        if (p[0] && diff < bestDiff) { best = p[0]; bestDiff = diff; }
      }
      if (best) return best;
    }
    return img.src || img.url || '';
  }
  function userPic(u) { return (u && (u.profile_pic || u.profilepic)) || ''; }

  /* Live streams for a filter: { langs: ['tr','en'] (empty = all languages), sort: 'featured'|'viewers' }.
     Uses web.kick.com's list, which (unlike kick.com/stream/livestreams) honours the language when
     sorting by viewers and accepts several languages. Paged with an opaque `after` cursor. */
  function livestreams(filter, cursor, cb) {
    var url = 'https://web.kick.com/api/v1/livestreams?limit=24&sort=' + (filter.sort === 'viewers' ? 'viewer_count_desc' : 'featured');
    (filter.langs || []).forEach(function (l) { url += '&language=' + encodeURIComponent(l); });
    if (cursor) url += '&after=' + encodeURIComponent(cursor);
    get(url, function (err, d) {
      if (err) { cb(err); return; }
      var data = (d && d.data) || {}, list = data.livestreams || [];
      cb(null, {
        next: (data.pagination && data.pagination.next_cursor) || null,
        items: list.map(function (x) {
          var ch = x.channel || {};
          return {
            slug: ch.slug, name: ch.username || ch.slug, pic: ch.profile_pic || '',
            title: x.title || '', viewers: x.viewer_count || 0,
            category: x.category ? x.category.name : '',
            thumb: pickImage(x.thumbnail, 480)
          };
        }).filter(function (x) { return !!x.slug; })
      });
    });
  }

  function channel(slug, cb, fresh) {
    cachedGet('https://kick.com/api/v2/channels/' + encodeURIComponent(slug), function (err, d, fetchedAt) {
      if (err) { cb(err); return; }
      var u = d.user || {}, ls = d.livestream || null;
      cb(null, {
        fetchedAt: fetchedAt || Date.now(),
        id: d.id, slug: d.slug || slug, name: u.username || slug, pic: userPic(u),
        followers: d.followers_count || d.followersCount || 0,
        chatroomId: d.chatroom && d.chatroom.id,
        live: !!(ls && ls.is_live !== false && d.playback_url),
        playbackUrl: d.playback_url || '',
        title: ls ? ls.session_title || '' : '',
        viewers: ls ? ls.viewer_count || 0 : 0,
        thumb: ls ? pickImage(ls.thumbnail, 480) : '',
        category: ls && ls.categories && ls.categories[0] ? ls.categories[0].name : ''
      });
    }, fresh);
  }

  /* Sadece canlı yayın bilgisi (küçük yanıt). Çevrimdışıysa null döner. */
  function livestream(slug, cb) {
    get('https://kick.com/api/v2/channels/' + encodeURIComponent(slug) + '/livestream', function (err, d) {
      if (err) { cb(err); return; }
      var x = d && d.data;
      if (!x) { cb(null, null); return; }
      cb(null, {
        title: x.session_title || '', viewers: x.viewers || x.viewer_count || 0,
        category: x.category ? x.category.name : '', thumb: pickImage(x.thumbnail, 480)
      });
    });
  }

  /* Past-broadcast preview. Since late Nov 2026 Kick's API gives every past broadcast the same
     image (the channel's current thumbnail). Each broadcast still has its own preview on
     images.kick.com, addressed by the two IDs in its video URL:
       stream.kick.com/.../ivs/v1/<account>/<contentId>/<y>/<m>/<d>/<h>/<min>/<sessionId>/media/hls/master.m3u8
       -> images.kick.com/video_thumbnails/<contentId>/<sessionId>/480.webp
     The API's image is kept as a fallback layer under it. */
  function vodThumbs(x) {
    var api = pickImage(x.thumbnail, 480);
    if (/images\.kick\.com\/video_thumbnails\//.test(api)) return { thumb: api, fallback: '' };  // already per-broadcast
    var m = /\/ivs\/v1\/\d+\/([A-Za-z0-9]+)\/\d+\/\d+\/\d+\/\d+\/\d+\/([A-Za-z0-9]+)\/media\//.exec(x.source || '');
    if (!m) return { thumb: api, fallback: '' };
    return { thumb: 'https://images.kick.com/video_thumbnails/' + m[1] + '/' + m[2] + '/480.webp', fallback: api };
  }

  function videos(slug, cb) {
    cachedGet('https://kick.com/api/v2/channels/' + encodeURIComponent(slug) + '/videos', function (err, d) {
      if (err) { cb(err); return; }
      var list = Array.isArray(d) ? d : (d && d.data) || [];
      cb(null, list.map(function (x) {
        var th = vodThumbs(x);
        return {
          id: (x.video && x.video.uuid) || String(x.id), title: x.session_title || '',
          source: x.source || '', duration: (x.duration || 0) / 1000, ongoing: !!x.is_live,
          created: x.start_time || x.created_at || '', views: (x.video && x.video.views) || x.views || 0,
          category: x.categories && x.categories[0] ? x.categories[0].name : '',
          thumb: th.thumb, thumbFallback: th.fallback
        };
      }).filter(function (x) { return !!x.source; }));
    });
  }

  function search(query, cb) {
    return get('https://kick.com/api/search?searched_word=' + encodeURIComponent(query), function (err, d) {
      if (err) { cb(err); return; }
      cb(null, ((d && d.channels) || []).map(function (c) {
        var u = c.user || {};
        return {
          slug: c.slug, name: u.username || c.slug, pic: userPic(u),
          followers: c.followers_count || c.followersCount || 0, live: !!(c.isLive || c.is_live)
        };
      }).filter(function (x) { return !!x.slug; }));
    });
  }

  /* Recent chat messages of a live channel (Kick returns the last ~25, newest first). */
  function chatHistory(channelId, cb) {
    get('https://kick.com/api/v2/channels/' + encodeURIComponent(channelId) + '/messages', function (err, d) {
      if (err) { cb(err); return; }
      var list = (d && d.data && d.data.messages) || [];
      cb(null, list.map(function (m) {
        var s = m.sender || {};
        return { id: m.id, user: s.username || '?', color: (s.identity || {}).color, content: m.content || '' };
      }).filter(function (m) { return !!m.content; }));
    });
  }

  /* Sohbet için Pusher ayarlarını Kick'ten öğren; olmazsa bilinen değeri kullan. */
  function chatConfig(channelId, cb) {
    var fallback = { key: '34bf7a0ff419a2a775b9', cluster: 'us2' };
    var id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.floor(Math.random() * 16); return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    });
    request('POST', 'https://web.kick.com/api/v1/realtime/channels/' + encodeURIComponent(channelId) + '/chat/connection',
      { client: { id: id, type: 'web' }, capabilities: { accepted_providers: [{ provider: 'pusher' }] } },
      function (err, d) {
        var items = (!err && d && d.data && d.data.connections) || [];
        for (var i = 0; i < items.length; i++) {
          var c = items[i].credentials || {};
          if (items[i].provider === 'pusher' && /^[a-zA-Z0-9]{8,64}$/.test(c.app_key || '') && /^[a-z0-9-]{1,24}$/.test(c.cluster || '')) {
            cb({ key: c.app_key, cluster: c.cluster }); return;
          }
        }
        cb(fallback);
      }, 6000);
  }

  return {
    DEV: DEV, proxied: proxied,
    setSimulate: function (mode) { if (DEV) simulate = mode || ''; },
    livestreams: livestreams, channel: channel, livestream: livestream, videos: videos, chatHistory: chatHistory, search: search, chatConfig: chatConfig
  };
}());
