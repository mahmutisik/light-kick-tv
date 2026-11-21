<p align="center"><img src="docs/icon.png" width="128" alt="Light Kick TV icon"></p>

<h1 align="center">Light Kick TV</h1>

<p align="center">
  A lightweight, unofficial <a href="https://kick.com">Kick</a> client for Samsung Tizen TVs.<br>
  Live streams, <b>past broadcasts (VODs)</b> and live chat, built to stay smooth on slow TV hardware.
</p>

---

## Why this exists

On some Samsung TVs, apps that play Kick through Samsung's native player (AVPlay) fail with
`PLAYER_ERROR_CONNECTION_FAILED`, even though kick.com plays fine in the TV's own browser.
Light Kick TV plays streams **the way the browser does** (hls.js + HTML5 video), so it works on
those TVs. It also adds the thing the other TV apps were missing: **past broadcasts**.

## Features

- **Live streams**: featured streams in English or Turkish, loading more as you scroll
- **Search** channels using Kick's own search
- **Channel page** with the live stream and the full list of **past broadcasts**
- **Seeking that respects the TV**: pressing ← / → pauses the video and shows the target frame;
  press OK to continue from there (see [Performance](#performance))
- **Resume** past broadcasts where you left off, with a progress bar on each card
- **Quality menu** (Automatic / 1080p60 / 720p60 / …). Automatic starts at the best quality and steps
  down only if the network can't keep up. Your choice is remembered.
- **Live chat** (read-only) with Kick emotes, toggled with ↓
- **Follow channels** without a Kick account. Followed channels that are live appear at the top of
  the home screen.
- **Recently watched** channels
- **Settings** (⚙): manage followed channels, switch the interface language (English / Türkçe)
- Interface in **English** by default; TVs set to Turkish start in Turkish

## Install on your TV

You need a Samsung TV running Tizen 4.0 or newer (2018+), and a computer or Android phone on the same
network.

1. **Enable Developer Mode on the TV**
   1. Open **Apps** on the TV.
   2. Type `1` `2` `3` `4` `5` with the remote (smart remotes: open the number pad with the `123` button).
   3. Switch **Developer Mode** on and enter your computer's local IP address as **Host PC IP**.
   4. Restart the TV fully: hold the power button until the Samsung logo appears.
2. **Download** `LightKickTV.wgt` from the [latest release](../../releases/latest).
3. **Install with [Apps2Samsung](https://github.com/Apps2Samsung/Apps2Samsung)**
   1. Open Apps2Samsung and choose **Custom WGT File**.
   2. Select `LightKickTV.wgt` and your TV.
   3. Click **Install**. Sign in to a Samsung account if asked; Apps2Samsung uses it to create a
      certificate for your TV and signs the package. No Tizen Studio needed.

Light Kick TV then appears in the TV's **Apps** list. To update, install the new `.wgt` the same way;
your followed channels, resume points and settings are kept.

## Remote control

| Where | Button | Action |
|---|---|---|
| Menus | Arrows / OK | Move / select |
| Menus | Back | Previous screen (press twice on the home screen to exit) |
| Player | ↑ | Quality menu |
| Player (live) | ↓ | Show / hide chat |
| Player (past broadcast) | ← → / ⏪ ⏩ | Pause and seek: 10 s steps, growing to 30 s, 1 min and 3 min while held. The frame appears 2 s after you let go. |
| Player (past broadcast) | OK / ⏯ | Play / pause |
| Player | Back / ⏹ | Leave the player |

## Performance

TV web engines are far weaker than a desktop browser, so the player is deliberately frugal:

- **Nothing downloads while paused.** Pausing stops loading completely.
- **Frame-only seeking.** Seeking pauses playback and, once you stop pressing, fetches only the
  single segment that contains the target frame. In a side-by-side test (one big jump plus two
  corrections) this used **36 % less data and decoded 63 % fewer frames** than seeking while playing.
- **Small buffers**: about 30 s ahead for past broadcasts and 15 s for live streams.
- **No quality ramp-up.** Automatic starts at the top quality instead of starting low and
  re-downloading the same segments in higher quality.
- **Light overlays**: no gradients, shadows or animations drawn on top of the video. The on-screen
  info is removed from the page (not just hidden) while it's off.
- **Batched chat**: messages are added twice a second and capped at 50.
- **Bounded lists** and small thumbnails, so long browsing sessions don't fill the TV's memory.

## Privacy

- No Kick account, no sign-in, no server of our own, no analytics.
- Everything the app remembers (followed channels, recently watched, resume points, settings) is
  stored **only on your TV**.
- The app talks only to Kick's public endpoints (`kick.com`, `web.kick.com`), Kick's video and image
  CDNs (`*.live-video.net`, `stream.kick.com`, `images.kick.com`, `files.kick.com`) and Kick's public
  chat feed on Pusher (read-only).

## Development

Requirements: [Node.js](https://nodejs.org) 18+ for the dev server and Python 3 for packaging.
There are no npm dependencies and no build step; the app is plain ES5 JavaScript so it runs on older
Tizen versions.

```sh
node dev/server.js        # open http://localhost:8099
```

In the browser, the arrow keys, Enter and Esc (Back) behave like the remote. A desktop browser blocks
Kick's API with CORS, so the dev server relays requests through a small local proxy. The TV doesn't
need it: Tizen apps connect directly.

```sh
python scripts/build.py   # creates dist/LightKickTV.wgt (unsigned) and its .sha256
```

### Project layout

```
app/                 The TV app (packaged into the .wgt)
  config.xml         Tizen manifest
  index.html         All screens
  css/style.css      1920x1080 TV layout
  js/api.js          Kick endpoints
  js/app.js          Screens: home, search, channel, settings
  js/player.js       hls.js player: quality, seeking, resume
  js/chat.js         Read-only live chat
  js/nav.js          Remote-control (spatial) navigation
  js/store.js        Local storage: follows, recents, resume points
  js/i18n.js         English / Turkish texts
  lib/hls.min.js     hls.js 1.7.3
dev/server.js        Local dev server and proxy
scripts/build.py     .wgt packager
```

### Releasing

Bump `version` in `app/config.xml`, commit, then push a matching tag:

```sh
git tag v1.0.1 && git push origin v1.0.1
```

A GitHub Actions workflow builds `LightKickTV.wgt` and attaches it to a new release.

## Known limitations

- Built for a 2022 Samsung S95B (Tizen 6.5). Other Tizen 4.0+ TVs should work but are untested;
  reports are welcome.
- Kick's public endpoints are undocumented and may change without notice.
- Chat is read-only, and following is local to each TV (it doesn't sync with your Kick account).

## Credits

- [hls.js](https://github.com/video-dev/hls.js) (Apache 2.0) plays the streams.
- [corekill/kick-tv-tizen](https://github.com/corekill/kick-tv-tizen) (MIT) was the reference for
  Kick's chat connection and endpoints.
- [Apps2Samsung](https://github.com/Apps2Samsung/Apps2Samsung) makes installing on a TV painless.

## Disclaimer

Light Kick TV is an independent, unofficial project. It is not affiliated with, endorsed by or
sponsored by Kick or Samsung. "Kick" and the Kick logo are trademarks of their respective owner and
are used only to identify the service this app connects to.

## License

[MIT](LICENSE) © 2026 Mahmut Işık
