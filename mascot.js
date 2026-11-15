/* Rocco the raccoon: WaterBreak's mascot. Mood follows how recently (and how well) you ran. */
'use strict';
(function () {
  const MOODS = {
    party:  { mouth: 'open', brow: null, eye: 'happy', ear: -6, cheek: true,  hat: true,  tear: false },
    happy:  { mouth: 12,     brow: null, eye: 'open',  ear: 0,  cheek: true,  hat: false, tear: false },
    ok:     { mouth: 3,      brow: 0,    eye: 'open',  ear: 6,  cheek: false, hat: false, tear: false },
    sad:    { mouth: -8,     brow: 7,    eye: 'down',  ear: 18, cheek: false, hat: false, tear: false },
    crying: { mouth: -12,    brow: 11,   eye: 'down',  ear: 28, cheek: false, hat: false, tear: true },
  };

  function eye(cx, cy, kind) {
    if (kind === 'happy') return `<path d="M${cx - 9} ${cy + 3} Q${cx} ${cy - 9} ${cx + 9} ${cy + 3}" stroke="#fff" stroke-width="4.5" fill="none" stroke-linecap="round"/>`;
    const py = kind === 'down' ? cy + 3 : cy + 1;
    return `<circle cx="${cx}" cy="${cy}" r="9.5" fill="#fff"/>` +
      `<circle class="pupil" cx="${cx + 1}" cy="${py}" r="5.5" fill="#15171b"/>` +
      `<circle cx="${cx + 3}" cy="${py - 2.5}" r="1.9" fill="#fff"/>` +
      (kind === 'down' ? `<path d="M${cx - 10} ${cy - 4} Q${cx} ${cy - 10} ${cx + 10} ${cy - 4} L${cx + 10} ${cy - 11} L${cx - 10} ${cy - 11}Z" fill="#2b2e35"/>` : '');
  }

  function svg(mood = 'happy', size = 200) {
    const m = MOODS[mood] || MOODS.happy;
    const ear = side => {
      const rot = side < 0 ? -m.ear : m.ear;
      const g = `<g transform="rotate(${rot} 72 84)"><path d="M44 90 C36 52 52 36 84 58 Z" fill="#7b818c"/><path d="M52 82 C48 60 58 52 76 62 Z" fill="#3a3d44"/></g>`;
      return side < 0 ? g : `<g transform="translate(220 0) scale(-1 1)">${g}</g>`;
    };
    const mouth = m.mouth === 'open'
      ? `<path d="M93 146 Q110 176 127 146 Z" fill="#5a1f2b"/><path d="M101 160 Q110 170 119 160 Q110 154 101 160Z" fill="#f28da0"/>`
      : `<path d="M95 149 Q110 ${149 + m.mouth} 125 149" stroke="#1d1f24" stroke-width="3.6" fill="none" stroke-linecap="round"/>`;
    const brows = m.brow === null ? '' :
      `<path d="M64 ${84 + m.brow * .3} L90 ${84 - m.brow}" stroke="#d9dce1" stroke-width="4" stroke-linecap="round"/>` +
      `<path d="M156 ${84 + m.brow * .3} L130 ${84 - m.brow}" stroke="#d9dce1" stroke-width="4" stroke-linecap="round"/>`;
    const hat = m.hat ? `<g transform="rotate(-16 110 56)"><path d="M90 62 L110 6 L130 62 Z" fill="#ff7a59"/><path d="M96 46 L124 46 L121 38 L99 38Z" fill="#ffd166"/><path d="M103 26 L117 26 L114 18 L106 18Z" fill="#4cc2ff"/><circle cx="110" cy="6" r="7" fill="#ffd166"/></g>` : '';
    const confetti = m.hat ? [[20, 40, '#ff7a59'], [196, 30, '#4cc2ff'], [30, 150, '#ffd166'], [192, 140, '#3ccf7d'], [172, 70, '#ff7a59'], [46, 16, '#3ccf7d']]
      .map(([x, y, c], i) => `<rect class="confetti" style="animation-delay:${i * .25}s" x="${x}" y="${y}" width="8" height="12" rx="2" fill="${c}" transform="rotate(${i * 35} ${x} ${y})"/>`).join('') : '';
    const tear = m.tear ? `<path class="tear" d="M86 120 C82 129 80 134 84 138 C88 141 93 137 91 130 Z" fill="#6cc4ff"/><path class="tear t2" d="M136 120 C132 129 130 134 134 138 C138 141 143 137 141 130 Z" fill="#6cc4ff"/>` : '';
    return `<svg class="rac rac-${mood}" viewBox="0 0 220 220" width="${size}" height="${size}" role="img" aria-label="Rocco the raccoon looks ${mood === 'party' ? 'thrilled' : mood}">
  ${confetti}
  <ellipse cx="110" cy="212" rx="62" ry="6" fill="rgba(0,0,0,.12)"/>
  <path d="M58 168 C58 200 76 210 110 210 C144 210 162 200 162 168 Z" fill="#8a909a"/>
  <path d="M84 176 C84 200 94 206 110 206 C126 206 136 200 136 176 Z" fill="#e9e5de"/>
  ${ear(-1)}${ear(1)}
  <path d="M110 54 C160 54 186 86 186 122 C186 160 152 182 110 182 C68 182 34 160 34 122 C34 86 60 54 110 54Z" fill="#9aa1ac"/>
  <path d="M48 82 C74 62 146 62 172 82 L170 93 C146 74 74 74 50 93 Z" fill="#1aa3e8"/>
  <path d="M104 72 C108 70 112 70 116 72 L113 79 L107 79 Z" fill="#fff" opacity=".85"/>
  <path d="M110 80 C105 90 105 98 110 106 C115 98 115 90 110 80Z" fill="#5d636d"/>
  <path d="M58 124 C68 106 92 106 110 118 C128 106 152 106 162 124 C164 154 142 174 110 174 C78 174 56 154 58 124Z" fill="#f4f1ec"/>
  <path d="M42 112 C50 90 86 88 104 106 L110 112 L116 106 C134 88 170 90 178 112 C172 128 150 134 132 128 L110 121 L88 128 C70 134 48 128 42 112Z" fill="#2b2e35"/>
  ${brows}
  ${eye(80, 110, m.eye)}${eye(140, 110, m.eye)}
  ${m.cheek ? '<ellipse cx="72" cy="144" rx="10" ry="5.5" fill="#f4a3b4" opacity=".7"/><ellipse cx="148" cy="144" rx="10" ry="5.5" fill="#f4a3b4" opacity=".7"/>' : ''}
  <ellipse cx="110" cy="136" rx="10.5" ry="7" fill="#1d1f24"/><ellipse cx="107" cy="133.5" rx="3" ry="1.8" fill="#fff" opacity=".6"/>
  ${mouth}
  ${tear}
  ${hat}
</svg>`;
  }

  const DAY = 864e5;
  const startOfDay = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };

  // What made a run special (used for congratulations)
  function highlights(r, runs, goalResult) {
    const out = [];
    const others = runs.filter(x => x.id !== r.id);
    const pace = (x) => x.dist > 0 ? x.moving / x.dist : Infinity; // ms per m
    const gr = goalResult && goalResult(r);
    if (gr && gr.hit) out.push('you smashed your goal');
    if (others.length && r.dist >= 1000 && r.dist > Math.max(...others.map(x => x.dist))) out.push('it is your longest run ever');
    const fastOthers = others.filter(x => x.dist >= 1000);
    if (r.dist >= 1000 && fastOthers.length && pace(r) < Math.min(...fastOthers.map(pace))) out.push('it is your fastest pace yet');
    if (r.dist >= 10000) out.push('double digits — 10 km+!');
    else if (r.dist >= 5000 && !out.length) out.push('a solid 5 km+');
    const week = runs.filter(x => x.start > Date.now() - 7 * DAY).length;
    if (week >= 3) out.push(`that is ${week} runs this week`);
    if (!others.length && r.dist > 20) out.push('it is your very first run together');
    return out;
  }

  function state(runs, goalResult) {
    if (!runs.length) return { mood: 'ok', days: null, happiness: 60, lines: ["Hi, I'm Rocco! 🦝", "I love running and finding water fountains. Shall we go for our first run together?"] };
    const last = runs[0];
    const days = Math.floor((startOfDay(Date.now()) - startOfDay(last.end || last.start)) / DAY);
    const hl = highlights(last, runs, goalResult);
    const fresh = Date.now() - (last.end || last.start) < 18 * 3600e3;
    let mood, lines;
    if (fresh && hl.length) {
      mood = 'party';
      lines = ['WOW, what a run! 🎉', `I'm so proud: ${hl.join(', ')}.`];
    } else if (days <= 1) {
      mood = 'happy';
      lines = days === 0 ? ['Great job running today! 💪', 'I feel fantastic. Rest up and drink some water.'] : ['We ran yesterday — I feel great!', 'Ready for another one when you are.'];
    } else if (days <= 3) {
      mood = 'ok';
      lines = [`It's been ${days} days since our last run.`, 'My legs are getting restless… a short jog?'];
    } else if (days <= 6) {
      mood = 'sad';
      lines = [`${days} days without running… 😔`, "I miss our runs. Even 2 km would cheer me up!"];
    } else {
      mood = 'crying';
      lines = [`${days} days?! 😭`, "Did you forget about me? Please, let's go for a run — the fountains miss you too."];
    }
    const happiness = Math.max(5, Math.min(100, (mood === 'party' ? 100 : 95) - Math.max(0, days - 1) * 13));
    return { mood, days, happiness, lines, highlights: hl };
  }

  window.Raccoon = { svg, state, highlights };
})();
