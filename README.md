# WaterBreak 💧🏃

A GPS run tracker you run in your phone's browser (installable as an app). It finds drinking fountains on an open map and alerts you when you get close to one.

## Features
- **Run tracking**: distance, total time, moving time, paused time and number of stops. Speed (km/h) and pace (min/km) are shown both with and without pauses, plus your current pace.
- **Auto-pause**: detects when you stop. The speed threshold and delay can be changed in Settings. There is also a manual pause.
- **Water fountains** from OpenStreetMap (`amenity=drinking_water`, `drinking_water=yes`, `amenity=water_point`).
- **Proximity alerts**: a notification, sound and vibration when you get within 30 m of a fountain. Distance (10–200 m) and sound (chime, drip, bell, beep, splash, silent) are set in Settings.
- **Destination**: search an address, tap the map, or pick the nearest fountain. Shows the walking route, distance left, ETA based on your current moving pace, and turn-by-turn directions. Recalculates when you go off route.
- **Run history** with route map, detailed stats and GPX export. Runs are stored only on the device.
- **Friends**: share your 10-character code. When a friend adds it you are connected both ways. Friends are notified when you start and finish (with your stats), plus optional progress updates.

- **Rocco the raccoon** (Home tab): happy when you run, sadder each day you don't, and he throws a party when you beat your goal, set a distance or pace record, or run 3+ times in a week.
- **Goals**: distance and/or pace (or speed in km/h). Live progress bar, ahead/behind goal pace, projected finish, and the pace you need to make it. A full-screen **Stats** view. Voice updates every km, and notifications at 25/50/75/100%. A goal report at the end of each run.
- **Friend notes**: nudge friends to go running, cheer them during a run, congratulate them after, or send your own message.
- **Run recovery**: the active run is saved every 5 s. If the app closes, you can Resume (the gap counts as a pause), Save & finish, or Discard.
- **Invite-only sign-in** with Google (see below).

## Invite-only Google sign-in
1. In Google Cloud Console create an OAuth client ID of type *Web application*, with Authorized JavaScript origin `https://enricotoso96.github.io`.
2. Put it in `config.js` → `googleClientId`.
3. Invite people: `node tools/add-user.mjs name@gmail.com` (stores only a SHA-256 hash of the address). Commit and push.

With an empty `googleClientId` the gate is off. This is a front-door gate on a static site; runs stay on each device.

## Open data / services used
OpenStreetMap tiles, Overpass API (fountains), routing.openstreetmap.de (OSRM foot routing), Nominatim (search), ntfy.sh (friend message relay). No backend or accounts.

## Limits of a web app
- Browsers suspend GPS when the screen is locked, so WaterBreak keeps the screen on (Wake Lock) during runs.
- Notifications fire while the app is open. On iPhone, add it to the Home Screen first (iOS 16.4+).
- To get friend alerts when WaterBreak is closed, subscribe to the friend's ntfy topic (the link in the Friends list) in the free ntfy app.
- Friend messages go through public ntfy.sh topics named after your code. Anyone who has your code can read your run updates.

## Try it without running
Open `?demo` to simulate a runner in Central Park who jogs from fountain to fountain.

## Develop
Static files only: `python3 -m http.server 8765`. Icons: `node tools/make-icons.mjs`.
