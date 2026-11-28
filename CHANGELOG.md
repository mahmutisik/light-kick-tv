# Changelog

Install or update with [Apps2Samsung](https://github.com/Apps2Samsung/Apps2Samsung) → **Custom WGT
File** → `LightKickTV.wgt` from the release. Followed channels, resume points and settings are kept.

<!-- Each release's notes on GitHub are taken from its section below (scripts/release_notes.py). -->

## v1.0.7

- **What's new window**: after an update, the app shows what changed in the new version, in your
  language. Open it again any time from Settings › About.

## v1.0.6

- **Games & categories**: a new Categories button on the home screen lists every category, most
  watched first. Open one to see its live streams, sorted by viewers, in the languages chosen in the
  home filter. Search finds games too, in a "Games & categories" row above the channels.
- **Clips**: the channel page has two tabs, Past broadcasts and Clips (the channel's most viewed
  clips of the last month, or of all time). Clips show their real resolution.
- **Know when a stream starts**: an offline channel's page checks every 15 s while it's open. When
  the stream starts, "Watch live" appears and a message says so; nothing plays by itself.
- **Update notice**: once a day the app checks GitHub for a newer release. When there is one, a
  message says so once, a green dot appears on the ⚙ icon, and Settings › About shows the version.

## v1.0.5

- **Rewind live streams**: press ← (or ⏪) while watching live to go back into the running stream's
  recording, paused 10 s back. Seek and pause as in a past broadcast; the screen shows how far behind
  live you are. Seek to the end to return to live. Chat closes while rewinding and comes back with
  live.
- Chat lines and emotes are cleared when you leave the player, so they don't stay in memory.

## v1.0.4

- Past broadcasts show their own preview again (Kick's API started returning the channel's current
  thumbnail for every broadcast).
- Live chat opens with the last ~25 messages instead of starting empty.

## v1.0.3

- **Faster start**: a splash stays until the stream list is ready; if loading fails or takes over
  10 s, the error shows on the splash and OK retries. Connections to Kick open while the app loads.
- **Faster live start**: about 1.2 s down to 0.7-0.9 s to the first picture in testing.
- **Nothing runs in the background**: in another app or the TV menu, video, downloads, chat and
  timers stop; live rejoins at the live edge when you come back.
- **Lighter on memory**: after 2 minutes in the player, the screens behind it release their images.

## v1.0.2

- **Stream filter** on the home screen: one or more languages (or all), Recommended or Most viewers.
  Nothing reloads until you press Apply.
- **Interface in 10 languages**: English, Türkçe, Español, العربية, Português, Deutsch, Français,
  Русский, Polski, Italiano.
- Smoother seeking: the target frame loads 1 s after the last press, and OK applies a seek at once.
- New icon: Kick's K with LIGHT.

## v1.0.1

- **Recent searches** under the search box. Opening search no longer pops up the keyboard: press OK
  on the box to type, or ↓ to pick a recent search.

## v1.0.0

- First release: live streams, past broadcasts with resume, read-only live chat with emotes,
  quality menu, follow channels without an account, recently watched channels.
