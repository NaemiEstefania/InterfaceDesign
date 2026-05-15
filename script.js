// ================================
// INFINITE PATH – script.js
// ================================

const canvas    = document.getElementById('canvas');
const ctx       = canvas.getContext('2d');
const msgEl     = document.getElementById('message');
const startEl   = document.getElementById('startscreen');

// --- KONFIGURATION ---
const CFG = {
  max:     200,   // Gesamtlänge des Loops
  step:    2,     // Fortschritt pro Scroll-Schritt
};

// --- ZUSTAND ---
let progress    = 0;
let dashOffset  = 0;
let started     = false;
let lastTouchY  = null;
let time        = 0;
let lastHeart   = 0;

// Nachrichten: { at: ab welchem Fortschritt, text }
const MESSAGES = [
  { at: 6,   text: "lauf nicht ins licht" },
  { at: 15,  text: "es wartet schon auf dich" },
  { at: 24,  text: "du warst schon mal hier" },
  { at: 33,  text: "kehr um." },
  { at: 42,  text: "niemand hört dich" },
  { at: 51,  text: "das licht macht dich nicht frei" },
  { at: 60,  text: "du weißt selbst, dass es falsch ist" },
  { at: 69,  text: "du erinnerst dich nicht\nan den letzten reset" },
  { at: 78,  text: "wie oft warst du schon hier?" },
  { at: 87,  text: "es zieht dich rein" },
  { at: 96,  text: "schau hinter dich" },
  { at: 108, text: "fast." },
  { at: 118, text: "zu spät." },
  { at: 128, text: "—" },
  { at: 136, text: "wieder." },
  { at: 144, text: "hör auf." },
  { at: 152, text: "du kannst es nicht erreichen" },
  { at: 160, text: "das weißt du" },
  { at: 168, text: "und doch" },
  { at: 176, text: "..." },
  { at: 184, text: "es sieht dich" },
  { at: 192, text: "noch einmal?" },
];

let shownMessages = new Set();
let msgTO  = null;
let msgRaf = null;

// ================================
// AUDIO
// ================================
let AC, masterGain, droneOsc, droneGain;
let pulseOsc, pulseGain, tensionOsc, tensionGain;
let noiseSource, noiseGain, heartOsc, heartGain;

function createReverb(ac) {
  const conv = ac.createConvolver();
  const len  = ac.sampleRate * 2.5;
  const buf  = ac.createBuffer(2, len, ac.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++)
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
  }
  conv.buffer = buf;
  return conv;
}

function initAudio() {
  if (AC) return;
  AC = new (window.AudioContext || window.webkitAudioContext)();

  masterGain = AC.createGain();
  masterGain.gain.value = 0.75;
  masterGain.connect(AC.destination);

  const rev = createReverb(AC);
  rev.connect(masterGain);
  const dry = AC.createGain();
  dry.gain.value = 0.55;
  dry.connect(masterGain);

  // Drone
  droneOsc  = AC.createOscillator();
  droneOsc.type = 'sawtooth';
  droneOsc.frequency.value = 55;
  const df = AC.createBiquadFilter();
  df.type = 'lowpass'; df.frequency.value = 300;
  droneGain = AC.createGain(); droneGain.gain.value = 0.001;
  droneOsc.connect(df); df.connect(droneGain);
  droneGain.connect(rev); droneGain.connect(dry);
  droneOsc.start();

  // Pulse
  pulseOsc  = AC.createOscillator();
  pulseOsc.type = 'sine'; pulseOsc.frequency.value = 82;
  pulseGain = AC.createGain(); pulseGain.gain.value = 0.001;
  pulseOsc.connect(pulseGain);
  pulseGain.connect(rev); pulseGain.connect(dry);
  pulseOsc.start();

  // Tension
  tensionOsc  = AC.createOscillator();
  tensionOsc.type = 'sine'; tensionOsc.frequency.value = 220;
  tensionGain = AC.createGain(); tensionGain.gain.value = 0.001;
  tensionOsc.connect(tensionGain);
  tensionGain.connect(rev); tensionGain.connect(dry);
  tensionOsc.start();

  // Noise
  const bSize = AC.sampleRate * 3;
  const nBuf  = AC.createBuffer(1, bSize, AC.sampleRate);
  const nd    = nBuf.getChannelData(0);
  for (let i = 0; i < bSize; i++) nd[i] = Math.random() * 2 - 1;
  noiseSource = AC.createBufferSource();
  noiseSource.buffer = nBuf; noiseSource.loop = true;
  const nf = AC.createBiquadFilter();
  nf.type = 'bandpass'; nf.frequency.value = 600; nf.Q.value = 0.6;
  noiseGain = AC.createGain(); noiseGain.gain.value = 0.001;
  noiseSource.connect(nf); nf.connect(noiseGain);
  noiseGain.connect(rev); noiseGain.connect(dry);
  noiseSource.start();

  // Heartbeat
  heartOsc  = AC.createOscillator();
  heartOsc.type = 'sine'; heartOsc.frequency.value = 46;
  heartGain = AC.createGain(); heartGain.gain.value = 0.001;
  heartOsc.connect(heartGain);
  heartGain.connect(masterGain);
  heartOsc.start();
}

