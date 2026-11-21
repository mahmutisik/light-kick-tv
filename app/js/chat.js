/* Canlı sohbet: Kick'in herkese açık Pusher kanalını sadece okur. */
var Chat = (function () {
  'use strict';
  var socket = null, session = 0, retryTimer = null, list, stateEl, MAX = 50;
  var queue = [], flushTimer = null;

  function el(id) { return document.getElementById(id); }
  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function render(content) {
    var html = '', re = /\[emote:(\d+):([^\]]*)\]/g, last = 0, m;
    while ((m = re.exec(content))) {
      html += escapeHtml(content.slice(last, m.index));
      html += '<img src="https://files.kick.com/emotes/' + m[1] + '/fullsize" alt="' + escapeHtml(m[2]) + '">';
      last = re.lastIndex;
    }
    return html + escapeHtml(content.slice(last));
  }
  function setState(key) { if (stateEl) stateEl.textContent = '· ' + I18n.t(key); }

  /* Mesajları tek tek değil, yarım saniyede bir toplu ekle (yoğun sohbette TV'yi yormasın). */
  function add(user, color, content) {
    queue.push({ user: user, color: color, content: content });
    if (queue.length > MAX) queue.splice(0, queue.length - MAX);
    if (!flushTimer) flushTimer = setTimeout(flush, 500);
  }
  function flush() {
    flushTimer = null;
    if (!list || !queue.length) return;
    var frag = document.createDocumentFragment(), items = queue;
    queue = [];
    for (var n = 0; n < items.length; n++) {
      var m = items[n], div = document.createElement('div');
      div.className = 'msg';
      var safeColor = /^#[0-9a-fA-F]{3,8}$/.test(m.color || '') ? m.color : '#53fc18';
      div.innerHTML = '<span class="user" style="color:' + safeColor + '">' + escapeHtml(m.user) + '</span>: ' + render(m.content);
      var imgs = div.getElementsByTagName('img');
      for (var i = 0; i < imgs.length; i++) imgs[i].onerror = function () { this.parentNode.replaceChild(document.createTextNode(this.alt), this); };
      frag.appendChild(div);
    }
    list.appendChild(frag);
    while (list.children.length > MAX) list.removeChild(list.firstChild);
  }

  function connect(channelId, chatroomId) {
    disconnect();
    list = el('chatList'); stateEl = el('chatState');
    list.innerHTML = '';
    if (!chatroomId) { setState('chatOffline'); return; }
    var my = ++session, attempt = 0;
    setState('chatConnecting');

    function open(cfg) {
      if (my !== session) return;
      var url = 'wss://ws-' + cfg.cluster + '.pusher.com/app/' + cfg.key + '?protocol=7&client=js&version=8.4.0&flash=false';
      try { socket = new WebSocket(url); } catch (e) { retry(cfg); return; }
      var ws = socket;
      ws.onmessage = function (ev) {
        if (my !== session) return;
        var p; try { p = JSON.parse(ev.data); } catch (e) { return; }
        if (p.event === 'pusher:connection_established') {
          ws.send(JSON.stringify({ event: 'pusher:subscribe', data: { auth: '', channel: 'chatrooms.' + chatroomId + '.v2' } }));
        } else if (p.event === 'pusher_internal:subscription_succeeded') {
          attempt = 0; setState('chatConnected');
        } else if (p.event === 'pusher:ping') {
          ws.send(JSON.stringify({ event: 'pusher:pong', data: {} }));
        } else if (p.event === 'App\\Events\\ChatMessageEvent') {
          var d; try { d = typeof p.data === 'string' ? JSON.parse(p.data) : p.data; } catch (e) { return; }
          var s = d.sender || {}, idt = s.identity || {};
          if (d.content) add(s.username || '?', idt.color, d.content);
        }
      };
      ws.onclose = function () { if (my === session) retry(cfg); };
      ws.onerror = function () {};
    }
    function retry(cfg) {
      if (my !== session) return;
      setState('chatOffline');
      attempt++;
      retryTimer = setTimeout(function () { open(cfg); }, Math.min(30000, 2000 * attempt));
    }
    Api.chatConfig(channelId, open);
  }

  function disconnect() {
    session++;
    clearTimeout(retryTimer);
    clearTimeout(flushTimer); flushTimer = null; queue = [];
    if (socket) { try { socket.onclose = null; socket.close(); } catch (e) {} socket = null; }
  }

  return { connect: connect, disconnect: disconnect };
}());
