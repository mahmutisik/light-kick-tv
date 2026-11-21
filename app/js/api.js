/* Kick'in herkese açık uç noktaları. Hesap gerektirmez. */
var Api = (function () {
  'use strict';
  // Bilgisayarda tarayıcıyla test ederken (localhost) istekler dev/server.js proxy'si üzerinden gider.
  var DEV = /^https?:$/.test(location.protocol) && /^(localhost|127\.0\.0\.1)$/.test(location.hostname);

  function proxied(url) { return DEV ? '/proxy?u=' + encodeURIComponent(url) : url; }

  function request(method, url, body, callback, timeout) {
    var xhr = new XMLHttpRequest(), done = false;
    function finish(err, data) { if (done) return; done = true; callback(err, data); }
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

  /* Belirli bir dildeki canlı yayınlar (sayfalı). */
  function livestreams(lang, page, cb) {
    get('https://kick.com/stream/livestreams/' + lang + '?limit=24&sort=featured&page=' + (page || 1), function (err, data) {
      if (err) { cb(err); return; }
      var list = (data && data.data) || [];
      cb(null, {
        hasMore: !!(data && data.next_page_url),
        items: list.map(function (x) {
          var ch = x.channel || {}, u = ch.user || {};
          return {
            slug: ch.slug, name: u.username || ch.slug, pic: userPic(u),
            title: x.session_title || '', viewers: x.viewer_count || x.viewers || 0,
            category: x.categories && x.categories[0] ? x.categories[0].name : '',
            thumb: pickImage(x.thumbnail, 480)
          };
        }).filter(function (x) { return !!x.slug; })
      });
    });
  }

  function channel(slug, cb) {
    get('https://kick.com/api/v2/channels/' + encodeURIComponent(slug), function (err, d) {
      if (err) { cb(err); return; }
      var u = d.user || {}, ls = d.livestream || null;
      cb(null, {
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
    });
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

  function videos(slug, cb) {
    get('https://kick.com/api/v2/channels/' + encodeURIComponent(slug) + '/videos', function (err, d) {
      if (err) { cb(err); return; }
      var list = Array.isArray(d) ? d : (d && d.data) || [];
      cb(null, list.map(function (x) {
        return {
          id: (x.video && x.video.uuid) || String(x.id), title: x.session_title || '',
          source: x.source || '', duration: (x.duration || 0) / 1000, ongoing: !!x.is_live,
          created: x.start_time || x.created_at || '', views: (x.video && x.video.views) || x.views || 0,
          category: x.categories && x.categories[0] ? x.categories[0].name : '',
          thumb: pickImage(x.thumbnail, 480)
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
    livestreams: livestreams, channel: channel, livestream: livestream, videos: videos, search: search, chatConfig: chatConfig
  };
}());