function updateAudio() {
  if (!AC) return;
  const p   = progress / CFG.max;
  const now = AC.currentTime;

  droneGain.gain.setTargetAtTime(0.05 + p * 0.22, now, 0.7);
  droneOsc.frequency.setTargetAtTime(55 + p * 32, now, 1.0);

  pulseGain.gain.setTargetAtTime(Math.max(0.001, p * 0.14), now, 0.4);
  pulseOsc.frequency.setTargetAtTime(82 + p * 70, now, 0.6);

  if (p > 0.3) {
    const tp = (p - 0.3) / 0.7;
    tensionGain.gain.setTargetAtTime(tp * tp * 0.18, now, 0.5);
    tensionOsc.frequency.setTargetAtTime(220 + tp * 580, now, 0.8);
  } else {
    tensionGain.gain.setTargetAtTime(0.001, now, 0.4);
  }

  if (p > 0.42) {
    const np = (p - 0.42) / 0.58;
    noiseGain.gain.setTargetAtTime(np * np * 0.10, now, 0.35);
  } else {
    noiseGain.gain.setTargetAtTime(0.001, now, 0.4);
  }

  if (p > 0.52) {
    const hp  = (p - 0.52) / 0.48;
    const bpm = 58 + hp * 90;
    const interval = 60 / bpm;
    if (now - lastHeart > interval) {
      lastHeart = now;
      heartGain.gain.cancelScheduledValues(now);
      heartGain.gain.setValueAtTime(0.001, now);
      heartGain.gain.linearRampToValueAtTime(hp * 0.38, now + 0.03);
      heartGain.gain.linearRampToValueAtTime(0.02, now + 0.11);
      heartGain.gain.linearRampToValueAtTime(hp * 0.22, now + 0.17);
      heartGain.gain.linearRampToValueAtTime(0.001, now + 0.30);
    }
  } else {
    heartGain.gain.setTargetAtTime(0.001, now, 0.2);
  }
}

function resetAudio() {
  if (!AC) return;
  const now = AC.currentTime;
  droneGain.gain.setTargetAtTime(0.001, now, 0.3);
  pulseGain.gain.setTargetAtTime(0.001, now, 0.3);
  tensionGain.gain.setTargetAtTime(0.001, now, 0.3);
  noiseGain.gain.setTargetAtTime(0.001, now, 0.3);
  heartGain.gain.setTargetAtTime(0.001, now, 0.2);
}

// ================================
// REGEN
// ================================
const DROPS = Array.from({ length: 110 }, () => ({
  x:     Math.random(),
  y:     Math.random(),
  speed: 0.004 + Math.random() * 0.006,
  len:   0.018 + Math.random() * 0.038,
  alpha: 0.07  + Math.random() * 0.16,
}));

// ================================
// CANVAS RESIZE
// ================================
function resize() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resize);
resize();

// ================================
// DRAW
// ================================
let glitchTimer = 0;

