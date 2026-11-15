/* WaterBreak — GPS run tracker with drinking-fountain alerts. */
'use strict';

// ---------- utilities ----------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { toast('Storage is full — delete old runs'); return false; } },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
const params = new URLSearchParams(location.search);
const DEMO = params.has('demo');

function hav(a, b) {
  const R = 6371000, toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR, dLng = (b.lng - a.lng) * toR;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
function bearing(a, b) {
  const toR = Math.PI / 180;
  const y = Math.sin((b.lng - a.lng) * toR) * Math.cos(b.lat * toR);
  const x = Math.cos(a.lat * toR) * Math.sin(b.lat * toR) - Math.sin(a.lat * toR) * Math.cos(b.lat * toR) * Math.cos((b.lng - a.lng) * toR);
  return (Math.atan2(y, x) / toR + 360) % 360;
}
const compass = deg => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(deg / 45) % 8];
const arrow = deg => ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'][Math.round(deg / 45) % 8];
function fmtDur(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`;
}
function fmtPace(secPerKm) {
  if (!isFinite(secPerKm) || secPerKm <= 0 || secPerKm > 3600) return '–:––';
  const m = Math.floor(secPerKm / 60), s = Math.round(secPerKm % 60);
  return s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, '0')}`;
}
const fmtKm = m => (m / 1000).toFixed(2);
const fmtDist = m => m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10000 ? 2 : 1)} km`;
const fmtSpeed = (m, ms) => (ms > 0 && m > 0) ? (m / (ms / 1000) * 3.6).toFixed(1) : '–';
const paceOf = (m, ms) => (m > 10 ? (ms / 1000) / (m / 1000) : NaN);
const fmtClock = t => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

let toastTimer;
function toast(msg, ms = 2800) {
  const el = $('#toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

// ---------- settings ----------
const DEFAULTS = {
  alertDistance: 30, sound: 'chime', volume: 0.8, vibrate: true, alertRunOnly: true,
  autoPause: true, pauseSpeedKmh: 3, pauseDelay: 6, keepAwake: true, defaultPace: 360,
  name: '', share: true, shareEvery: 5, notifyFriends: true,
};
const settings = { ...DEFAULTS, ...LS.get('wb_settings', {}) };
const saveSettings = () => LS.set('wb_settings', settings);

// ---------- sound ----------
let audioCtx = null;
function unlockAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch {}
}
function tone(freq, start, dur, type = 'sine', gain = 1, endFreq) {
  const ctx = audioCtx, t0 = ctx.currentTime + start;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t0 + dur);
  const v = settings.volume * gain * 0.5;
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(Math.max(v, 0.0002), t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(ctx.destination); o.start(t0); o.stop(t0 + dur + 0.05);
}
function playSound(name = settings.sound) {
  if (name === 'none' || settings.volume <= 0) return;
  unlockAudio(); if (!audioCtx) return;
  switch (name) {
    case 'chime': tone(880, 0, 0.5); tone(1318.5, 0.15, 0.7); break;
    case 'drip': tone(1400, 0, 0.12, 'sine', 1, 500); tone(1600, 0.25, 0.12, 'sine', .8, 550); tone(1200, 0.5, 0.15, 'sine', .7, 450); break;
    case 'bell': tone(660, 0, 1.4, 'sine'); tone(1320, 0, 1.0, 'sine', .4); tone(1980, 0, .6, 'sine', .2); break;
    case 'beep': tone(1000, 0, 0.12, 'square', .5); tone(1000, 0.2, 0.12, 'square', .5); break;
    case 'splash': {
      const ctx = audioCtx, len = ctx.sampleRate * 0.6, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      src.buffer = buf; f.type = 'bandpass'; f.frequency.value = 1800; f.Q.value = .8; g.gain.value = settings.volume;
      src.connect(f).connect(g).connect(ctx.destination); src.start(); tone(900, 0.05, 0.2, 'sine', .6, 300);
      break;
    }
    case 'friend': tone(587, 0, 0.18); tone(784, 0.14, 0.3); break;
  }
}

// ---------- notifications ----------
let swReg = null;
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').then(r => { swReg = r; }).catch(() => {});
}
const notifSupported = () => 'Notification' in window;
async function requestNotif() {
  if (!notifSupported()) { toast(isIOS() ? 'Add WaterBreak to your Home Screen to enable notifications' : 'Notifications not supported in this browser'); return 'unsupported'; }
  let p = Notification.permission;
  if (p === 'default') p = await Notification.requestPermission();
  renderNotifState();
  return p;
}
const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent);
async function notify(title, body, tag, opts = {}) {
  if (settings.vibrate && navigator.vibrate) navigator.vibrate(opts.vibrate || [200, 100, 200]);
  if (!notifSupported() || Notification.permission !== 'granted') return false;
  const o = { body, tag, renotify: true, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', vibrate: settings.vibrate ? [200, 100, 200] : [], silent: false, data: { url: location.href } };
  try {
    const reg = swReg || (navigator.serviceWorker && await navigator.serviceWorker.getRegistration());
    if (reg) { await reg.showNotification(title, o); return true; }
    new Notification(title, o); return true;
  } catch { try { new Notification(title, o); return true; } catch { return false; } }
}

// ---------- wake lock ----------
let wakeLock = null;
async function setWake(on) {
  try {
    if (on && settings.keepAwake && 'wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch {}
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && run) setWake(true);
  if (document.visibilityState === 'hidden') persistRun();
});

// ---------- map ----------
const map = L.map('map', { zoomControl: false, attributionControl: true }).setView([40.7812, -73.9665], 15);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);
const meIcon = L.divIcon({ className: '', html: '<div class="me-marker"></div>', iconSize: [20, 20], iconAnchor: [10, 10] });
let meMarker = null, accCircle = null, follow = true, hadFix = false;
const trackLine = L.polyline([], { color: '#0b6bcb', weight: 5, opacity: .9 }).addTo(map);
const routeLine = L.polyline([], { color: '#1aa3e8', weight: 5, opacity: .75, dashArray: '8 8' }).addTo(map);
const fountainLayer = L.layerGroup().addTo(map);
let destMarker = null;
map.on('dragstart', () => { follow = false; $('#btn-recenter').classList.remove('on'); });

// ---------- fountains (OpenStreetMap via Overpass) ----------
const fountains = new Map();      // id -> {id, lat, lng, name, marker, near}
const fetchedCenters = LS.get('wb_fetched', []).filter(c => Date.now() - c.t < 7 * 864e5);
let overpassBusy = false;
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
const fountainIcon = near => L.divIcon({ className: '', html: `<div class="fountain-marker${near ? ' near' : ''}"><span>💧</span></div>`, iconSize: [28, 28], iconAnchor: [14, 28], popupAnchor: [0, -26] });

function addFountain(f) {
  if (fountains.has(f.id)) return;
  const marker = L.marker([f.lat, f.lng], { icon: fountainIcon(false) });
  const label = f.name || 'Drinking water';
  const popup = document.createElement('div');
  const t = document.createElement('b'); t.textContent = label; popup.append(t);
  if (f.note) { const n = document.createElement('div'); n.textContent = f.note; n.style.fontSize = '12px'; popup.append(n); }
  const btn = document.createElement('button'); btn.className = 'btn small'; btn.style.marginTop = '6px'; btn.textContent = 'Go here';
  btn.onclick = () => { map.closePopup(); setDestination({ lat: f.lat, lng: f.lng }, label); };
  popup.append(document.createElement('br'), btn);
  marker.bindPopup(popup);
  f.marker = marker; f.near = false;
  fountains.set(f.id, f);
  fountainLayer.addLayer(marker);
}
function cacheFountains() {
  const arr = [...fountains.values()].slice(-4000).map(f => ({ id: f.id, lat: f.lat, lng: f.lng, name: f.name, note: f.note }));
  LS.set('wb_fountains', arr); LS.set('wb_fetched', fetchedCenters.slice(-60));
}
LS.get('wb_fountains', []).forEach(addFountain);
updateFountainCount();

async function loadFountains(lat, lng, radius = 2500) {
  if (overpassBusy) return;
  if (fetchedCenters.some(c => hav(c, { lat, lng }) < c.r * 0.55)) return;
  overpassBusy = true;
  const q = `[out:json][timeout:25];(` +
    `node["amenity"="drinking_water"](around:${radius},${lat},${lng});` +
    `node["drinking_water"="yes"](around:${radius},${lat},${lng});` +
    `node["amenity"="water_point"](around:${radius},${lat},${lng});` +
    `);out body 800;`;
  try {
    let data = null;
    for (const url of OVERPASS) {
      try {
        const r = await fetch(url, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
        if (r.ok) { data = await r.json(); break; }
      } catch {}
    }
    if (!data) { toast('Could not load fountains — will retry'); return; }
    for (const el of data.elements || []) {
      const tg = el.tags || {};
      if (tg.drinking_water === 'no' || tg.access === 'private' || tg.access === 'no') continue;
      const notes = [];
      if (tg.seasonal === 'yes' || tg.seasonal) notes.push('Seasonal');
      if (tg.bottle === 'yes') notes.push('Bottle refill');
      if (tg.dog === 'yes') notes.push('Dog bowl');
      if (tg.fee === 'yes') notes.push('Fee');
      addFountain({ id: el.id, lat: el.lat, lng: el.lon, name: tg.name || tg.description || '', note: notes.join(' · ') });
    }
    fetchedCenters.push({ lat, lng, r: radius, t: Date.now() });
    cacheFountains(); updateFountainCount();
  } finally { overpassBusy = false; }
}
function updateFountainCount() { $('#fountain-count').textContent = fountains.size; }
let moveTimer;
map.on('moveend', () => {
  clearTimeout(moveTimer);
  moveTimer = setTimeout(() => { if (map.getZoom() >= 13) { const c = map.getCenter(); loadFountains(c.lat, c.lng, 2000); } }, 700);
});

function nearestFountain(p) {
  let best = null, bd = Infinity;
  for (const f of fountains.values()) { const d = hav(p, f); if (d < bd) { bd = d; best = f; } }
  return best ? { f: best, d: bd } : null;
}

function checkFountainProximity(p) {
  const R = settings.alertDistance;
  const active = !settings.alertRunOnly || !!run;
  for (const f of fountains.values()) {
    if (Math.abs(f.lat - p.lat) > 0.01 || Math.abs(f.lng - p.lng) > 0.015) { if (f.near) setNear(f, false); continue; }
    const d = hav(p, f);
    if (!f.near && d <= R) {
      setNear(f, true);
      if (active) {
        playSound();
        const title = '💧 Water fountain nearby';
        const body = `${f.name || 'Drinking water'} — ${Math.round(d)} m ${compass(bearing(p, f))}${f.note ? ' · ' + f.note : ''}`;
        notify(title, body, 'fountain-' + f.id);
        toast(`${title}: ${Math.round(d)} m`);
        if (run) { run.fountainsSeen = run.fountainsSeen || []; if (!run.fountainsSeen.includes(f.id)) run.fountainsSeen.push(f.id); }
      }
    } else if (f.near && d > R * 2 + 20) setNear(f, false);
  }
}
function setNear(f, v) { f.near = v; f.marker.setIcon(fountainIcon(v)); }

// ---------- GPS ----------
const geo = {
  id: null, last: null,
  start() {
    if (this.id !== null) return;
    if (DEMO) { this.id = 'demo'; demo.start(); return; }
    if (!('geolocation' in navigator)) { setGps('bad', 'No GPS'); return; }
    this.id = navigator.geolocation.watchPosition(pos => onFix({
      lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy,
      speed: pos.coords.speed, t: Date.now(),
    }), err => {
      setGps('bad', err.code === 1 ? 'Location blocked' : 'No GPS signal');
      if (err.code === 1) toast('Allow location access in your browser settings to track runs', 5000);
    }, { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 });
  },
};
function setGps(state, text) { const c = $('#gps-chip'); c.className = 'chip ' + state; $('#gps-text').textContent = text; }

function onFix(p) {
  geo.last = p;
  setGps(p.acc <= 25 ? 'ok' : p.acc <= 60 ? '' : 'bad', DEMO ? `Demo GPS ±${Math.round(p.acc)} m` : `GPS ±${Math.round(p.acc)} m`);
  const ll = [p.lat, p.lng];
  if (!meMarker) {
    meMarker = L.marker(ll, { icon: meIcon, zIndexOffset: 1000, interactive: false }).addTo(map);
    accCircle = L.circle(ll, { radius: p.acc, color: '#0b6bcb', weight: 1, fillOpacity: .08, interactive: false }).addTo(map);
  } else { meMarker.setLatLng(ll); accCircle.setLatLng(ll).setRadius(p.acc); }
  if (!hadFix) { hadFix = true; map.setView(ll, 16); }
  else if (follow) map.panTo(ll, { animate: true });
  loadFountains(p.lat, p.lng, 2500);
  if (run) trackFix(p);
  checkFountainProximity(p);
  updateNearestLine(p);
  if (dest) updateDestination(p);
}

// ---------- run tracking ----------
let run = null;
let ticker = null;
function newRun() {
  const now = Date.now();
  return { id: now.toString(36), start: now, end: null, pts: [], dist: 0, moving: 0, paused: 0, pauses: [],
    manual: false, auto: false, lastTick: now, lastPt: null, win: [], slowSince: null, fountainsSeen: [], lastShare: now };
}
function startRun() {
  unlockAudio();
  if (notifSupported() && Notification.permission === 'default') requestNotif();
  run = newRun();
  geo.start();
  if (geo.last && Date.now() - geo.last.t < 10000) { run.lastPt = geo.last; addPt(geo.last); }
  trackLine.setLatLngs(run.pts.map(p => [p[0], p[1]]));
  ticker = setInterval(tick, 1000);
  setWake(true);
  renderControls(); renderStats();
  $('#sheet').classList.add('expanded');
  toast('Run started — have a good one!');
  friendsPublish('start');
  persistRun();
}
function tick() {
  if (!run) return;
  const now = Date.now(), dt = Math.min(now - run.lastTick, 60000);
  run.lastTick = now;
  if (run.manual || run.auto) run.paused += dt; else run.moving += dt;
  renderStats();
  if (settings.share && settings.shareEvery > 0 && now - run.lastShare >= settings.shareEvery * 60000) { run.lastShare = now; friendsPublish('progress'); }
  if (now % 10000 < 1000) persistRun();
}
function setPaused(kind, v) {
  if (!run) return;
  const wasPaused = run.manual || run.auto;
  run[kind] = v;
  const isPaused = run.manual || run.auto;
  if (!wasPaused && isPaused) run.pauses.push({ s: Date.now(), e: null, auto: kind === 'auto' });
  if (wasPaused && !isPaused) { const last = run.pauses[run.pauses.length - 1]; if (last && !last.e) last.e = Date.now(); run.lastPt = null; run.win = []; }
  if (kind === 'manual') { run.slowSince = null; if (!v) run.auto = false; }
  renderControls(); renderStats();
}
function addPt(p) {
  run.pts.push([+p.lat.toFixed(6), +p.lng.toFixed(6), Math.round((p.t - run.start) / 1000)]);
  trackLine.addLatLng([p.lat, p.lng]);
}
function trackFix(p) {
  if (run.manual) return;
  if (p.acc > 50) return;               // too inaccurate to trust
  // speed estimate over a short sliding window (smooths GPS jitter)
  run.win.push(p);
  while (run.win.length > 2 && p.t - run.win[0].t > 8000) run.win.shift();
  let spd = null;
  if (run.win.length >= 2) {
    const a = run.win[0], dt = (p.t - a.t) / 1000;
    if (dt >= 3) spd = hav(a, p) / dt;
  }
  if (p.speed != null && p.speed >= 0 && !isNaN(p.speed)) spd = spd == null ? p.speed : (spd + p.speed) / 2;
  run.curSpeed = spd;
  if (settings.autoPause && spd != null) {
    const thr = settings.pauseSpeedKmh / 3.6;
    if (spd < thr) {
      run.slowSince = run.slowSince || p.t;
      if (!run.auto && p.t - run.slowSince >= settings.pauseDelay * 1000) { setPaused('auto', true); toast('Auto-paused'); }
    } else {
      run.slowSince = null;
      if (run.auto && spd > thr * 1.2) { setPaused('auto', false); toast('Resumed'); }
    }
  } else if (!settings.autoPause && run.auto) setPaused('auto', false);

  if (!run.lastPt) { run.lastPt = p; addPt(p); return; }
  const d = hav(run.lastPt, p), dt = (p.t - run.lastPt.t) / 1000;
  if (dt > 0 && d / dt > 12.5) return;   // faster than 45 km/h: GPS jump
  if (run.auto) { run.lastPt = p; return; } // standing still: ignore drift
  if (d >= Math.max(4, Math.min(p.acc, 20) * 0.4)) { run.dist += d; run.lastPt = p; addPt(p); }
}
function finishRun() {
  if (!run) return;
  if (!confirm('Finish and save this run?')) return;
  tick();
  const now = Date.now();
  const last = run.pauses[run.pauses.length - 1]; if (last && !last.e) last.e = now;
  run.end = now;
  clearInterval(ticker); ticker = null;
  const saved = { id: run.id, start: run.start, end: run.end, dist: Math.round(run.dist), moving: run.moving, paused: run.paused,
    pauses: run.pauses.map(p => ({ s: p.s, e: p.e, auto: p.auto })), pts: run.pts, fountains: (run.fountainsSeen || []).length };
  friendsPublish('finish', saved);
  if (saved.dist > 20 || saved.moving > 60000) {
    const runs = LS.get('wb_runs', []); runs.unshift(saved);
    if (!LS.set('wb_runs', runs)) { runs.pop(); LS.set('wb_runs', runs); }
    toast(`Saved: ${fmtKm(saved.dist)} km in ${fmtDur(saved.moving + saved.paused)}`);
  } else toast('Run too short — not saved');
  run = null; LS.del('wb_active');
  setWake(false);
  renderControls(); renderStats(); renderHistory();
}
function persistRun() {
  if (!run) return;
  const { win, lastPt, ...rest } = run;
  LS.set('wb_active', rest);
}
function restoreRun() {
  const r = LS.get('wb_active', null);
  if (!r) return;
  if (Date.now() - r.lastTick > 6 * 3600e3) { LS.del('wb_active'); return; }
  run = { ...newRun(), ...r, win: [], lastPt: null };
  const gap = Date.now() - run.lastTick;
  if (gap > 0) { if (run.manual || run.auto) run.paused += gap; else run.moving += gap; run.lastTick = Date.now(); }
  trackLine.setLatLngs(run.pts.map(p => [p[0], p[1]]));
  ticker = setInterval(tick, 1000);
  toast('Restored your run in progress');
}

// ---------- stats rendering ----------
function renderStats() {
  const r = run || { dist: 0, moving: 0, paused: 0, pauses: [], fountainsSeen: [] };
  const elapsed = r.moving + r.paused;
  $('#s-dist').textContent = fmtKm(r.dist);
  $('#s-time').textContent = fmtDur(elapsed);
  const cur = run && !run.manual && !run.auto && run.curSpeed > 0.3 ? 1000 / run.curSpeed : NaN;
  $('#s-pace').textContent = fmtPace(cur);
  $('#t-moving').textContent = fmtDur(r.moving);
  $('#t-elapsed').textContent = fmtDur(elapsed);
  $('#t-speed-m').textContent = fmtSpeed(r.dist, r.moving) + ' km/h';
  $('#t-speed-e').textContent = fmtSpeed(r.dist, elapsed) + ' km/h';
  $('#t-pace-m').textContent = fmtPace(paceOf(r.dist, r.moving)) + ' /km';
  $('#t-pace-e').textContent = fmtPace(paceOf(r.dist, elapsed)) + ' /km';
  $('#t-paused').textContent = fmtDur(r.paused);
  $('#t-pauses').textContent = r.pauses.length;
  $('#t-fountains').textContent = (r.fountainsSeen || []).length;
  const b = $('#state-banner');
  if (run && (run.manual || run.auto)) { b.textContent = run.manual ? 'PAUSED' : 'AUTO-PAUSED — start moving to resume'; b.classList.remove('hidden'); }
  else b.classList.add('hidden');
}
function renderControls() {
  $('#btn-start').classList.toggle('hidden', !!run);
  $('#btn-pause').classList.toggle('hidden', !run);
  $('#btn-stop').classList.toggle('hidden', !run);
  if (run) $('#btn-pause').textContent = run.manual ? 'Resume' : 'Pause';
}
function updateNearestLine(p) {
  const n = nearestFountain(p);
  $('#nearest-line').textContent = n ? `Nearest water: ${fmtDist(n.d)} ${arrow(bearing(p, n.f))} ${compass(bearing(p, n.f))}${n.f.name ? ' · ' + n.f.name : ''}` : 'Nearest water: none loaded nearby';
}

// ---------- destination & directions ----------
let dest = null; // {lat,lng,name, route:{coords,cum,total,steps}, lastRoute, arrived}
const destIcon = L.divIcon({ className: '', html: '<div class="dest-marker">🏁</div>', iconSize: [28, 28], iconAnchor: [6, 26] });
async function setDestination(ll, name) {
  closeModals();
  dest = { lat: ll.lat, lng: ll.lng, name: name || `${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)}`, route: null, lastRoute: 0, arrived: false };
  if (destMarker) destMarker.remove();
  destMarker = L.marker([dest.lat, dest.lng], { icon: destIcon }).addTo(map);
  $('#dest-card').classList.remove('hidden');
  $('#dest-name').textContent = dest.name;
  $('#btn-dest').classList.add('on');
  const from = geo.last;
  if (from) {
    await fetchRoute(from);
    const b = L.latLngBounds([[from.lat, from.lng], [dest.lat, dest.lng]]);
    if (dest.route) dest.route.coords.forEach(c => b.extend([c.lat, c.lng]));
    follow = false; map.fitBounds(b, { padding: [60, 60] });
    updateDestination(from);
  } else { $('#dest-next').textContent = 'Waiting for GPS…'; }
}
function clearDestination() {
  dest = null; routeLine.setLatLngs([]);
  if (destMarker) { destMarker.remove(); destMarker = null; }
  $('#dest-card').classList.add('hidden'); $('#btn-dest').classList.remove('on');
}
async function fetchRoute(from) {
  if (!dest) return;
  dest.lastRoute = Date.now();
  const url = `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${from.lng},${from.lat};${dest.lng},${dest.lat}?overview=full&geometries=geojson&steps=true`;
  try {
    const r = await fetch(url); const j = await r.json();
    if (!dest || j.code !== 'Ok' || !j.routes?.length) throw new Error('no route');
    const rt = j.routes[0];
    const coords = rt.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
    const cum = [0]; for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + hav(coords[i - 1], coords[i]));
    const steps = []; let k = 0;
    for (const leg of rt.legs) for (const s of leg.steps) {
      const [lng, lat] = s.maneuver.location; let bi = k, bd = Infinity;
      for (let i = k; i < coords.length; i++) { const d = hav(coords[i], { lat, lng }); if (d < bd) { bd = d; bi = i; } if (d > bd + 300) break; }
      k = bi; steps.push({ text: instruction(s), at: cum[bi] });
    }
    dest.route = { coords, cum, total: cum[cum.length - 1], steps };
    routeLine.setLatLngs(coords.map(c => [c.lat, c.lng]));
    const ol = $('#dest-steps'); ol.replaceChildren(...steps.map(s => { const li = document.createElement('li'); li.textContent = s.text; return li; }));
  } catch {
    dest.route = null;
    routeLine.setLatLngs(from ? [[from.lat, from.lng], [dest.lat, dest.lng]] : []);
    $('#dest-steps').replaceChildren();
  }
}
function instruction(s) {
  const m = s.maneuver, onto = s.name ? ` onto ${s.name}` : '';
  switch (m.type) {
    case 'depart': return `Head ${compass(m.bearing_after || 0)}${s.name ? ' on ' + s.name : ''}`;
    case 'arrive': return 'Arrive at destination';
    case 'roundabout': case 'rotary': return `Take the roundabout${m.exit ? `, exit ${m.exit}` : ''}${onto}`;
    default: {
      const mod = m.modifier || 'straight';
      const verb = mod === 'straight' ? 'Continue straight' : mod === 'uturn' ? 'Make a U-turn' : `Turn ${mod}`;
      return verb + onto;
    }
  }
}
function etaSpeed() { // m/s
  if (run && run.dist > 300 && run.moving > 60000) return run.dist / (run.moving / 1000);
  return 1000 / settings.defaultPace;
}
function updateDestination(p) {
  if (!dest) return;
  const straight = hav(p, dest);
  let remaining = straight, next = '';
  const rt = dest.route;
  if (rt) {
    let bi = 0, bd = Infinity;
    for (let i = 0; i < rt.coords.length; i++) { const d = hav(p, rt.coords[i]); if (d < bd) { bd = d; bi = i; } }
    remaining = rt.total - rt.cum[bi] + bd;
    const along = rt.cum[bi];
    const ns = rt.steps.find(s => s.at > along + 5);
    if (ns) next = `In ${fmtDist(ns.at - along)}: ${ns.text}`;
    $$('#dest-steps li').forEach((li, i) => li.classList.toggle('done', rt.steps[i] && rt.steps[i].at <= along + 5));
    if (bd > 45 && Date.now() - dest.lastRoute > 15000) fetchRoute(p); // off route: recalculate
  } else if (Date.now() - dest.lastRoute > 30000) fetchRoute(p);
  const secs = remaining / etaSpeed();
  $('#dest-dist').textContent = fmtDist(remaining);
  $('#dest-eta').textContent = fmtDur(secs * 1000);
  $('#dest-arrive').textContent = fmtClock(Date.now() + secs * 1000);
  $('#dest-next').textContent = next || `${fmtDist(straight)} straight line ${arrow(bearing(p, dest))}`;
  if (!dest.arrived && straight < 25) {
    dest.arrived = true; playSound(); notify('🏁 Destination reached', dest.name, 'dest'); toast('You have arrived!');
  }
}

// destination UI
function openModal(id) { $(id).classList.remove('hidden'); }
function closeModals() { $$('.modal').forEach(m => m.classList.add('hidden')); }
$$('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-close]')) closeModals(); }));
let picking = false;
$('#btn-dest').onclick = () => { $('#dest-results').replaceChildren(); openModal('#dest-modal'); };
$('#btn-dest-clear').onclick = clearDestination;
$('#btn-pick-map').onclick = () => { closeModals(); picking = true; $('#pick-banner').classList.remove('hidden'); };
$('#btn-pick-cancel').onclick = () => { picking = false; $('#pick-banner').classList.add('hidden'); };
map.on('click', e => {
  if (!picking) return;
  picking = false; $('#pick-banner').classList.add('hidden');
  setDestination(e.latlng, 'Dropped pin');
});
function goNearestFountain() {
  const p = geo.last || map.getCenter();
  const n = nearestFountain(p);
  if (!n) { toast('No fountains loaded near you yet'); return; }
  setDestination({ lat: n.f.lat, lng: n.f.lng }, n.f.name || 'Water fountain');
}
$('#btn-pick-fountain').onclick = goNearestFountain;
$('#btn-nearest').onclick = goNearestFountain;
$('#dest-search-form').onsubmit = async e => {
  e.preventDefault();
  const q = $('#dest-search').value.trim(); if (!q) return;
  const ul = $('#dest-results'); ul.innerHTML = '<li>Searching…</li>';
  const c = geo.last || map.getCenter();
  const vb = [c.lng - 0.3, c.lat + 0.3, c.lng + 0.3, c.lat - 0.3].join(',');
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&viewbox=${vb}&q=${encodeURIComponent(q)}`, { headers: { 'Accept-Language': navigator.language || 'en' } });
    const res = await r.json();
    ul.replaceChildren(...(res.length ? res : [null]).map(x => {
      const li = document.createElement('li');
      if (!x) { li.textContent = 'No results'; return li; }
      const ll = { lat: +x.lat, lng: +x.lon };
      li.textContent = `${x.display_name} (${fmtDist(hav(c, ll))})`;
      li.onclick = () => setDestination(ll, x.name || x.display_name.split(',')[0]);
      return li;
    }));
  } catch { ul.innerHTML = '<li>Search failed — check your connection</li>'; }
};

