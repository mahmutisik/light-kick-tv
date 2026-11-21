/* Arayüz metinleri (Türkçe varsayılan, İngilizce yedek). */
var I18n = (function () {
  'use strict';
  var dict = {
    tr: {
      search: 'Ara', langTr: 'Türkçe yayınlar', langEn: 'İngilizce yayınlar', uiLang: 'Arayüz: TR',
      recentChannels: 'Son izlenen kanallar', liveNow: '{lang} canlı yayınlar', langNameTr: 'Türkçe', langNameEn: 'İngilizce',
      loading: 'Yükleniyor…', loadFailed: 'Yüklenemedi. Tekrar denemek için OK tuşuna basın.', nothingLive: 'Şu an canlı yayın bulunamadı.',
      viewers: '{n} izleyici', followers: '{n} takipçi', views: '{n} görüntülenme',
      searchPlaceholder: 'Yayıncı adı yazın…', searchHint: 'Aramak için yazın ve onaylayın.', noResults: 'Sonuç bulunamadı.',
      watchLive: '▶  Canlı izle', pastBroadcasts: 'Geçmiş yayınlar', noVods: 'Bu kanalın geçmiş yayını yok.', offline: 'Çevrimdışı',
      ongoing: 'DEVAM EDİYOR', today: 'Bugün', yesterday: 'Dün', daysAgo: '{n} gün önce',
      live: 'CANLI', liveChat: 'Sohbet', chatConnecting: 'bağlanıyor…', chatConnected: 'bağlı', chatOffline: 'bağlantı yok',
      quality: 'Görüntü kalitesi', auto: 'Otomatik', loadingStream: 'Yayın yükleniyor…', buffering: 'Arabelleğe alınıyor…',
      playError: 'Yayın oynatılamadı', networkError: 'Bağlantı hatası, yeniden deneniyor…', streamEnded: 'Yayın sona erdi',
      hintLive: '↑ kalite · ↓ sohbet · Geri: çıkış', hintVod: '← → sar (duraklatır) · OK oynat/duraklat · ↑ kalite · Geri: çıkış',
      resumed: 'Kaldığınız yerden devam ediliyor ({t})', paused: 'Duraklatıldı', exitHint: 'Çıkmak için Geri tuşuna tekrar basın',
      follow: '+  Takip et', following: '✓  Takip ediliyor', followedToast: '{name} takip edildi', unfollowedToast: '{name} takipten çıkarıldı',
      followedLive: 'Takip edilen canlı yayınlar', noFollowedLive: 'Takip ettiğin kanallardan şu an canlı olan yok.',
      settings: 'Ayarlar', followedChannels: 'Takip edilen kanallar', uiLanguage: 'Arayüz dili', remove: 'Kaldır',
      noFollows: 'Henüz kanal takip etmiyorsun. Bir kanala girip "Takip et"e bas.',
      recentSearches: 'Son aramalar', clearHistory: '✕  Geçmişi temizle'
    },
    en: {
      search: 'Search', langTr: 'Turkish streams', langEn: 'English streams', uiLang: 'UI: EN',
      recentChannels: 'Recently watched channels', liveNow: '{lang} live streams', langNameTr: 'Turkish', langNameEn: 'English',
      loading: 'Loading…', loadFailed: 'Could not load. Press OK to retry.', nothingLive: 'No live streams found right now.',
      viewers: '{n} viewers', followers: '{n} followers', views: '{n} views',
      searchPlaceholder: 'Type a streamer name…', searchHint: 'Type and confirm to search.', noResults: 'No results.',
      watchLive: '▶  Watch live', pastBroadcasts: 'Past broadcasts', noVods: 'This channel has no past broadcasts.', offline: 'Offline',
      ongoing: 'ONGOING', today: 'Today', yesterday: 'Yesterday', daysAgo: '{n} days ago',
      live: 'LIVE', liveChat: 'Chat', chatConnecting: 'connecting…', chatConnected: 'connected', chatOffline: 'disconnected',
      quality: 'Video quality', auto: 'Automatic', loadingStream: 'Loading stream…', buffering: 'Buffering…',
      playError: 'Playback failed', networkError: 'Connection problem, retrying…', streamEnded: 'Stream ended',
      hintLive: '↑ quality · ↓ chat · Back: exit', hintVod: '← → seek (pauses) · OK play/pause · ↑ quality · Back: exit',
      resumed: 'Resuming where you left off ({t})', paused: 'Paused', exitHint: 'Press Back again to exit',
      follow: '+  Follow', following: '✓  Following', followedToast: 'Following {name}', unfollowedToast: 'Unfollowed {name}',
      followedLive: 'Followed channels live now', noFollowedLive: 'None of your followed channels are live right now.',
      settings: 'Settings', followedChannels: 'Followed channels', uiLanguage: 'Interface language', remove: 'Remove',
      noFollows: 'You are not following any channels yet. Open a channel and press "Follow".',
      recentSearches: 'Recent searches', clearHistory: '✕  Clear history'
    }
  };
  // Default: English. A TV whose menu language is Turkish starts in Turkish. A choice made in Settings wins.
  var lang = /^tr\b/i.test(navigator.language || '') ? 'tr' : 'en';
  try {
    var saved = localStorage.getItem('kickizle.ui');
    if (saved === 'tr' || saved === 'en') lang = saved;
  } catch (e) {}

  function t(key, params) {
    var s = (dict[lang] && dict[lang][key]) || dict.tr[key] || key;
    if (params) for (var k in params) if (params.hasOwnProperty(k)) s = s.split('{' + k + '}').join(params[k]);
    return s;
  }
  function apply(root) {
    var nodes = (root || document).querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) nodes[i].textContent = t(nodes[i].getAttribute('data-i18n'));
    document.documentElement.lang = lang;
  }
  function setLang(l) { lang = l; try { localStorage.setItem('kickizle.ui', l); } catch (e) {} apply(); }
  function getLang() { return lang; }
  function number(n) {
    n = Number(n) || 0;
    if (n >= 1000000) return (n / 1000000).toFixed(1).replace('.0', '').replace('.', lang === 'tr' ? ',' : '.') + (lang === 'tr' ? ' Mn' : 'M');
    if (n >= 1000) return (n / 1000).toFixed(1).replace('.0', '').replace('.', lang === 'tr' ? ',' : '.') + (lang === 'tr' ? ' B' : 'K');
    return String(n);
  }
  return { t: t, apply: apply, setLang: setLang, getLang: getLang, number: number };
}());