function draw() {
  const W = canvas.width, H = canvas.height;
  const p = progress / CFG.max, p2 = p * p, p3 = p2 * p;
  time += 0.016;

  ctx.clearRect(0, 0, W, H);

  // Himmel
  const sT = Math.floor(p2 * 215), sB = Math.floor(7 + p2 * 238);
  const sG = ctx.createLinearGradient(0, 0, 0, H * .48);
  sG.addColorStop(0, `rgb(${sT},${sT},${sT})`);
  sG.addColorStop(1, `rgb(${sB},${sB},${sB})`);
  ctx.fillStyle = sG; ctx.fillRect(0, 0, W, H * .48);

  // Boden
  const gT = Math.floor(10 + p2 * 225), gB = Math.floor(4 + p2 * 70);
  const gG = ctx.createLinearGradient(0, H * .48, 0, H);
  gG.addColorStop(0, `rgb(${gT},${gT},${gT})`);
  gG.addColorStop(1, `rgb(${gB},${gB},${gB})`);
  ctx.fillStyle = gG; ctx.fillRect(0, H * .48, W, H * .52);

  const vpX = W / 2, vpY = H * .48;
  const rB = W * (.54 + p * .07), rT = W * (.013 + p * .015);

  // Asphalt
  const a1 = Math.floor(14 + p * 52), a2 = Math.floor(6 + p * 28);
  const aG = ctx.createLinearGradient(0, vpY, 0, H);
  aG.addColorStop(0, `rgb(${a1},${a1},${a1})`);
  aG.addColorStop(1, `rgb(${a2},${a2},${a2})`);
  ctx.beginPath();
  ctx.moveTo(vpX - rT, vpY); ctx.lineTo(vpX + rT, vpY);
  ctx.lineTo(vpX + rB, H);  ctx.lineTo(vpX - rB, H);
  ctx.closePath(); ctx.fillStyle = aG; ctx.fill();

  // Ränder
  ctx.strokeStyle = `rgba(255,255,255,${.5 + p * .25})`; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(vpX - rT, vpY); ctx.lineTo(vpX - rB, H); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(vpX + rT, vpY); ctx.lineTo(vpX + rB, H); ctx.stroke();

  // Mittelstreifen
  for (let i = 0; i < 22; i++) {
    const raw = ((i / 22) + dashOffset * .65) % 1;
    const t = raw, t2 = t * t;
    const yP = vpY + (H - vpY) * (1 - Math.pow(1 - t, 2.3));
    const hR = rT + (rB - rT) * t;
    const mw = Math.max(1.5, hR * .042), mh = Math.max(2, 30 * t2);
    if (Math.floor(raw * 22) % 2 === 0) continue;
    ctx.fillStyle = `rgba(255,255,255,${.1 + t * .52})`;
    ctx.fillRect(vpX - mw / 2, yP - mh / 2, mw, mh);
  }

  // Leitpfosten
  for (let i = 0; i < 9; i++) {
    const raw = ((i / 9) + dashOffset * .32) % 1;
    const t   = Math.pow(raw, 1.5);
    const yP  = vpY + (H - vpY) * (1 - Math.pow(1 - raw, 2.5));
    if (yP > H || yP < vpY) continue;
    const hR  = rT + (rB - rT) * raw;
    const pH  = Math.max(3, 32 * t), pW = Math.max(1, 3 * t), al = .07 + t * .4;
    ctx.fillStyle = `rgba(255,255,255,${al})`;
    ctx.fillRect(vpX - hR * 1.05 - pW, yP - pH, pW, pH);
    ctx.fillRect(vpX + hR * 1.05,      yP - pH, pW, pH);
    if (t > .3) {
      ctx.fillStyle = `rgba(255,255,255,${al * 1.9})`;
      ctx.fillRect(vpX - hR * 1.05 - pW + .5, yP - pH + 1, pW * .6, pW * .6);
      ctx.fillRect(vpX + hR * 1.05 + .5,      yP - pH + 1, pW * .6, pW * .6);
    }
  }

  // Lichtreflexion
  if (p > .08) {
    const refA = Math.min(.22, p * .26);
    const refW = rB * .14 + p * rB * .32;
    const refG = ctx.createLinearGradient(vpX, vpY, vpX, H);
    refG.addColorStop(0,  `rgba(255,255,255,${refA})`);
    refG.addColorStop(.6, `rgba(255,255,255,${refA * .22})`);
    refG.addColorStop(1,  'rgba(255,255,255,0)');
    ctx.beginPath();
    ctx.moveTo(vpX - rT * .5, vpY); ctx.lineTo(vpX + rT * .5, vpY);
    ctx.lineTo(vpX + refW, H);      ctx.lineTo(vpX - refW, H);
    ctx.closePath(); ctx.fillStyle = refG; ctx.fill();
  }

  // Licht
  const maxR  = Math.min(W, H) * .76;
  const lightR = 3 + p3 * maxR;
  for (let g = 8; g >= 1; g--) {
    ctx.beginPath();
    ctx.arc(vpX, vpY, lightR * (1 + g * (.55 + p * 2.4)), 0, Math.PI * 2);
    ctx.fillStyle = `rgba(200,220,255,${(0.012 + p * .06) / g})`;
    ctx.fill();
  }
  const cG = ctx.createRadialGradient(vpX, vpY, 0, vpX, vpY, lightR * 1.6);
  cG.addColorStop(0,   'rgba(255,255,255,1)');
  cG.addColorStop(.35, 'rgba(240,248,255,.95)');
  cG.addColorStop(1,   'rgba(200,225,255,0)');
  ctx.beginPath(); ctx.arc(vpX, vpY, lightR * 1.6, 0, Math.PI * 2);
  ctx.fillStyle = cG; ctx.fill();
  ctx.beginPath(); ctx.arc(vpX, vpY, lightR, 0, Math.PI * 2);
  ctx.fillStyle = '#fff'; ctx.fill();

  // Bloom
  if (p > .48) {
    const bp = Math.pow((p - .48) / .52, 1.5);
    const bG = ctx.createRadialGradient(vpX, vpY, lightR, vpX, vpY, Math.max(W, H) * 1.2);
    bG.addColorStop(0,   `rgba(255,255,255,${bp * .93})`);
    bG.addColorStop(.45, `rgba(255,255,255,${bp * .27})`);
    bG.addColorStop(1,   'rgba(255,255,255,0)');
    ctx.fillStyle = bG; ctx.fillRect(0, 0, W, H);
  }

  // Regen
  if (p < .85) {
    const intensity = Math.min(1, p * 3 + .12);
    for (const d of DROPS) {
      d.y += d.speed * intensity;
      if (d.y > 1) d.y = 0;
      ctx.globalAlpha = d.alpha * intensity;
      ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = .5;
      ctx.beginPath();
      ctx.moveTo(d.x * W, d.y * H);
      ctx.lineTo(d.x * W - d.len * W * .16, d.y * H + d.len * H * .52);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  // Glitch
  glitchTimer--;
  if (glitchTimer > 0 && p > .12 && p < .9) {
    for (let s = 0; s < 2 + Math.floor(Math.random() * 3); s++) {
      const sy = Math.random() * H, sh = Math.random() * H * .045 + 2;
      const dx = (Math.random() - .5) * W * .07;
      try { const id = ctx.getImageData(0, sy, W, sh); ctx.putImageData(id, dx, sy); } catch(e) {}
    }
    ctx.fillStyle = `rgba(255,255,255,${.03 + Math.random() * .07})`;
    ctx.fillRect(0, Math.random() * H, W, 1);
  }
  if (glitchTimer <= 0) {
    glitchTimer = -(Math.max(6, 55 - Math.floor(p * 40)) + Math.floor(Math.random() * 38));
  }
  if (glitchTimer < 0) glitchTimer++;
}

// ================================
// NACHRICHTEN
// ================================
function showMessage(text) {
  if (msgTO)  clearTimeout(msgTO);
  if (msgRaf) cancelAnimationFrame(msgRaf);
  const dark = (progress / CFG.max) < .44;
  const base = dark ? 'rgba(255,255,255,' : 'rgba(0,0,0,';
  msgEl.innerHTML = text.replace(/\n/g, '<br>');
  let a = 0;
  const fi = () => {
    a = Math.min(1, a + .033);
    msgEl.style.color = `${base}${a.toFixed(3)})`;
    if (a < 1) { msgRaf = requestAnimationFrame(fi); return; }
    msgTO = setTimeout(() => {
      const fo = () => {
        a = Math.max(0, a - .02);
        msgEl.style.color = `${base}${a.toFixed(3)})`;
        if (a > 0) msgRaf = requestAnimationFrame(fo);
        else msgEl.innerHTML = '';
      };
      msgRaf = requestAnimationFrame(fo);
    }, 2800);
  };
  msgRaf = requestAnimationFrame(fi);
}

function checkMsg() {
  for (const m of MESSAGES) {
    if (!shownMessages.has(m.at) && progress >= m.at) {
      shownMessages.add(m.at);
      showMessage(m.text);
      break;
    }
  }
}

// ================================
// LOOP
// ================================
function loop() {
  draw();
  if (started) updateAudio();
  requestAnimationFrame(loop);
}

// ================================
// SCHRITT
// ================================
function step() {
  progress   += CFG.step;
  dashOffset  = (dashOffset + .02) % 1;
  if (progress >= CFG.max) {
    progress = 0; dashOffset = 0;
    shownMessages.clear();
    if (msgTO)  clearTimeout(msgTO);
    if (msgRaf) cancelAnimationFrame(msgRaf);
    msgEl.innerHTML = '';
    msgEl.style.color = 'rgba(255,255,255,0)';
    resetAudio();
  }
  checkMsg();
}

// ================================
// START
// ================================
function start() {
  if (started) return;
  started = true;
  initAudio();
  startEl.classList.add('hidden');
}

startEl.addEventListener('click', start);

// ================================
// EVENTS
// ================================
window.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (!started) { start(); return; }
  step();
}, { passive: false });

window.addEventListener('click', () => {
  if (!started) { start(); return; }
  step();
});

window.addEventListener('touchstart', (e) => {
  lastTouchY = e.touches[0].clientY;
}, { passive: true });

window.addEventListener('touchend', (e) => {
  if (lastTouchY === null) return;
  if (!started) { start(); return; }
  if (Math.abs(lastTouchY - e.changedTouches[0].clientY) > 8) step();
  lastTouchY = null;
}, { passive: true });

window.addEventListener('keydown', (e) => {
  if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowRight'].includes(e.key)) {
    e.preventDefault();
    if (!started) { start(); return; }
    step();
  }
});

loop();