// ---------- history ----------
function renderHistory() {
  const runs = LS.get('wb_runs', []);
  $('#history-empty').classList.toggle('hidden', runs.length > 0);
  const tot = runs.reduce((a, r) => ({ d: a.d + r.dist, t: a.t + r.moving }), { d: 0, t: 0 });
  $('#history-totals').innerHTML = runs.length ? `<div><b>${runs.length}</b><span>runs</span></div><div><b>${(tot.d / 1000).toFixed(1)}</b><span>km total</span></div><div><b>${fmtPace(paceOf(tot.d, tot.t))}</b><span>avg moving /km</span></div>` : '';
  $('#history-list').replaceChildren(...runs.map(r => {
    const li = document.createElement('li'); li.className = 'run-item';
    const d = new Date(r.start);
    li.innerHTML = `<div class="ri-top"><span>${d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} · ${fmtClock(r.start)}</span><span>💧 ${r.fountains || 0}</span></div>
      <div class="ri-stats"><div><b>${fmtKm(r.dist)}</b><span>km</span></div><div><b>${fmtDur(r.moving + r.paused)}</b><span>total</span></div><div><b>${fmtPace(paceOf(r.dist, r.moving))}</b><span>moving /km</span></div><div><b>${fmtSpeed(r.dist, r.moving + r.paused)}</b><span>km/h overall</span></div></div>`;
    li.onclick = () => openRun(r.id);
    return li;
  }));
}
let rdMap = null, rdLayer = null, rdCurrent = null;
function openRun(id) {
  const r = LS.get('wb_runs', []).find(x => x.id === id); if (!r) return;
  rdCurrent = r;
  $('#rd-title').textContent = new Date(r.start).toLocaleString([], { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const el = r.moving + r.paused;
  const cells = [
    [fmtKm(r.dist) + ' km', 'Distance'], [fmtDur(el), 'Total time (with pauses)'],
    [fmtDur(r.moving), 'Moving time'], [fmtDur(r.paused) + ` (${r.pauses.length})`, 'Paused (stops)'],
    [fmtSpeed(r.dist, r.moving) + ' km/h', 'Speed — moving'], [fmtSpeed(r.dist, el) + ' km/h', 'Speed — with pauses'],
    [fmtPace(paceOf(r.dist, r.moving)) + ' /km', 'Pace — moving'], [fmtPace(paceOf(r.dist, el)) + ' /km', 'Pace — with pauses'],
    [fmtClock(r.start) + '–' + fmtClock(r.end), 'Start – finish'], [String(r.fountains || 0), 'Fountains passed'],
  ];
  $('#rd-stats').innerHTML = cells.map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('');
  openModal('#run-modal');
  setTimeout(() => {
    if (!rdMap) {
      rdMap = L.map('rd-map', { zoomControl: false, attributionControl: true });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(rdMap);
      rdLayer = L.layerGroup().addTo(rdMap);
    }
    rdMap.invalidateSize(); rdLayer.clearLayers();
    const ll = r.pts.map(p => [p[0], p[1]]);
    if (ll.length > 1) {
      const line = L.polyline(ll, { color: '#0b6bcb', weight: 5 }).addTo(rdLayer);
      L.circleMarker(ll[0], { radius: 7, color: '#fff', fillColor: '#1f9d55', fillOpacity: 1, weight: 2 }).addTo(rdLayer);
      L.circleMarker(ll[ll.length - 1], { radius: 7, color: '#fff', fillColor: '#d6353a', fillOpacity: 1, weight: 2 }).addTo(rdLayer);
      rdMap.fitBounds(line.getBounds(), { padding: [24, 24] });
    } else if (ll.length) rdMap.setView(ll[0], 16); else rdMap.setView(map.getCenter(), 13);
  }, 60);
}
$('#rd-delete').onclick = () => {
  if (!rdCurrent || !confirm('Delete this run?')) return;
  LS.set('wb_runs', LS.get('wb_runs', []).filter(x => x.id !== rdCurrent.id));
  closeModals(); renderHistory(); toast('Run deleted');
};
$('#rd-gpx').onclick = () => {
  const r = rdCurrent; if (!r) return;
  const pts = r.pts.map(p => `<trkpt lat="${p[0]}" lon="${p[1]}"><time>${new Date(r.start + p[2] * 1000).toISOString()}</time></trkpt>`).join('\n');
  const gpx = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="WaterBreak" xmlns="http://www.topografix.com/GPX/1/1">\n<trk><name>WaterBreak run ${new Date(r.start).toISOString()}</name><type>running</type><trkseg>\n${pts}\n</trkseg></trk></gpx>`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([gpx], { type: 'application/gpx+xml' }));
  a.download = `waterbreak-${new Date(r.start).toISOString().slice(0, 10)}.gpx`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
};

// ---------- friends (relayed through ntfy.sh topics) ----------
const NTFY = 'https://ntfy.sh';
const CODE_ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function genCode() { const a = crypto.getRandomValues(new Uint8Array(10)); return [...a].map(x => CODE_ALPHA[x % 32]).join(''); }
const normCode = c => c.toUpperCase().replace(/[^A-Z0-9]/g, '');
const prettyCode = c => c.replace(/(.{5})(.{5})/, '$1-$2');
let myCode = LS.get('wb_code', null);
if (!myCode) { myCode = genCode(); LS.set('wb_code', myCode); }
const runTopic = code => 'waterbreak_' + normCode(code).toLowerCase();
const helloTopic = code => runTopic(code) + '_hi';
let friends = LS.get('wb_friends', []); // {code,name,live,lastSeen}
let feed = LS.get('wb_feed', []);       // {id,time,title,message,code}
const appOpened = Date.now();
let es = null;
const displayName = () => settings.name.trim() || 'A WaterBreak friend';

async function ntfyPost(topic, title, message, tags) {
  try {
    await fetch(NTFY, { method: 'POST', body: JSON.stringify({ topic, title, message, tags }) });
    return true;
  } catch { return false; }
}
function friendsPublish(kind, saved) {
  if (!settings.share) return;
  const name = displayName();
  if (kind === 'start') ntfyPost(runTopic(myCode), `${name} started a run 🏃`, `Started at ${fmtClock(Date.now())}. Cheer them on!`, ['wbstart']);
  else if (kind === 'progress' && run) {
    const el = run.moving + run.paused;
    ntfyPost(runTopic(myCode), `${name} is running`, `${fmtKm(run.dist)} km · ${fmtDur(el)} · ${fmtPace(paceOf(run.dist, run.moving))} /km moving · ${fmtSpeed(run.dist, run.moving)} km/h`, ['wbprogress']);
  } else if (kind === 'finish' && saved) {
    const el = saved.moving + saved.paused;
    ntfyPost(runTopic(myCode), `${name} finished a run 🏁`,
      `${fmtKm(saved.dist)} km in ${fmtDur(el)} (moving ${fmtDur(saved.moving)}) · ${fmtPace(paceOf(saved.dist, saved.moving))} /km moving, ${fmtPace(paceOf(saved.dist, el))} /km overall · ${fmtSpeed(saved.dist, saved.moving)} km/h · ${saved.pauses.length} stops · 💧 ${saved.fountains}`,
      ['wbfinish']);
  }
}
function connectFriends() {
  if (es) { es.close(); es = null; }
  const topics = [helloTopic(myCode), ...friends.map(f => runTopic(f.code))];
  const since = LS.get('wb_since', null) || '24h';
  es = new EventSource(`${NTFY}/${topics.join(',')}/sse?since=${encodeURIComponent(since)}`);
  es.onopen = () => { $('#friend-conn').textContent = friends.length ? `Connected · following ${friends.length} friend${friends.length > 1 ? 's' : ''}` : 'Connected · waiting for friends'; };
  es.onerror = () => { $('#friend-conn').textContent = 'Reconnecting to friends…'; };
  es.onmessage = e => { try { handleMsg(JSON.parse(e.data)); } catch {} };
}
function handleMsg(m) {
  if (m.event !== 'message') return;
  LS.set('wb_since', m.id);
  const tags = m.tags || [];
  const fresh = m.time * 1000 > appOpened - 60000;
  if (m.topic === helloTopic(myCode)) {
    const ctag = tags.find(t => t.startsWith('c-')); if (!ctag) return;
    const code = normCode(ctag.slice(2));
    if (code === myCode || code.length !== 10) return;
    const name = (m.title || 'Friend').slice(0, 30);
    const f = friends.find(x => x.code === code);
    if (!f) {
      friends.push({ code, name }); LS.set('wb_friends', friends); renderFriends();
      addFeed({ id: m.id, time: m.time, title: `${name} connected with you`, message: 'You now follow each other’s runs.', code });
      if (fresh) { toast(`${name} added you as a friend`); notify('👋 New WaterBreak friend', `${name} connected with you`, 'hello-' + code); }
      setTimeout(connectFriends, 300);
    } else if (f.name !== name) { f.name = name; LS.set('wb_friends', friends); renderFriends(); }
    return;
  }
  const f = friends.find(x => runTopic(x.code) === m.topic); if (!f) return;
  if (feed.some(x => x.id === m.id)) return;
  if (tags.includes('wbstart')) f.live = m.time;
  if (tags.includes('wbfinish')) f.live = null;
  if (tags.includes('wbprogress')) f.live = f.live || m.time;
  const nm = (m.title || '').match(/^(.*?) (started|is running|finished)/); if (nm && nm[1]) f.name = nm[1].slice(0, 30);
  LS.set('wb_friends', friends); renderFriends();
  addFeed({ id: m.id, time: m.time, title: m.title || '', message: m.message || '', code: f.code });
  if (fresh && settings.notifyFriends && (tags.includes('wbstart') || tags.includes('wbfinish'))) {
    notify(m.title || 'Friend update', m.message || '', 'friend-' + f.code);
    playSound('friend');
    if (!$('#view-friends').classList.contains('active')) $('#friends-badge').classList.remove('hidden');
  }
}
function addFeed(item) {
  if (feed.some(x => x.id === item.id)) return;
  feed.unshift(item); feed = feed.slice(0, 60); LS.set('wb_feed', feed); renderFeed();
}
function renderFeed() {
  $('#feed-empty').classList.toggle('hidden', feed.length > 0);
  $('#feed').replaceChildren(...feed.map(x => {
    const li = document.createElement('li');
    const t = document.createElement('div'); t.className = 'ft'; t.textContent = x.title;
    const msg = document.createElement('div'); msg.className = 'fm'; msg.textContent = x.message;
    const w = document.createElement('div'); w.className = 'fw'; w.textContent = new Date(x.time * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    li.append(t, msg, w); return li;
  }));
}
function renderFriends() {
  $('#my-code').textContent = prettyCode(myCode);
  $('#friend-empty').classList.toggle('hidden', friends.length > 0);
  $('#friend-list').replaceChildren(...friends.map(f => {
    const li = document.createElement('li');
    const left = document.createElement('div');
    const n = document.createElement('div'); n.className = 'fname'; n.textContent = f.name || 'Friend';
    const c = document.createElement('div'); c.className = 'fcode'; c.textContent = prettyCode(f.code) + ' · ';
    const a = document.createElement('a'); a.href = `${NTFY}/${runTopic(f.code)}`; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'ntfy feed';
    a.title = 'Subscribe to this topic in the ntfy app to get alerts even when WaterBreak is closed';
    c.append(a);
    left.append(n, c);
    if (f.live && Date.now() / 1000 - f.live < 4 * 3600) { const l = document.createElement('div'); l.className = 'live'; l.textContent = '● Running now'; left.append(l); }
    const rm = document.createElement('button'); rm.className = 'btn small danger'; rm.textContent = 'Remove';
    rm.onclick = () => { if (!confirm(`Remove ${f.name || 'this friend'}?`)) return; friends = friends.filter(x => x.code !== f.code); LS.set('wb_friends', friends); renderFriends(); connectFriends(); };
    li.append(left, rm); return li;
  }));
}
$('#add-friend-form').onsubmit = async e => {
  e.preventDefault();
  const code = normCode($('#friend-code-input').value);
  if (code.length !== 10) { toast('Codes are 10 characters, like ABCDE-FGHJK'); return; }
  if (code === myCode) { toast('That is your own code'); return; }
  if (friends.some(f => f.code === code)) { toast('Already connected'); return; }
  friends.push({ code, name: 'Friend' }); LS.set('wb_friends', friends);
  $('#friend-code-input').value = '';
  renderFriends(); connectFriends();
  const ok = await ntfyPost(helloTopic(code), displayName(), `${displayName()} connected with you on WaterBreak`, ['wbhello', 'c-' + myCode]);
  toast(ok ? 'Friend added — they will follow you back automatically' : 'Added, but could not reach them (offline?)');
};
$('#btn-share-code').onclick = async () => {
  const text = `Follow my runs on WaterBreak! My friend code: ${prettyCode(myCode)} — ${location.origin + location.pathname}`;
  try { if (navigator.share) { await navigator.share({ title: 'WaterBreak', text }); return; } } catch { return; }
  try { await navigator.clipboard.writeText(text); toast('Copied to clipboard'); } catch { toast(prettyCode(myCode)); }
};

// ---------- settings UI ----------
function bindSettings() {
  const bindRange = (id, key, fmt, out, scale = 1) => {
    const el = $(id); el.value = settings[key] / scale;
    const upd = () => { settings[key] = +el.value * scale; if (out) $(out).textContent = fmt(settings[key]); saveSettings(); };
    el.oninput = upd; if (out) $(out).textContent = fmt(settings[key]);
  };
  bindRange('#set-alert-dist', 'alertDistance', v => `${v} m`, '#alert-dist-val');
  bindRange('#set-volume', 'volume');
  bindRange('#set-pause-speed', 'pauseSpeedKmh', v => `${v} km/h`, '#pause-speed-val');
  bindRange('#set-pause-delay', 'pauseDelay', v => `${v} s`, '#pause-delay-val');
  const bindCheck = (id, key, after) => { const el = $(id); el.checked = !!settings[key]; el.onchange = () => { settings[key] = el.checked; saveSettings(); after && after(); }; };
  bindCheck('#set-vibrate', 'vibrate');
  bindCheck('#set-alert-run-only', 'alertRunOnly');
  bindCheck('#set-autopause', 'autoPause');
  bindCheck('#set-keepawake', 'keepAwake', () => setWake(!!run && settings.keepAwake));
  bindCheck('#set-share', 'share');
  bindCheck('#set-notify-friends', 'notifyFriends');
  const bindSelect = (id, key, num) => { const el = $(id); el.value = String(settings[key]); el.onchange = () => { settings[key] = num ? +el.value : el.value; saveSettings(); }; };
  bindSelect('#set-sound', 'sound');
  bindSelect('#set-default-pace', 'defaultPace', true);
  bindSelect('#set-share-every', 'shareEvery', true);
  const nm = $('#set-name'); nm.value = settings.name;
  nm.onchange = () => { settings.name = nm.value.trim().slice(0, 30); saveSettings(); };
  $('#set-sound').addEventListener('change', () => playSound());
  $('#btn-test-sound').onclick = () => playSound();
  $('#btn-notif').onclick = requestNotif;
  $('#btn-test-notif').onclick = async () => {
    unlockAudio();
    if ((await requestNotif()) !== 'granted') return;
    playSound();
    const ok = await notify('💧 Water fountain nearby', `Test alert — fountains within ${settings.alertDistance} m trigger this`, 'test');
    if (!ok) toast('Notification could not be shown');
  };
  $('#btn-clear').onclick = () => { if (confirm('Delete ALL saved runs? This cannot be undone.')) { LS.set('wb_runs', []); renderHistory(); toast('All runs deleted'); } };
  renderNotifState();
}
function renderNotifState() {
  const b = $('#btn-notif'), h = $('#notif-hint');
  if (!notifSupported()) { b.textContent = 'Unavailable'; b.disabled = true; h.textContent = isIOS() ? 'On iPhone, add WaterBreak to your Home Screen first (Share → Add to Home Screen), then open it from there.' : 'This browser does not support notifications.'; return; }
  const p = Notification.permission;
  b.textContent = p === 'granted' ? 'Enabled ✓' : p === 'denied' ? 'Blocked' : 'Enable';
  b.disabled = p !== 'default';
  h.textContent = p === 'denied' ? 'Notifications are blocked — allow them for this site in your browser settings.' : p === 'granted' ? 'You will get alerts for nearby fountains, arrival, and friends’ runs while WaterBreak is open.' : 'Allow notifications to get fountain and friend alerts.';
}

// ---------- tabs & controls ----------
$$('.tabbar button').forEach(b => b.onclick = () => {
  $$('.tabbar button').forEach(x => x.classList.toggle('active', x === b));
  $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + b.dataset.view));
  if (b.dataset.view === 'run') setTimeout(() => map.invalidateSize(), 50);
  if (b.dataset.view === 'friends') $('#friends-badge').classList.add('hidden');
  if (b.dataset.view === 'history') renderHistory();
});
$('#btn-start').onclick = startRun;
$('#btn-pause').onclick = () => setPaused('manual', !run.manual);
$('#btn-stop').onclick = finishRun;
$('#btn-recenter').onclick = () => { follow = true; $('#btn-recenter').classList.add('on'); if (geo.last) map.setView([geo.last.lat, geo.last.lng], Math.max(map.getZoom(), 16)); else geo.start(); };
$('#sheet-handle').onclick = () => $('#sheet').classList.toggle('expanded');
window.addEventListener('beforeunload', persistRun);

// ---------- demo mode (?demo): simulated runner heading for fountains ----------
const demo = {
  pos: { lat: 40.7812, lng: -73.9665 }, heading: 200, visited: new Set(), stopUntil: 0,
  start() {
    setInterval(() => {
      const now = Date.now();
      if (now < this.stopUntil) { this.emit(0); return; }
      const n = [...fountains.values()].filter(f => !this.visited.has(f.id)).map(f => ({ f, d: hav(this.pos, f) })).sort((a, b) => a.d - b.d)[0];
      if (n && n.d < 600) {
        this.heading = bearing(this.pos, n.f);
        if (n.d < 6) { this.visited.add(n.f.id); this.stopUntil = now + 12000; }
      } else this.heading += (Math.random() - 0.5) * 20;
      const step = 3.2, r = this.heading * Math.PI / 180;
      this.pos = { lat: this.pos.lat + step * Math.cos(r) / 111320, lng: this.pos.lng + step * Math.sin(r) / (111320 * Math.cos(this.pos.lat * Math.PI / 180)) };
      this.emit(step);
    }, 1000);
  },
  emit(speed) { onFix({ lat: this.pos.lat + (Math.random() - .5) * 0.00001, lng: this.pos.lng + (Math.random() - .5) * 0.00001, acc: 6 + Math.random() * 4, speed, t: Date.now() }); },
};

// ---------- boot ----------
bindSettings();
restoreRun();
renderControls(); renderStats(); renderHistory(); renderFriends(); renderFeed();
connectFriends();
geo.start();
if (DEMO) toast('Demo mode: simulated GPS in Central Park', 4000);
