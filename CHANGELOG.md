# Changelog

Install or update with [Apps2Samsung](https://github.com/Apps2Samsung/Apps2Samsung) → **Custom WGT
File** → `LightKickTV.wgt` from the release. Followed channels, resume points and settings are kept.

<!-- Each release's notes on GitHub are taken from its section below (scripts/release_notes.py). -->

## v1.0.9

- **Back cancels a seek**: pressing Back while seeking (before playing on) returns to where the seek
  started and carries on as it was, playing or paused. The video around that spot is kept while
  seeking, so it continues at once. Back again leaves the player. While seeking, the hint line says
  so ("OK play from here · Back: cancel seek").
- **No accidental jump to live**: while rewinding, seeking to the end no longer switches to live
  on its own. It stops at the end with "Press OK to go live"; OK goes live, ← seeks back into the
  recording. (Playing up to the end still rejoins live as before.)
- **Correct bar when rewind opens**: while the recording is opening, the progress bar and the
  "behind live" time now show the requested spot right away, instead of an old position left over
  from the last video (or the live stream's length) for a few seconds.
- **Fine seeking after holding**: holding ← / → still speeds up (10 s → 30 s → 1 min → 3 min), but
  letting go now resets it, and separate presses always move 10 s. Before, presses right after a
  long hold kept jumping minutes at a time, and quick taps sped up too.

## v1.0.8

- **Continue watching**: the home screen shows your last 4 half-watched past broadcasts in one row;
  OK resumes where you left off.
- **New broadcasts**: past broadcasts released since your last visit to a channel are marked "New"
  until you start them.
- **Live details**: live cards show how long the stream has been on, recently watched channels that
  are live get a red dot, and the player shows the viewer count (refreshed once a minute).
- **Watched broadcasts stay marked**: a past broadcast watched to the end keeps a full bar and a
  “Watched” label (it still starts from the beginning when opened again).
- **Lighter on memory**: images far off screen are released while you scroll. A list scrolled to its
  end now keeps about 36 pictures instead of 96 (roughly 90 MB down to 35 MB of decoded thumbnails on
  the home screen).
- **Thumbnails ready at start**: the first screen's thumbnails download while the splash is showing,
  so they're already there when it fades.
- **Smoother channel pages**: the video library is prepared after the page is drawn, clips load only
  when their tab is opened, and coming back from a video only updates the progress bars instead of
  rebuilding the list.
- **Closed screens let go of their images**: leaving Categories, a category, search or a channel
  page frees its pictures; they load again if you go back.
- **Shorter splash**: on a fast connection the app now opens after 1 s instead of 1.3 s.
- **Smaller video library**: the player now uses hls.js's light build (377 KB instead of 605 KB,
  about 40 % less to parse), which leaves out subtitles, alternate audio and DRM. Kick's streams
  don't use them.
- **Fixes**:
  - Seeking right after opening a past broadcast at its resume point started from the beginning and
    lost the resume point; it now seeks from where you left off (and Back while it opens keeps it).
  - Rewind: pressing OK while the recording was opening left seeking stuck until the end; reopening
    the recording after reaching its end no longer skips ahead; → while it opens goes back to live.
  - A rewind or back-to-live answer arriving after you left the player no longer affects the next
    stream.
  - Settings' followed list updates after you unfollow on a channel page.
  - The focus no longer jumps to the top when a channel page finishes loading after you've moved,
    and no longer gets lost after a search with no results or a retry.
  - The What's new window waits for the home screen instead of being skipped.

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
