/* Interface texts in 10 languages. English is the fallback for anything missing.
   Start-up language: the choice saved in Settings, otherwise the TV's menu language when it is one of
   these, otherwise English. */
var I18n = (function () {
  'use strict';

  // Shown in their own language, in this order (Settings and the stream-language filter).
  var LANGUAGES = [
    { c: 'tr', n: 'Türkçe', locale: 'tr-TR' }, { c: 'en', n: 'English', locale: 'en-US' },
    { c: 'es', n: 'Español', locale: 'es-ES' }, { c: 'ar', n: 'العربية', locale: 'ar' },
    { c: 'pt', n: 'Português', locale: 'pt-BR' }, { c: 'de', n: 'Deutsch', locale: 'de-DE' },
    { c: 'fr', n: 'Français', locale: 'fr-FR' }, { c: 'ru', n: 'Русский', locale: 'ru-RU' },
    { c: 'pl', n: 'Polski', locale: 'pl-PL' }, { c: 'it', n: 'Italiano', locale: 'it-IT' }
  ];

  var dict = {
    en: {
      search: 'Search', recentChannels: 'Recently watched channels', loading: 'Loading…',
      loadFailed: 'Could not load. Press OK to retry.', nothingLive: 'No live streams found right now.',
      viewers: '{n} viewers', followers: '{n} followers', views: '{n} views',
      searchPlaceholder: 'Type a streamer name…', searchHint: 'Type and confirm to search.', noResults: 'No results.',
      watchLive: '▶  Watch live', pastBroadcasts: 'Past broadcasts', noVods: 'This channel has no past broadcasts.', offline: 'Offline',
      ongoing: 'ONGOING', today: 'Today', yesterday: 'Yesterday', daysAgo: '{n} days ago',
      live: 'LIVE', liveChat: 'Chat', chatConnecting: 'connecting…', chatConnected: 'connected', chatOffline: 'disconnected',
      quality: 'Video quality', auto: 'Automatic', loadingStream: 'Loading stream…', buffering: 'Buffering…',
      playError: 'Playback failed', networkError: 'Connection problem, retrying…', streamEnded: 'Stream ended',
      hlsUnsupported: 'This TV cannot play HLS streams',
      hintLive: '↑ quality · ↓ chat · Back: exit', hintVod: '← → seek (pauses) · OK play/pause · ↑ quality · Back: exit',
      resumed: 'Resuming where you left off ({t})', paused: 'Paused', exitHint: 'Press Back again to exit',
      follow: '+  Follow', following: '✓  Following', followedToast: 'Following {name}', unfollowedToast: 'Unfollowed {name}',
      followedLive: 'Followed channels live now', noFollowedLive: 'None of your followed channels are live right now.',
      settings: 'Settings', followedChannels: 'Followed channels', uiLanguage: 'Interface language', remove: 'Remove',
      noFollows: 'You are not following any channels yet. Open a channel and press "Follow".',
      recentSearches: 'Recent searches', clearHistory: '✕  Clear history',
      liveStreams: 'Live streams', filterTitle: 'Stream filter', streamLanguage: 'Stream language', allLanguages: 'All',
      allLangsShort: 'All languages', sortBy: 'Sort by', sortFeatured: 'Recommended', sortViewers: 'Most viewers',
      apply: 'Apply', cancel: 'Cancel', filterHint: 'Changes take effect when you press "Apply". You can pick several languages.',
      featuredAllNote: 'Note: with "All" + "Recommended", Kick mostly recommends English streams.',
      startError: 'Couldn\'t load streams.', startRetry: 'Check your connection and press OK to try again.'
    },
    tr: {
      search: 'Ara', recentChannels: 'Son izlenen kanallar', loading: 'Yükleniyor…',
      loadFailed: 'Yüklenemedi. Tekrar denemek için OK tuşuna basın.', nothingLive: 'Şu an canlı yayın bulunamadı.',
      viewers: '{n} izleyici', followers: '{n} takipçi', views: '{n} görüntülenme',
      searchPlaceholder: 'Yayıncı adı yazın…', searchHint: 'Aramak için yazın ve onaylayın.', noResults: 'Sonuç bulunamadı.',
      watchLive: '▶  Canlı izle', pastBroadcasts: 'Geçmiş yayınlar', noVods: 'Bu kanalın geçmiş yayını yok.', offline: 'Çevrimdışı',
      ongoing: 'DEVAM EDİYOR', today: 'Bugün', yesterday: 'Dün', daysAgo: '{n} gün önce',
      live: 'CANLI', liveChat: 'Sohbet', chatConnecting: 'bağlanıyor…', chatConnected: 'bağlı', chatOffline: 'bağlantı yok',
      quality: 'Görüntü kalitesi', auto: 'Otomatik', loadingStream: 'Yayın yükleniyor…', buffering: 'Arabelleğe alınıyor…',
      playError: 'Yayın oynatılamadı', networkError: 'Bağlantı hatası, yeniden deneniyor…', streamEnded: 'Yayın sona erdi',
      hlsUnsupported: 'Bu TV HLS yayınlarını oynatamıyor',
      hintLive: '↑ kalite · ↓ sohbet · Geri: çıkış', hintVod: '← → sar (duraklatır) · OK oynat/duraklat · ↑ kalite · Geri: çıkış',
      resumed: 'Kaldığınız yerden devam ediliyor ({t})', paused: 'Duraklatıldı', exitHint: 'Çıkmak için Geri tuşuna tekrar basın',
      follow: '+  Takip et', following: '✓  Takip ediliyor', followedToast: '{name} takip edildi', unfollowedToast: '{name} takipten çıkarıldı',
      followedLive: 'Takip edilen canlı yayınlar', noFollowedLive: 'Takip ettiğin kanallardan şu an canlı olan yok.',
      settings: 'Ayarlar', followedChannels: 'Takip edilen kanallar', uiLanguage: 'Arayüz dili', remove: 'Kaldır',
      noFollows: 'Henüz kanal takip etmiyorsun. Bir kanala girip "Takip et"e bas.',
      recentSearches: 'Son aramalar', clearHistory: '✕  Geçmişi temizle',
      liveStreams: 'Canlı yayınlar', filterTitle: 'Yayın filtresi', streamLanguage: 'Yayın dili', allLanguages: 'Tümü',
      allLangsShort: 'Tüm diller', sortBy: 'Sıralama', sortFeatured: 'Önerilen', sortViewers: 'En çok izlenen',
      apply: 'Uygula', cancel: 'İptal', filterHint: 'Değişiklikler "Uygula"ya basınca geçerli olur. Birden fazla dil seçebilirsin.',
      featuredAllNote: 'Not: "Tümü" + "Önerilen" seçiliyken Kick çoğunlukla İngilizce yayınlar öneriyor.',
      startError: 'Yayınlar yüklenemedi.', startRetry: 'Bağlantınızı kontrol edin ve tekrar denemek için OK tuşuna basın.'
    },
    es: {
      search: 'Buscar', recentChannels: 'Canales vistos recientemente', loading: 'Cargando…',
      loadFailed: 'No se pudo cargar. Pulsa OK para reintentar.', nothingLive: 'No hay directos en este momento.',
      viewers: '{n} espectadores', followers: '{n} seguidores', views: '{n} visualizaciones',
      searchPlaceholder: 'Escribe el nombre de un streamer…', searchHint: 'Escribe y confirma para buscar.', noResults: 'Sin resultados.',
      watchLive: '▶  Ver en directo', pastBroadcasts: 'Emisiones anteriores', noVods: 'Este canal no tiene emisiones anteriores.', offline: 'Desconectado',
      ongoing: 'EN CURSO', today: 'Hoy', yesterday: 'Ayer', daysAgo: 'Hace {n} días',
      live: 'EN DIRECTO', liveChat: 'Chat', chatConnecting: 'conectando…', chatConnected: 'conectado', chatOffline: 'sin conexión',
      quality: 'Calidad de vídeo', auto: 'Automática', loadingStream: 'Cargando emisión…', buffering: 'Cargando búfer…',
      playError: 'No se pudo reproducir', networkError: 'Problema de conexión, reintentando…', streamEnded: 'La emisión ha terminado',
      hlsUnsupported: 'Este televisor no puede reproducir emisiones HLS',
      hintLive: '↑ calidad · ↓ chat · Atrás: salir', hintVod: '← → avanzar/retroceder (pausa) · OK reproducir/pausa · ↑ calidad · Atrás: salir',
      resumed: 'Continuando donde lo dejaste ({t})', paused: 'En pausa', exitHint: 'Pulsa Atrás otra vez para salir',
      follow: '+  Seguir', following: '✓  Siguiendo', followedToast: 'Ahora sigues a {name}', unfollowedToast: 'Has dejado de seguir a {name}',
      followedLive: 'Canales seguidos en directo', noFollowedLive: 'Ninguno de tus canales seguidos está en directo ahora.',
      settings: 'Ajustes', followedChannels: 'Canales seguidos', uiLanguage: 'Idioma de la interfaz', remove: 'Quitar',
      noFollows: 'Aún no sigues ningún canal. Abre un canal y pulsa "Seguir".',
      recentSearches: 'Búsquedas recientes', clearHistory: '✕  Borrar historial',
      liveStreams: 'Directos', filterTitle: 'Filtro de emisiones', streamLanguage: 'Idioma de la emisión', allLanguages: 'Todos',
      allLangsShort: 'Todos los idiomas', sortBy: 'Ordenar por', sortFeatured: 'Recomendados', sortViewers: 'Más espectadores',
      apply: 'Aplicar', cancel: 'Cancelar', filterHint: 'Los cambios se aplican al pulsar "Aplicar". Puedes elegir varios idiomas.',
      featuredAllNote: 'Nota: con "Todos" + "Recomendados", Kick recomienda sobre todo emisiones en inglés.',
      startError: 'No se pudieron cargar los directos.', startRetry: 'Comprueba la conexión y pulsa OK para reintentar.'
    },
    ar: {
      search: 'بحث', recentChannels: 'القنوات التي شاهدتها مؤخرًا', loading: 'جارٍ التحميل…',
      loadFailed: 'تعذّر التحميل. اضغط OK لإعادة المحاولة.', nothingLive: 'لا توجد بثوث مباشرة حاليًا.',
      viewers: '{n} مشاهد', followers: '{n} متابع', views: '{n} مشاهدة',
      searchPlaceholder: 'اكتب اسم صانع المحتوى…', searchHint: 'اكتب ثم أكّد للبحث.', noResults: 'لا توجد نتائج.',
      watchLive: '▶  شاهد البث المباشر', pastBroadcasts: 'البثوث السابقة', noVods: 'لا توجد بثوث سابقة لهذه القناة.', offline: 'غير متصل',
      ongoing: 'جارٍ الآن', today: 'اليوم', yesterday: 'أمس', daysAgo: 'منذ {n} أيام',
      live: 'مباشر', liveChat: 'الدردشة', chatConnecting: 'جارٍ الاتصال…', chatConnected: 'متصل', chatOffline: 'غير متصل',
      quality: 'جودة الفيديو', auto: 'تلقائي', loadingStream: 'جارٍ تحميل البث…', buffering: 'جارٍ التخزين المؤقت…',
      playError: 'تعذّر تشغيل البث', networkError: 'مشكلة في الاتصال، جارٍ إعادة المحاولة…', streamEnded: 'انتهى البث',
      hlsUnsupported: 'هذا التلفاز لا يدعم بث HLS',
      hintLive: '↑ الجودة · ↓ الدردشة · رجوع: خروج', hintVod: '← → تقديم/ترجيع (إيقاف مؤقت) · OK تشغيل/إيقاف · ↑ الجودة · رجوع: خروج',
      resumed: 'متابعة من حيث توقفت ({t})', paused: 'متوقف مؤقتًا', exitHint: 'اضغط رجوع مرة أخرى للخروج',
      follow: '+  متابعة', following: '✓  تتابعه', followedToast: 'أنت تتابع {name} الآن', unfollowedToast: 'ألغيت متابعة {name}',
      followedLive: 'قنوات تتابعها تبث الآن', noFollowedLive: 'لا توجد قناة من القنوات التي تتابعها تبث الآن.',
      settings: 'الإعدادات', followedChannels: 'القنوات التي تتابعها', uiLanguage: 'لغة الواجهة', remove: 'إزالة',
      noFollows: 'لا تتابع أي قناة بعد. افتح قناة واضغط "متابعة".',
      recentSearches: 'عمليات البحث الأخيرة', clearHistory: '✕  مسح السجل',
      liveStreams: 'البث المباشر', filterTitle: 'تصفية البثوث', streamLanguage: 'لغة البث', allLanguages: 'الكل',
      allLangsShort: 'كل اللغات', sortBy: 'الترتيب', sortFeatured: 'المقترحة', sortViewers: 'الأكثر مشاهدة',
      apply: 'تطبيق', cancel: 'إلغاء', filterHint: 'تُطبَّق التغييرات عند الضغط على "تطبيق". يمكنك اختيار أكثر من لغة.',
      featuredAllNote: 'ملاحظة: عند اختيار "الكل" + "المقترحة" يقترح Kick غالبًا بثوثًا باللغة الإنجليزية.',
      startError: 'تعذّر تحميل البثوث.', startRetry: 'تحقّق من الاتصال واضغط OK لإعادة المحاولة.'
    },
    pt: {
      search: 'Buscar', recentChannels: 'Canais assistidos recentemente', loading: 'Carregando…',
      loadFailed: 'Não foi possível carregar. Pressione OK para tentar de novo.', nothingLive: 'Nenhuma transmissão ao vivo no momento.',
      viewers: '{n} espectadores', followers: '{n} seguidores', views: '{n} visualizações',
      searchPlaceholder: 'Digite o nome de um streamer…', searchHint: 'Digite e confirme para buscar.', noResults: 'Nenhum resultado.',
      watchLive: '▶  Assistir ao vivo', pastBroadcasts: 'Transmissões anteriores', noVods: 'Este canal não tem transmissões anteriores.', offline: 'Offline',
      ongoing: 'EM ANDAMENTO', today: 'Hoje', yesterday: 'Ontem', daysAgo: 'Há {n} dias',
      live: 'AO VIVO', liveChat: 'Chat', chatConnecting: 'conectando…', chatConnected: 'conectado', chatOffline: 'desconectado',
      quality: 'Qualidade do vídeo', auto: 'Automática', loadingStream: 'Carregando transmissão…', buffering: 'Carregando buffer…',
      playError: 'Falha na reprodução', networkError: 'Problema de conexão, tentando novamente…', streamEnded: 'A transmissão terminou',
      hlsUnsupported: 'Esta TV não reproduz transmissões HLS',
      hintLive: '↑ qualidade · ↓ chat · Voltar: sair', hintVod: '← → avançar/voltar (pausa) · OK reproduzir/pausar · ↑ qualidade · Voltar: sair',
      resumed: 'Continuando de onde você parou ({t})', paused: 'Pausado', exitHint: 'Pressione Voltar de novo para sair',
      follow: '+  Seguir', following: '✓  Seguindo', followedToast: 'Você está seguindo {name}', unfollowedToast: 'Você deixou de seguir {name}',
      followedLive: 'Canais seguidos ao vivo', noFollowedLive: 'Nenhum dos seus canais seguidos está ao vivo agora.',
      settings: 'Configurações', followedChannels: 'Canais seguidos', uiLanguage: 'Idioma da interface', remove: 'Remover',
      noFollows: 'Você ainda não segue nenhum canal. Abra um canal e pressione "Seguir".',
      recentSearches: 'Buscas recentes', clearHistory: '✕  Limpar histórico',
      liveStreams: 'Ao vivo', filterTitle: 'Filtro de transmissões', streamLanguage: 'Idioma da transmissão', allLanguages: 'Todos',
      allLangsShort: 'Todos os idiomas', sortBy: 'Ordenar por', sortFeatured: 'Recomendados', sortViewers: 'Mais espectadores',
      apply: 'Aplicar', cancel: 'Cancelar', filterHint: 'As alterações valem quando você pressiona "Aplicar". Você pode escolher vários idiomas.',
      featuredAllNote: 'Obs.: com "Todos" + "Recomendados", a Kick recomenda principalmente transmissões em inglês.',
      startError: 'Não foi possível carregar as transmissões.', startRetry: 'Verifique a conexão e pressione OK para tentar de novo.'
    },
    de: {
      search: 'Suchen', recentChannels: 'Zuletzt angesehene Kanäle', loading: 'Wird geladen…',
      loadFailed: 'Laden fehlgeschlagen. Zum Wiederholen OK drücken.', nothingLive: 'Gerade keine Livestreams gefunden.',
      viewers: '{n} Zuschauer', followers: '{n} Follower', views: '{n} Aufrufe',
      searchPlaceholder: 'Streamer-Namen eingeben…', searchHint: 'Zum Suchen eingeben und bestätigen.', noResults: 'Keine Ergebnisse.',
      watchLive: '▶  Live ansehen', pastBroadcasts: 'Vergangene Übertragungen', noVods: 'Dieser Kanal hat keine vergangenen Übertragungen.', offline: 'Offline',
      ongoing: 'LÄUFT', today: 'Heute', yesterday: 'Gestern', daysAgo: 'Vor {n} Tagen',
      live: 'LIVE', liveChat: 'Chat', chatConnecting: 'verbinde…', chatConnected: 'verbunden', chatOffline: 'getrennt',
      quality: 'Videoqualität', auto: 'Automatisch', loadingStream: 'Stream wird geladen…', buffering: 'Puffern…',
      playError: 'Wiedergabe fehlgeschlagen', networkError: 'Verbindungsproblem, neuer Versuch…', streamEnded: 'Stream beendet',
      hlsUnsupported: 'Dieser Fernseher kann keine HLS-Streams abspielen',
      hintLive: '↑ Qualität · ↓ Chat · Zurück: beenden', hintVod: '← → spulen (pausiert) · OK Wiedergabe/Pause · ↑ Qualität · Zurück: beenden',
      resumed: 'Weiter an der letzten Stelle ({t})', paused: 'Pausiert', exitHint: 'Zum Beenden erneut Zurück drücken',
      follow: '+  Folgen', following: '✓  Gefolgt', followedToast: 'Du folgst jetzt {name}', unfollowedToast: 'Du folgst {name} nicht mehr',
      followedLive: 'Gefolgte Kanäle, die gerade live sind', noFollowedLive: 'Keiner deiner gefolgten Kanäle ist gerade live.',
      settings: 'Einstellungen', followedChannels: 'Gefolgte Kanäle', uiLanguage: 'Sprache der Oberfläche', remove: 'Entfernen',
      noFollows: 'Du folgst noch keinem Kanal. Öffne einen Kanal und drücke "Folgen".',
      recentSearches: 'Letzte Suchen', clearHistory: '✕  Verlauf löschen',
      liveStreams: 'Livestreams', filterTitle: 'Stream-Filter', streamLanguage: 'Stream-Sprache', allLanguages: 'Alle',
      allLangsShort: 'Alle Sprachen', sortBy: 'Sortieren nach', sortFeatured: 'Empfohlen', sortViewers: 'Meiste Zuschauer',
      apply: 'Übernehmen', cancel: 'Abbrechen', filterHint: 'Änderungen gelten erst nach "Übernehmen". Du kannst mehrere Sprachen wählen.',
      featuredAllNote: 'Hinweis: Bei "Alle" + "Empfohlen" empfiehlt Kick fast nur englische Streams.',
      startError: 'Streams konnten nicht geladen werden.', startRetry: 'Prüfe die Verbindung und drücke OK, um es erneut zu versuchen.'
    },
    fr: {
      search: 'Rechercher', recentChannels: 'Chaînes regardées récemment', loading: 'Chargement…',
      loadFailed: 'Échec du chargement. Appuyez sur OK pour réessayer.', nothingLive: 'Aucun live pour le moment.',
      viewers: '{n} spectateurs', followers: '{n} abonnés', views: '{n} vues',
      searchPlaceholder: 'Saisissez le nom d’un streamer…', searchHint: 'Saisissez puis validez pour rechercher.', noResults: 'Aucun résultat.',
      watchLive: '▶  Regarder en direct', pastBroadcasts: 'Diffusions passées', noVods: 'Cette chaîne n’a pas de diffusions passées.', offline: 'Hors ligne',
      ongoing: 'EN COURS', today: 'Aujourd’hui', yesterday: 'Hier', daysAgo: 'Il y a {n} jours',
      live: 'EN DIRECT', liveChat: 'Chat', chatConnecting: 'connexion…', chatConnected: 'connecté', chatOffline: 'déconnecté',
      quality: 'Qualité vidéo', auto: 'Automatique', loadingStream: 'Chargement du live…', buffering: 'Mise en mémoire tampon…',
      playError: 'Lecture impossible', networkError: 'Problème de connexion, nouvelle tentative…', streamEnded: 'Le live est terminé',
      hlsUnsupported: 'Ce téléviseur ne peut pas lire les flux HLS',
      hintLive: '↑ qualité · ↓ chat · Retour : quitter', hintVod: '← → avancer/reculer (pause) · OK lecture/pause · ↑ qualité · Retour : quitter',
      resumed: 'Reprise là où vous vous étiez arrêté ({t})', paused: 'En pause', exitHint: 'Appuyez de nouveau sur Retour pour quitter',
      follow: '+  Suivre', following: '✓  Suivi', followedToast: 'Vous suivez {name}', unfollowedToast: 'Vous ne suivez plus {name}',
      followedLive: 'Chaînes suivies en direct', noFollowedLive: 'Aucune de vos chaînes suivies n’est en direct pour le moment.',
      settings: 'Paramètres', followedChannels: 'Chaînes suivies', uiLanguage: 'Langue de l’interface', remove: 'Retirer',
      noFollows: 'Vous ne suivez encore aucune chaîne. Ouvrez une chaîne et appuyez sur « Suivre ».',
      recentSearches: 'Recherches récentes', clearHistory: '✕  Effacer l’historique',
      liveStreams: 'Lives', filterTitle: 'Filtre des lives', streamLanguage: 'Langue du live', allLanguages: 'Toutes',
      allLangsShort: 'Toutes les langues', sortBy: 'Trier par', sortFeatured: 'Recommandés', sortViewers: 'Plus de spectateurs',
      apply: 'Appliquer', cancel: 'Annuler', filterHint: 'Les changements s’appliquent quand vous appuyez sur « Appliquer ». Vous pouvez choisir plusieurs langues.',
      featuredAllNote: 'Remarque : avec « Toutes » + « Recommandés », Kick recommande surtout des lives en anglais.',
      startError: 'Impossible de charger les lives.', startRetry: 'Vérifiez la connexion et appuyez sur OK pour réessayer.'
    },
    ru: {
      search: 'Поиск', recentChannels: 'Недавно просмотренные каналы', loading: 'Загрузка…',
      loadFailed: 'Не удалось загрузить. Нажмите OK, чтобы повторить.', nothingLive: 'Сейчас нет прямых трансляций.',
      viewers: 'зрителей: {n}', followers: 'подписчиков: {n}', views: 'просмотров: {n}',
      searchPlaceholder: 'Введите имя стримера…', searchHint: 'Введите запрос и подтвердите.', noResults: 'Ничего не найдено.',
      watchLive: '▶  Смотреть эфир', pastBroadcasts: 'Прошлые трансляции', noVods: 'У этого канала нет прошлых трансляций.', offline: 'Не в сети',
      ongoing: 'ИДЁТ СЕЙЧАС', today: 'Сегодня', yesterday: 'Вчера', daysAgo: '{n} дн. назад',
      live: 'В ЭФИРЕ', liveChat: 'Чат', chatConnecting: 'подключение…', chatConnected: 'подключено', chatOffline: 'нет соединения',
      quality: 'Качество видео', auto: 'Авто', loadingStream: 'Загрузка трансляции…', buffering: 'Буферизация…',
      playError: 'Не удалось воспроизвести', networkError: 'Проблема с соединением, повторяем…', streamEnded: 'Трансляция завершена',
      hlsUnsupported: 'Этот телевизор не поддерживает HLS',
      hintLive: '↑ качество · ↓ чат · Назад: выход', hintVod: '← → перемотка (пауза) · OK воспр./пауза · ↑ качество · Назад: выход',
      resumed: 'Продолжаем с места остановки ({t})', paused: 'Пауза', exitHint: 'Нажмите Назад ещё раз, чтобы выйти',
      follow: '+  Отслеживать', following: '✓  Отслеживается', followedToast: 'Вы отслеживаете {name}', unfollowedToast: '{name}: отслеживание отменено',
      followedLive: 'Отслеживаемые каналы в эфире', noFollowedLive: 'Сейчас никто из отслеживаемых каналов не в эфире.',
      settings: 'Настройки', followedChannels: 'Отслеживаемые каналы', uiLanguage: 'Язык интерфейса', remove: 'Удалить',
      noFollows: 'Вы пока не отслеживаете ни одного канала. Откройте канал и нажмите «Отслеживать».',
      recentSearches: 'Недавние запросы', clearHistory: '✕  Очистить историю',
      liveStreams: 'Прямые трансляции', filterTitle: 'Фильтр трансляций', streamLanguage: 'Язык трансляции', allLanguages: 'Все',
      allLangsShort: 'Все языки', sortBy: 'Сортировка', sortFeatured: 'Рекомендуемые', sortViewers: 'Больше зрителей',
      apply: 'Применить', cancel: 'Отмена', filterHint: 'Изменения вступают в силу после нажатия «Применить». Можно выбрать несколько языков.',
      featuredAllNote: 'Примечание: при «Все» + «Рекомендуемые» Kick в основном предлагает англоязычные трансляции.',
      startError: 'Не удалось загрузить трансляции.', startRetry: 'Проверьте подключение и нажмите OK, чтобы повторить.'
    },
    pl: {
      search: 'Szukaj', recentChannels: 'Ostatnio oglądane kanały', loading: 'Ładowanie…',
      loadFailed: 'Nie udało się załadować. Naciśnij OK, aby spróbować ponownie.', nothingLive: 'Brak transmisji na żywo.',
      viewers: 'widzowie: {n}', followers: 'obserwujący: {n}', views: 'wyświetlenia: {n}',
      searchPlaceholder: 'Wpisz nazwę streamera…', searchHint: 'Wpisz i zatwierdź, aby wyszukać.', noResults: 'Brak wyników.',
      watchLive: '▶  Oglądaj na żywo', pastBroadcasts: 'Poprzednie transmisje', noVods: 'Ten kanał nie ma poprzednich transmisji.', offline: 'Offline',
      ongoing: 'TRWA', today: 'Dzisiaj', yesterday: 'Wczoraj', daysAgo: '{n} dni temu',
      live: 'NA ŻYWO', liveChat: 'Czat', chatConnecting: 'łączenie…', chatConnected: 'połączono', chatOffline: 'brak połączenia',
      quality: 'Jakość wideo', auto: 'Automatyczna', loadingStream: 'Ładowanie transmisji…', buffering: 'Buforowanie…',
      playError: 'Nie udało się odtworzyć', networkError: 'Problem z połączeniem, ponawiam…', streamEnded: 'Transmisja zakończona',
      hlsUnsupported: 'Ten telewizor nie obsługuje transmisji HLS',
      hintLive: '↑ jakość · ↓ czat · Wstecz: wyjście', hintVod: '← → przewijanie (pauza) · OK odtwórz/pauza · ↑ jakość · Wstecz: wyjście',
      resumed: 'Wznawianie od miejsca zatrzymania ({t})', paused: 'Wstrzymano', exitHint: 'Naciśnij Wstecz ponownie, aby wyjść',
      follow: '+  Obserwuj', following: '✓  Obserwujesz', followedToast: 'Obserwujesz {name}', unfollowedToast: 'Nie obserwujesz już {name}',
      followedLive: 'Obserwowane kanały na żywo', noFollowedLive: 'Żaden z obserwowanych kanałów nie nadaje teraz na żywo.',
      settings: 'Ustawienia', followedChannels: 'Obserwowane kanały', uiLanguage: 'Język interfejsu', remove: 'Usuń',
      noFollows: 'Nie obserwujesz jeszcze żadnego kanału. Otwórz kanał i naciśnij „Obserwuj”.',
      recentSearches: 'Ostatnie wyszukiwania', clearHistory: '✕  Wyczyść historię',
      liveStreams: 'Transmisje na żywo', filterTitle: 'Filtr transmisji', streamLanguage: 'Język transmisji', allLanguages: 'Wszystkie',
      allLangsShort: 'Wszystkie języki', sortBy: 'Sortuj według', sortFeatured: 'Polecane', sortViewers: 'Najwięcej widzów',
      apply: 'Zastosuj', cancel: 'Anuluj', filterHint: 'Zmiany zaczną obowiązywać po naciśnięciu „Zastosuj”. Możesz wybrać kilka języków.',
      featuredAllNote: 'Uwaga: przy „Wszystkie” + „Polecane” Kick poleca głównie transmisje po angielsku.',
      startError: 'Nie udało się załadować transmisji.', startRetry: 'Sprawdź połączenie i naciśnij OK, aby spróbować ponownie.'
    },
    it: {
      search: 'Cerca', recentChannels: 'Canali visti di recente', loading: 'Caricamento…',
      loadFailed: 'Impossibile caricare. Premi OK per riprovare.', nothingLive: 'Nessuna diretta al momento.',
      viewers: '{n} spettatori', followers: '{n} follower', views: '{n} visualizzazioni',
      searchPlaceholder: 'Scrivi il nome di uno streamer…', searchHint: 'Scrivi e conferma per cercare.', noResults: 'Nessun risultato.',
      watchLive: '▶  Guarda in diretta', pastBroadcasts: 'Trasmissioni passate', noVods: 'Questo canale non ha trasmissioni passate.', offline: 'Offline',
      ongoing: 'IN CORSO', today: 'Oggi', yesterday: 'Ieri', daysAgo: '{n} giorni fa',
      live: 'IN DIRETTA', liveChat: 'Chat', chatConnecting: 'connessione…', chatConnected: 'connesso', chatOffline: 'disconnesso',
      quality: 'Qualità video', auto: 'Automatica', loadingStream: 'Caricamento della diretta…', buffering: 'Buffering…',
      playError: 'Riproduzione non riuscita', networkError: 'Problema di connessione, nuovo tentativo…', streamEnded: 'La diretta è terminata',
      hlsUnsupported: 'Questo televisore non riproduce flussi HLS',
      hintLive: '↑ qualità · ↓ chat · Indietro: esci', hintVod: '← → avanti/indietro (pausa) · OK riproduci/pausa · ↑ qualità · Indietro: esci',
      resumed: 'Riprendi da dove avevi lasciato ({t})', paused: 'In pausa', exitHint: 'Premi di nuovo Indietro per uscire',
      follow: '+  Segui', following: '✓  Segui già', followedToast: 'Ora segui {name}', unfollowedToast: 'Non segui più {name}',
      followedLive: 'Canali seguiti in diretta', noFollowedLive: 'Nessuno dei canali che segui è in diretta ora.',
      settings: 'Impostazioni', followedChannels: 'Canali seguiti', uiLanguage: 'Lingua dell’interfaccia', remove: 'Rimuovi',
      noFollows: 'Non segui ancora nessun canale. Apri un canale e premi "Segui".',
      recentSearches: 'Ricerche recenti', clearHistory: '✕  Cancella cronologia',
      liveStreams: 'Dirette', filterTitle: 'Filtro dirette', streamLanguage: 'Lingua della diretta', allLanguages: 'Tutte',
      allLangsShort: 'Tutte le lingue', sortBy: 'Ordina per', sortFeatured: 'Consigliate', sortViewers: 'Più spettatori',
      apply: 'Applica', cancel: 'Annulla', filterHint: 'Le modifiche si applicano quando premi "Applica". Puoi scegliere più lingue.',
      featuredAllNote: 'Nota: con "Tutte" + "Consigliate", Kick consiglia soprattutto dirette in inglese.',
      startError: 'Impossibile caricare le dirette.', startRetry: 'Controlla la connessione e premi OK per riprovare.'
    }
  };

  function supported(c) { return !!dict[c]; }
  var lang = 'en';
  var tvLang = String(navigator.language || '').slice(0, 2).toLowerCase();
  if (supported(tvLang)) lang = tvLang;
  try {
    var saved = localStorage.getItem('kickizle.ui');
    if (supported(saved)) lang = saved;
  } catch (e) {}

  function t(key, params) {
    var s = (dict[lang] && dict[lang][key]) || dict.en[key] || key;
    if (params) for (var k in params) if (params.hasOwnProperty(k)) s = s.split('{' + k + '}').join(params[k]);
    return s;
  }
  function locale() {
    for (var i = 0; i < LANGUAGES.length; i++) if (LANGUAGES[i].c === lang) return LANGUAGES[i].locale;
    return 'en-US';
  }
  function apply(root) {
    var nodes = (root || document).querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) nodes[i].textContent = t(nodes[i].getAttribute('data-i18n'));
    document.documentElement.lang = lang;
  }
  function setLang(l) { if (!supported(l)) return; lang = l; try { localStorage.setItem('kickizle.ui', l); } catch (e) {} apply(); }
  function getLang() { return lang; }

  /* Compact counts in the interface language (12K, 12 B, 12 mil, 12 тыс.). Uses Intl where the TV
     engine supports compact notation, otherwise a simple K/M fallback with the right decimal mark. */
  var compact = null, compactFor = null;
  function number(n) {
    n = Number(n) || 0;
    if (compactFor !== lang) {
      compactFor = lang; compact = null;
      try {
        var f = new Intl.NumberFormat(locale(), { notation: 'compact', maximumFractionDigits: 1 });
        if (/\D/.test(f.format(12000))) compact = f;  // engines without compact support print "12000"
      } catch (e) {}
    }
    if (compact) return compact.format(n);
    var comma = lang !== 'en';
    function one(x, suffix) { var s = x.toFixed(1).replace('.0', ''); return (comma ? s.replace('.', ',') : s) + suffix; }
    if (n >= 1000000) return one(n / 1000000, lang === 'tr' ? ' Mn' : 'M');
    if (n >= 1000) return one(n / 1000, lang === 'tr' ? ' B' : 'K');
    return String(n);
  }

  return {
    t: t, apply: apply, setLang: setLang, getLang: getLang, number: number, locale: locale,
    languages: function () { return LANGUAGES.slice(); }
  };
}());
