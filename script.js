/* ============================================================
   INFINITE LIGHT WORLDS — script.js  v4
   5 Welten · Sound (Web Audio API) · Starfield · Cinematische Übergänge
   Direktere Maussteuerung · Licht füllt fast den Bildschirm
   ============================================================ */

   'use strict';

   // ============================================================
   //  ZUSTAND
   // ============================================================
   const state = {
     world: 0,
     progress: 0,
     targetProgress: 0,
     time: 0,
   
     // Maus (normalisiert 0–1)
     mouseX: 0.5,
     mouseY: 0.4,
     targetMouseX: 0.5,
     targetMouseY: 0.4,
   
     // Licht-Position in Pixeln
     lightX: 0,
     lightY: 0,
   
     // Für Float/Nachzieh-Effekt des Lichts
     lightVX: 0,
     lightVY: 0,
   
     interacted: false,
     transitioning: false,
     lastTimestamp: 0,
   
     // Sound
     audioUnlocked: false,
   };
   
   const NUM_WORLDS = 5;
   
   // ============================================================
   //  DOM
   // ============================================================
   const app          = document.getElementById('app');
   const pCanvas      = document.getElementById('particle-canvas');
   const pCtx         = pCanvas.getContext('2d');
   const tCanvas      = document.getElementById('trail-canvas');
   const tCtx         = tCanvas.getContext('2d');
   const lightInner   = document.getElementById('light-inner');
   const lightGlow    = document.getElementById('light-glow');
   const lightHalo    = document.getElementById('light-halo');
   const lightCore    = document.getElementById('light-core');
   const flashOverlay = document.getElementById('flash-overlay');
   const hint         = document.getElementById('hint');
   const cursor       = document.getElementById('cursor');
   
   function resizeCanvases() {
     pCanvas.width = tCanvas.width = window.innerWidth;
     pCanvas.height = tCanvas.height = window.innerHeight;
   }
   resizeCanvases();
   window.addEventListener('resize', resizeCanvases);
   
   const cw = () => pCanvas.width;
   const ch = () => pCanvas.height;
   
   // ============================================================
   //  WEB AUDIO ENGINE
   //  Erzeugt Ambient-Sounds rein synthetisch — kein externes Asset
   // ============================================================
   let audioCtx = null;
   
   /**
    * Konfiguration für jeden Welt-Sound.
    * Alle Parameter werden live interpoliert.
    */
   const SOUND_CONFIGS = [
     // 0 — VOID SPACE: tiefer Drone, dunkel, minimal
     {
       droneFreqs:   [28, 42, 56],
       droneGains:   [0.18, 0.10, 0.06],
       shimmerFreq:  320,
       shimmerGain:  0.0,
       noiseGain:    0.025,
       reverbTime:   4.5,
       filterFreq:   180,
       filterQ:      1.2,
     },
     // 1 — COSMIC STREAM: futuristisch, schimmernd, energetisch
     {
       droneFreqs:   [55, 110, 220],
       droneGains:   [0.10, 0.09, 0.07],
       shimmerFreq:  880,
       shimmerGain:  0.04,
       noiseGain:    0.018,
       reverbTime:   3.0,
       filterFreq:   1200,
       filterQ:      3.5,
     },
     // 2 — LIQUID LIGHT: organisch, weich, tiefe Flächen
     {
       droneFreqs:   [36, 54, 72],
       droneGains:   [0.14, 0.09, 0.05],
       shimmerFreq:  540,
       shimmerGain:  0.025,
       noiseGain:    0.015,
       reverbTime:   5.0,
       filterFreq:   500,
       filterQ:      1.0,
     },
     // 3 — BLOOM SPACE: warm, episch, goldenes Glühen
     {
       droneFreqs:   [48, 96, 144],
       droneGains:   [0.16, 0.10, 0.06],
       shimmerFreq:  720,
       shimmerGain:  0.035,
       noiseGain:    0.012,
       reverbTime:   4.0,
       filterFreq:   800,
       filterQ:      2.0,
     },
     // 4 — STARFIELD: tiefer Weltraum-Ambient, schwebend, leichtes Strahlen
     {
       droneFreqs:   [18, 27, 36, 54],   // sehr tief — kosmisches Grollen
       droneGains:   [0.22, 0.14, 0.08, 0.04],
       shimmerFreq:  1640,               // hohes Strahlen-Leuchten
       shimmerGain:  0.028,              // etwas hörbarer als andere Welten
       noiseGain:    0.035,              // mehr Raumrauschen
       reverbTime:   7.5,                // sehr langer Hall — unendlicher Raum
       filterFreq:   200,
       filterQ:      0.6,
     },
   ];
   
   // Aktive Audio-Nodes
   const audio = {
     masterGain: null,
     drones: [],          // OscillatorNode[]
     droneGains: [],      // GainNode[]
     shimmer: null,       // OscillatorNode
     shimmerGain: null,   // GainNode
     noiseSource: null,   // AudioBufferSourceNode
     noiseGain: null,     // GainNode
     filter: null,        // BiquadFilterNode
     reverb: null,        // ConvolverNode
     reverbGain: null,    // GainNode
     dryGain: null,       // GainNode
   };
   
   /** Erstellt einen einfachen Faltungs-Hall aus synthetischem Impuls */
   function createReverb(ctx, time) {
     const rate     = ctx.sampleRate;
     const length   = Math.floor(rate * time);
     const impulse  = ctx.createBuffer(2, length, rate);
     for (let ch = 0; ch < 2; ch++) {
       const data = impulse.getChannelData(ch);
       for (let i = 0; i < length; i++) {
         data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.5);
       }
     }
     const conv = ctx.createConvolver();
     conv.buffer = impulse;
     return conv;
   }
   
   /** Erzeugt weißes Rauschen als AudioBuffer */
   function createNoiseBuffer(ctx, seconds = 2) {
     const buf  = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
     const data = buf.getChannelData(0);
     for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
     return buf;
   }
   
   /** Baut alle Audio-Nodes für die aktuelle Welt auf */
   function buildAudioGraph(worldIdx) {
     if (!audioCtx) return;
     const cfg = SOUND_CONFIGS[worldIdx];
     const ctx = audioCtx;
   
     // Alle alten Nodes stoppen
     destroyAudioGraph();
   
     // Master-Gain (Gesamtlautstärke)
     audio.masterGain = ctx.createGain();
     audio.masterGain.gain.setValueAtTime(0, ctx.currentTime);
     audio.masterGain.gain.linearRampToValueAtTime(0.55, ctx.currentTime + 1.5);
     audio.masterGain.connect(ctx.destination);
   
     // Hall
     audio.reverb      = createReverb(ctx, cfg.reverbTime);
     audio.reverbGain  = ctx.createGain();
     audio.reverbGain.gain.value = 0.35;
     audio.dryGain     = ctx.createGain();
     audio.dryGain.gain.value = 0.65;
   
     // Filter (Tiefpass/Bandpass)
     audio.filter = ctx.createBiquadFilter();
     audio.filter.type      = 'lowpass';
     audio.filter.frequency.value = cfg.filterFreq;
     audio.filter.Q.value   = cfg.filterQ;
   
     // Routing: filter → dry + reverb → master
     audio.filter.connect(audio.dryGain);
     audio.filter.connect(audio.reverb);
     audio.reverb.connect(audio.reverbGain);
     audio.dryGain.connect(audio.masterGain);
     audio.reverbGain.connect(audio.masterGain);
   
     // Drones (mehrere Oszillatoren)
     audio.drones      = [];
     audio.droneGains  = [];
     cfg.droneFreqs.forEach((freq, i) => {
       const osc  = ctx.createOscillator();
       const gain = ctx.createGain();
       osc.type            = i % 2 === 0 ? 'sine' : 'triangle';
       osc.frequency.value = freq;
       // Leichtes Verstimmen für organischen Klang
       osc.detune.value    = (Math.random() - 0.5) * 8;
       gain.gain.value     = cfg.droneGains[i];
       osc.connect(gain);
       gain.connect(audio.filter);
       osc.start();
       audio.drones.push(osc);
       audio.droneGains.push(gain);
     });
   
     // Shimmer (hoher Sinus, fast unhörbar bis auf Welt 1+3)
     audio.shimmer      = ctx.createOscillator();
     audio.shimmerGain  = ctx.createGain();
     audio.shimmer.type            = 'sine';
     audio.shimmer.frequency.value = cfg.shimmerFreq;
     audio.shimmerGain.gain.value  = cfg.shimmerGain;
     audio.shimmer.connect(audio.shimmerGain);
     audio.shimmerGain.connect(audio.filter);
     audio.shimmer.start();
   
     // Rauschen (Textur, tief gefiltert)
     const noiseBuf      = createNoiseBuffer(ctx, 3);
     audio.noiseSource   = ctx.createBufferSource();
     audio.noiseSource.buffer = noiseBuf;
     audio.noiseSource.loop   = true;
     audio.noiseGain          = ctx.createGain();
     audio.noiseGain.gain.value = cfg.noiseGain;
     audio.noiseSource.connect(audio.noiseGain);
     audio.noiseGain.connect(audio.filter);
     audio.noiseSource.start();
   
     // Starfield extra: langsam modulierter Shimmer (LFO → klingt wie Sternstrahlen)
     if (worldIdx === 4) {
       const lfo      = ctx.createOscillator();
       const lfoGain  = ctx.createGain();
       lfo.type            = 'sine';
       lfo.frequency.value = 0.18;      // sehr langsam — 1 Zyklus alle ~5.5 Sek
       lfoGain.gain.value  = cfg.shimmerFreq * 0.12; // ±12% Frequenz-Modulation
       lfo.connect(lfoGain);
       lfoGain.connect(audio.shimmer.frequency);
       lfo.start();
       // LFO mitlaufen lassen bis destroyAudioGraph
       audio._starLFO = lfo;
     }
   }
   
   function destroyAudioGraph() {
     try {
       audio.drones?.forEach(o => { try { o.stop(); } catch(e){} });
       audio.shimmer     && audio.shimmer.stop();
       audio.noiseSource && audio.noiseSource.stop();
       audio._starLFO    && audio._starLFO.stop();
     } catch(e) {}
     audio.drones      = [];
     audio.droneGains  = [];
     audio.shimmer     = audio.shimmerGain = null;
     audio.noiseSource = audio.noiseGain   = null;
     audio.masterGain  = audio.filter      = audio.reverb = null;
     audio.reverbGain  = audio.dryGain     = null;
     audio._starLFO    = null;
   }
   
   /**
    * Aktualisiert Lautstärke/Filter dynamisch je nach Progress.
    * Wird jeden Frame aufgerufen.
    */
   function updateAudio(dt) {
     if (!audioCtx || !audio.masterGain) return;
     const p    = state.progress / 100;
     const cfg  = SOUND_CONFIGS[state.world];
     const now  = audioCtx.currentTime;
   
     // Lautstärke steigt mit Progress (0.45 → 0.85)
     const targetVol = 0.45 + p * 0.40;
     audio.masterGain.gain.linearRampToValueAtTime(targetVol, now + 0.2);
   
     // Filter öffnet sich mit Progress (Spannung steigt)
     const targetFreq = cfg.filterFreq * (1 + p * 3.5);
     audio.filter.frequency.linearRampToValueAtTime(targetFreq, now + 0.3);
   
     // Shimmer wird lauter bei hohem Progress
     if (audio.shimmerGain) {
       const shimTarget = cfg.shimmerGain * (0.3 + p * 2.5);
       audio.shimmerGain.gain.linearRampToValueAtTime(shimTarget, now + 0.3);
     }
   
     // Hall-Anteil steigt mit Progress (mehr Raum, mehr Weite)
     if (audio.reverbGain) {
       const revTarget = 0.2 + p * 0.55;
       audio.reverbGain.gain.linearRampToValueAtTime(revTarget, now + 0.4);
     }
   }
   
   /**
    * Übergangs-Klang: sanfter atmosphärischer Swell.
    * Kein Alarm — stattdessen tiefer Drone-Swell + hauchzartes Rauschen
    * das aufsteigt und sich langsam auflöst wie Licht durch Nebel.
    */
   function playTransitionSound() {
    if (!audioCtx) return;
  
    const ctx = audioCtx;
    const now = ctx.currentTime;
  
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, now);
    out.gain.linearRampToValueAtTime(0.35, now + 0.5);
    out.gain.exponentialRampToValueAtTime(0.001, now + 3.0);
    out.connect(ctx.destination);
  
    const deep = ctx.createOscillator();
    const deepGain = ctx.createGain();
  
    deep.type = "sine";
    deep.frequency.setValueAtTime(48, now);
    deep.frequency.linearRampToValueAtTime(72, now + 1.4);
  
    deepGain.gain.setValueAtTime(0, now);
    deepGain.gain.linearRampToValueAtTime(0.22, now + 0.7);
    deepGain.gain.exponentialRampToValueAtTime(0.001, now + 3.0);
  
    deep.connect(deepGain);
    deepGain.connect(out);
  
    deep.start(now);
    deep.stop(now + 3.2);
  
    const light = ctx.createOscillator();
    const lightGain = ctx.createGain();
  
    light.type = "sine";
    light.frequency.setValueAtTime(520, now);
    light.frequency.linearRampToValueAtTime(780, now + 1.6);
  
    lightGain.gain.setValueAtTime(0, now);
    lightGain.gain.linearRampToValueAtTime(0.045, now + 0.9);
    lightGain.gain.exponentialRampToValueAtTime(0.001, now + 2.7);
  
    light.connect(lightGain);
    lightGain.connect(out);
  
    light.start(now);
    light.stop(now + 3.0);
  }
   
   /** Audio Context initialisieren (erst nach User-Interaktion) */
   function unlockAudio() {
     if (state.audioUnlocked) return;
     state.audioUnlocked = true;
     audioCtx = new (window.AudioContext || window.webkitAudioContext)();
     if (audioCtx.state === 'suspended') audioCtx.resume();
     buildAudioGraph(state.world);
   }
   
   // ============================================================
   //  WELT-DEFINITIONEN
   // ============================================================
   const WORLDS = [
   
     // ── 0 · VOID SPACE ────────────────────────────────────────
     {
       name: 'VOID SPACE',
       baseSpawn: 0.5,
       maxSpawn: 3.5,
       trailColor: 'rgba(0,0,0,1)',   // vollständig löschen → kein Artefakt
       warpLines: false,
       // [innerMin, innerMax, glowMin, glowMax, haloMin, haloMax]
       // Halo-Max: ~200% Bildschirmbreite → füllt den Screen
       lightSizes: [2, 180, 80, 1200, 200,3400],
   
       particleFactory(lx, ly) {
         const angle = Math.random() * Math.PI * 2;
         const dist  = 80 + Math.random() * cw() * 0.6;
         return {
           x: lx + Math.cos(angle) * dist,
           y: ly + Math.sin(angle) * dist,
           vx: (Math.random() - 0.5) * 0.1,
           vy: -0.05 - Math.random() * 0.14,
           size: 0.5 + Math.random() * 1.3,
           color: [255, 255, 255],
           alpha: 0.1 + Math.random() * 0.3,
           maxLife: 6 + Math.random() * 8,
           attracted: true,
           attractStr: 0.0003 + Math.random() * 0.0004,
           trail: false,
           type: 'dot',
         };
       },
     },
   
     // ── 1 · COSMIC STREAM ─────────────────────────────────────
     {
       name: 'COSMIC STREAM',
       baseSpawn: 6,
       maxSpawn: 70,
       trailColor: 'rgba(0,0,8,0.07)',
       warpLines: true,
       lightSizes: [3, 220, 120, 1400, 300, 3600],
   
       particleFactory(lx, ly, prog) {
         const angle  = Math.random() * Math.PI * 2;
         const startR = 4 + Math.random() * 22;
         const speed  = 1.0 + Math.random() * 4.0 + prog * 5;
         const rnd    = Math.random();
         const color  = rnd < 0.5  ? [255,255,255]
                      : rnd < 0.78 ? [180,150,255]
                                    : [100,160,255];
         return {
           x: lx + Math.cos(angle) * startR,
           y: ly + Math.sin(angle) * startR,
           vx: Math.cos(angle) * speed,
           vy: Math.sin(angle) * speed,
           size: 0.5 + Math.random() * 1.8,
           color,
           alpha: 0.4 + Math.random() * 0.6,
           maxLife: 0.5 + Math.random() * 1.1,
           attracted: false,
           trail: true,
           trailAlpha: 0.22 + Math.random() * 0.38,
           type: 'star',
         };
       },
     },
   
     // ── 2 · LIQUID LIGHT ──────────────────────────────────────
     {
       name: 'LIQUID LIGHT',
       baseSpawn: 2.5,
       maxSpawn: 20,
       trailColor: 'rgba(0,5,8,0.12)',
       warpLines: false,
       lightSizes: [4, 58, 80, 720, 220, 1850],
   
       particleFactory(lx, ly) {
         const angle = Math.random() * Math.PI * 2;
         const dist  = 40 + Math.random() * cw() * 0.48;
         const speed = 0.04 + Math.random() * 0.2;
         const rnd   = Math.random();
         const color = rnd < 0.4  ? [0,180,165]
                     : rnd < 0.72 ? [50,210,195]
                     : rnd < 0.88 ? [0,125,165]
                                   : [200,255,250];
         return {
           x: lx + Math.cos(angle) * dist,
           y: ly + Math.sin(angle) * dist,
           vx: (Math.random() - 0.5) * speed,
           vy: -speed * 0.5 - Math.random() * speed,
           size: 3 + Math.random() * 16,
           color,
           alpha: 0.04 + Math.random() * 0.12,
           maxLife: 5 + Math.random() * 9,
           attracted: true,
           attractStr: 0.0004 + Math.random() * 0.0008,
           trail: false,
           waveAmp: 0.12 + Math.random() * 0.35,
           waveFreq: 0.4 + Math.random() * 1.4,
           wavePhase: Math.random() * Math.PI * 2,
           type: 'blob',
         };
       },
     },
   
     // ── 3 · BLOOM SPACE ───────────────────────────────────────
     {
       name: 'BLOOM SPACE',
       baseSpawn: 2,
       maxSpawn: 30,
       trailColor: 'rgba(4,1,0,0.1)',
       warpLines: false,
       lightSizes: [4, 62, 85, 750, 240, 2000],
   
       particleFactory(lx, ly) {
         const isPetal = Math.random() < 0.35;
         const angle   = Math.random() * Math.PI * 2;
         const dist    = isPetal ? 20 + Math.random() * cw() * 0.35
                                 : 60 + Math.random() * cw() * 0.55;
         const speed   = isPetal ? 0.08 + Math.random() * 0.22
                                 : 0.03 + Math.random() * 0.14;
         const rnd     = Math.random();
         const color   = rnd < 0.28 ? [255,190,50]
                       : rnd < 0.52 ? [255,130,30]
                       : rnd < 0.70 ? [255,160,80]
                       : rnd < 0.85 ? [255,210,140]
                       : rnd < 0.94 ? [255,100,80]
                                    : [255,245,220];
         return {
           x: lx + Math.cos(angle) * dist,
           y: ly + Math.sin(angle) * dist,
           vx: (Math.random() - 0.5) * speed,
           vy: -speed * 0.6 - Math.random() * speed * 0.8,
           size: isPetal ? 5 + Math.random() * 22 : 1 + Math.random() * 4,
           color,
           alpha: isPetal ? 0.04 + Math.random() * 0.1 : 0.15 + Math.random() * 0.55,
           maxLife: isPetal ? 6 + Math.random() * 10 : 2 + Math.random() * 5,
           attracted: true,
           attractStr: 0.0003 + Math.random() * 0.0007,
           trail: false,
           rotation: Math.random() * Math.PI * 2,
           rotSpeed: (Math.random() - 0.5) * 0.015,
           waveAmp: 0.08 + Math.random() * 0.25,
           waveFreq: 0.3 + Math.random() * 1.0,
           wavePhase: Math.random() * Math.PI * 2,
           type: isPetal ? 'petal' : 'ember',
         };
       },
     },
   
     // ── 4 · STARFIELD ─────────────────────────────────────────
     {
       name: 'STARFIELD',
       baseSpawn: 1.5,
       maxSpawn: 12,
       trailColor: 'rgba(0,0,5,0.04)',   // sehr langsames Ausblenden → lange Trails
       warpLines: false,
       lightSizes: [3, 50, 60, 650, 140, 1700],
   
       particleFactory(lx, ly, prog) {
         // Sterne verteilen sich über den ganzen Bildschirm
         // manche nah am Licht, manche weit weg (Tiefeneffekt)
         const depth     = Math.random();          // 0=nah/groß, 1=weit/klein
         const angle     = Math.random() * Math.PI * 2;
         const dist      = 50 + Math.random() * Math.max(cw(), ch()) * 0.7;
   
         // Parallax: nah = schneller, weit = langsamer
         const speed     = (1.0 - depth) * (0.03 + prog * 0.08) + 0.005;
   
         const rnd       = Math.random();
         const color     = rnd < 0.55 ? [255,255,255]       // weiß
                         : rnd < 0.78 ? [200,220,255]        // blasses Blau
                         : rnd < 0.90 ? [180,200,240]        // silbriges Blau
                                      : [240,248,255];        // fast weiß
   
         // Manche Sterne bekommen Trails (die nahen)
         const hasTrail  = depth < 0.3 && Math.random() < 0.4;
   
         return {
           x: Math.random() * cw(),   // über ganzen Screen verteilt
           y: Math.random() * ch(),
           // Sehr langsame Eigenbewegung
           vx: (Math.random() - 0.5) * speed * 0.3,
           vy: -speed * 0.15,
           size: (1.0 - depth * 0.7) * (0.5 + Math.random() * 2.5),
           color,
           alpha: 0.3 + (1 - depth) * 0.5 + Math.random() * 0.2,
           maxLife: 8 + Math.random() * 12,
           attracted: depth < 0.5,    // nur nahe Sterne werden angezogen
           attractStr: (1 - depth) * 0.0002,
           trail: hasTrail,
           trailAlpha: 0.08 + Math.random() * 0.12,
           depth,
           type: 'starpoint',
         };
       },
     },
   ];
   
   // ============================================================
   //  PARTIKEL-POOL
   // ============================================================
   const particles = [];
   
   function spawnParticle(impulse = false) {
     const w    = WORLDS[state.world];
     const prog = state.progress / 100;
     const p    = w.particleFactory(state.lightX, state.lightY, prog);
   
     p.life    = p.maxLife;
     p.twinkle = Math.random() * Math.PI * 2;
     p.tSpeed  = 0.01 + Math.random() * 0.03;
   
     if (impulse) {
       p.vx *= 4; p.vy *= 4;
       p.alpha = Math.min(1, p.alpha * 2);
       p.size  = Math.min(p.size * 1.6, 30);
     }
     particles.push(p);
   }
   
   // Starfield füllt den Screen initial mit Sternen
   function initStarfield() {
     for (let i = 0; i < 280; i++) spawnParticle();
   }
   
   function spawnParticlesForWorld(dt) {
     const w    = WORLDS[state.world];
     const prog = state.progress / 100;
     const rate = w.baseSpawn + (w.maxSpawn - w.baseSpawn) * prog;
     const n    = rate * dt;
     const full = Math.floor(n);
     for (let i = 0; i < full; i++) spawnParticle();
     if (Math.random() < n - full) spawnParticle();
   }
   
   function spawnScrollImpulse(mag) {
     const n = Math.min(Math.floor(mag * 22), 35);
     for (let i = 0; i < n; i++) spawnParticle(true);
   }
   
   // ============================================================
   //  TRAIL-CANVAS
   // ============================================================
   function updateTrail() {
     if (state.world === 0) {
       tCtx.clearRect(0, 0, cw(), ch());
       return;
     }
     tCtx.fillStyle = WORLDS[state.world].trailColor;
     tCtx.fillRect(0, 0, cw(), ch());
   }
   
   // ============================================================
   //  PARTIKEL RENDERN & PHYSIK
   // ============================================================
   function drawStarPoint(p, a) {
     const [r, g, b] = p.color;
     // Sternförmig: kurze Strahlen in 4 Richtungen
     pCtx.save();
     pCtx.translate(p.x, p.y);
     const rays = p.size > 1.8 ? 4 : 2;
     const len  = p.size * (p.size > 1.5 ? 2.5 : 1.5);
     pCtx.strokeStyle = `rgba(${r},${g},${b},${a * 0.7})`;
     pCtx.lineWidth   = p.size * 0.4;
     for (let i = 0; i < rays; i++) {
       const ang = (i / rays) * Math.PI;
       pCtx.beginPath();
       pCtx.moveTo(Math.cos(ang) * -len, Math.sin(ang) * -len);
       pCtx.lineTo(Math.cos(ang) * len,  Math.sin(ang) * len);
       pCtx.stroke();
     }
     // Kern
     pCtx.beginPath();
     pCtx.arc(0, 0, p.size * 0.6, 0, Math.PI * 2);
     pCtx.fillStyle = `rgba(${r},${g},${b},${a})`;
     pCtx.fill();
     pCtx.restore();
   
     // Glow für helle Sterne
     if (p.size > 1.2) {
       const g2 = pCtx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 6);
       g2.addColorStop(0, `rgba(${r},${g},${b},${a * 0.25})`);
       g2.addColorStop(1, `rgba(${r},${g},${b},0)`);
       pCtx.beginPath();
       pCtx.arc(p.x, p.y, p.size * 6, 0, Math.PI * 2);
       pCtx.fillStyle = g2;
       pCtx.fill();
     }
   }
   
   function updateAndDrawParticles(dt) {
     pCtx.clearRect(0, 0, cw(), ch());
     const lx   = state.lightX;
     const ly   = state.lightY;
     const wIdx = state.world;
   
     for (let i = particles.length - 1; i >= 0; i--) {
       const p = particles[i];
   
       // ── Physik ───────────────────────────────────────────
       if (p.attracted) {
         const dx  = lx - p.x;
         const dy  = ly - p.y;
         const d2  = dx * dx + dy * dy;
         const str = p.attractStr * (state.progress / 100 + 0.2);
         if (d2 > 4) { p.vx += dx * str; p.vy += dy * str; }
       }
       if (p.waveAmp !== undefined) {
         p.vx += Math.sin(state.time * p.waveFreq + p.wavePhase) * p.waveAmp * dt;
       }
       if (p.rotation !== undefined) p.rotation += p.rotSpeed;
   
       p.vx *= 0.985; p.vy *= 0.985;
       p.x  += p.vx;  p.y  += p.vy;
       p.life -= dt;
       p.twinkle += p.tSpeed;
   
       if (p.life <= 0) { particles.splice(i, 1); continue; }
   
       const lifeRatio = Math.max(0, p.life / p.maxLife);
       const fadeIn    = Math.min(1, (p.maxLife - p.life) / 0.35);
       const twinkle   = 0.72 + 0.28 * Math.sin(p.twinkle);
       const a         = p.alpha * lifeRatio * fadeIn * twinkle;
       const [r, g, b] = p.color;
   
       // ── Trail auf Trail-Canvas ────────────────────────────
       if (p.trail) {
         tCtx.beginPath();
         tCtx.moveTo(p.x - p.vx * 4, p.y - p.vy * 4);
         tCtx.lineTo(p.x, p.y);
         tCtx.strokeStyle = `rgba(${r},${g},${b},${(p.trailAlpha||0.3)*lifeRatio})`;
         tCtx.lineWidth   = p.size * 0.65;
         tCtx.lineCap     = 'round';
         tCtx.stroke();
       }
   
       // ── Render je Typ ─────────────────────────────────────
       if (p.type === 'starpoint') {
         drawStarPoint(p, a);
   
       } else if (p.type === 'blob' || p.type === 'petal') {
         const grad = pCtx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
         grad.addColorStop(0,   `rgba(${r},${g},${b},${a})`);
         grad.addColorStop(0.5, `rgba(${r},${g},${b},${a * 0.45})`);
         grad.addColorStop(1,   `rgba(${r},${g},${b},0)`);
         pCtx.save();
         if (p.rotation !== undefined) {
           pCtx.translate(p.x, p.y);
           pCtx.rotate(p.rotation);
           pCtx.scale(1.6, 1);
           pCtx.translate(-p.x, -p.y);
         }
         pCtx.beginPath();
         pCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
         pCtx.fillStyle = grad;
         pCtx.fill();
         pCtx.restore();
   
       } else if (p.type === 'ember') {
         pCtx.beginPath();
         pCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
         pCtx.fillStyle = `rgba(${r},${g},${b},${a})`;
         pCtx.fill();
         if (p.size > 1.5) {
           const g2 = pCtx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 5);
           g2.addColorStop(0, `rgba(${r},${g},${b},${a * 0.4})`);
           g2.addColorStop(1, `rgba(${r},${g},${b},0)`);
           pCtx.beginPath();
           pCtx.arc(p.x, p.y, p.size * 5, 0, Math.PI * 2);
           pCtx.fillStyle = g2;
           pCtx.fill();
         }
   
       } else if (p.type === 'star') {
         pCtx.beginPath();
         pCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
         pCtx.fillStyle = `rgba(${r},${g},${b},${a})`;
         pCtx.fill();
         if (p.size > 0.9) {
           const g2 = pCtx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 5);
           g2.addColorStop(0, `rgba(${r},${g},${b},${a * 0.32})`);
           g2.addColorStop(1, `rgba(${r},${g},${b},0)`);
           pCtx.beginPath();
           pCtx.arc(p.x, p.y, p.size * 5, 0, Math.PI * 2);
           pCtx.fillStyle = g2;
           pCtx.fill();
         }
   
       } else {
         // dot (Void)
         pCtx.beginPath();
         pCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
         pCtx.fillStyle = `rgba(${r},${g},${b},${a})`;
         pCtx.fill();
       }
     }
   }
   
   // ============================================================
   //  WARP-LINIEN (Cosmic Stream)
   // ============================================================
   function drawWarpLines() {
     if (state.world !== 1) return;
     const prog  = state.progress / 100;
     const lx    = state.lightX;
     const ly    = state.lightY;
     const count = Math.floor(6 + prog * 38);
     const len   = 18 + prog * 200;
   
     tCtx.save();
     for (let i = 0; i < count; i++) {
       const angle  = (i / count) * Math.PI * 2 + state.time * 0.14;
       const startR = 14 + Math.random() * 28;
       const endR   = startR + len * (0.35 + Math.random() * 0.65);
       const alpha  = (0.035 + prog * 0.12) * (0.4 + Math.random() * 0.6);
       const rnd    = Math.random();
       const col    = rnd < 0.5 ? `rgba(255,255,255,${alpha})`
                    : rnd < 0.8 ? `rgba(180,150,255,${alpha})`
                                 : `rgba(100,160,255,${alpha})`;
       tCtx.beginPath();
       tCtx.moveTo(lx + Math.cos(angle) * startR, ly + Math.sin(angle) * startR);
       tCtx.lineTo(lx + Math.cos(angle) * endR,   ly + Math.sin(angle) * endR);
       tCtx.strokeStyle = col;
       tCtx.lineWidth   = 0.5 + Math.random() * 0.8;
       tCtx.stroke();
     }
     tCtx.restore();
   }
   
   // ============================================================
   //  LICHT — GRÖßE
   //  Bei progress=100 erreicht Halo >150% Bildschirmdiagonale
   // ============================================================
   function updateLightSize() {
     const p  = state.progress / 100;
     const sz = WORLDS[state.world].lightSizes;
   
     // Quadratische Kurve → langsames Wachsen am Anfang, explosiv am Ende
     const eased = p * p;
   
     const inner = sz[0] + (sz[1] - sz[0]) * p;
     const glow  = sz[2] + (sz[3] - sz[2]) * eased;
     const halo  = sz[4] + (sz[5] - sz[4]) * eased;
   
     lightInner.style.width  = lightInner.style.height = `${inner}px`;
     lightGlow.style.width   = lightGlow.style.height  = `${glow}px`;
     lightHalo.style.width   = lightHalo.style.height  = `${halo}px`;
   
     // Opacity: Halo wird bei hohem Progress fast undurchsichtig → Screen-Fill-Effekt
     const glowOp = 0.24 + p * 0.76;
     const haloOp = 0.12 + eased * 0.88;
     lightGlow.style.opacity = glowOp;
     lightHalo.style.opacity = haloOp;
     lightGlow.style.setProperty('--glow-op', glowOp);
     lightHalo.style.setProperty('--halo-op', haloOp);
   }
   
   // ============================================================
   //  LICHT — POSITION
   //  Direktere Maussteuerung: Licht folgt fast dem ganzen Screen
   //  Float/Nachzieh via Federsimulation
   // ============================================================
   function updateLightPosition(dt) {
     // Maus sehr direkt annähern (0.085 statt 0.04)
     state.mouseX += (state.targetMouseX - state.mouseX) * 0.085;
     state.mouseY += (state.targetMouseY - state.mouseY) * 0.085;
   
     // Ziel-Position: Maus kann Licht fast über ganzen Bildschirm bewegen
     // Margin: ~8% vom Rand
     const margin  = 0.08;
     const targetX = margin * cw() + state.mouseX * cw() * (1 - 2 * margin);
     const targetY = margin * ch() + state.mouseY * ch() * (1 - 2 * margin);
   
     // Subtile Eigenbewegung (Licht lebt)
     const driftX  = Math.sin(state.time * 0.38) * 9  + Math.cos(state.time * 0.25) * 4;
     const driftY  = Math.cos(state.time * 0.32) * 7  + Math.sin(state.time * 0.18) * 3;
   
     const finalTargetX = targetX + driftX;
     const finalTargetY = targetY + driftY;
   
     // Federsimulation: weiches Nachziehen mit Trägheit
     const stiffness = 4.5;   // Federstärke
     const damping   = 0.72;  // Dämpfung (0=kein Dämpfer, 1=kein Überschwingen)
   
     const ax = (finalTargetX - state.lightX) * stiffness;
     const ay = (finalTargetY - state.lightY) * stiffness;
   
     state.lightVX = (state.lightVX + ax * dt) * damping;
     state.lightVY = (state.lightVY + ay * dt) * damping;
   
     state.lightX += state.lightVX * dt;
     state.lightY += state.lightVY * dt;
   
     lightCore.style.left = `${state.lightX}px`;
     lightCore.style.top  = `${state.lightY}px`;
   
     // Flash-Position für cinematischen Radial-Gradient
     const pct = (state.lightX / cw() * 100).toFixed(1);
     const pcy = (state.lightY / ch() * 100).toFixed(1);
     flashOverlay.style.setProperty('--flash-cx', `${pct}%`);
     flashOverlay.style.setProperty('--flash-cy', `${pcy}%`);
   }
   
   // ============================================================
   //  WELTENWECHSEL — cinematisch & smooth
   // ============================================================
   function triggerWorldTransition() {
     if (state.transitioning) return;
     state.transitioning = true;
   
     // Transition-Sound startet gleichzeitig mit dem visuellen Flash
     playTransitionSound();
   
     // Master-Volume der laufenden Welt sanft ausblenden
     if (audio.masterGain && audioCtx) {
       const now = audioCtx.currentTime;
       audio.masterGain.gain.linearRampToValueAtTime(0.001, now + 0.8);
     }
   
     // Flash starten
     flashOverlay.classList.remove('flashing');
     void flashOverlay.offsetWidth;
     flashOverlay.classList.add('flashing');
   
     // Welt wechseln beim Höhepunkt des Flashes (wenn alles weiß ist)
     // doFlash erreicht opacity:1 bei ~18% von 2.6s = ~470ms
     setTimeout(() => {
       const nextWorld = (state.world + 1) % NUM_WORLDS;
       state.world     = nextWorld;
       state.progress  = state.targetProgress = 0;
   
       app.className    = `world-${state.world}`;
       particles.length = 0;
   
       if (state.world === 0) {
         tCtx.clearRect(0, 0, cw(), ch());
       } else {
         tCtx.fillStyle = '#000';
         tCtx.fillRect(0, 0, cw(), ch());
       }
   
       if (state.world === 4) initStarfield();
   
       // Licht-Velocity nullsetzen — kein Sprung
       state.lightVX = 0;
       state.lightVY = 0;
   
       // Neue Welt Sound aufbauen (beginnt leise, blendet ein)
       if (state.audioUnlocked) buildAudioGraph(state.world);
     }, 480);
   
     setTimeout(() => { state.transitioning = false; }, 2800);
   }
   
   // ============================================================
   //  INTERAKTION
   // ============================================================
   const SCROLL_SENSITIVITY = 0.048;
   let touchLastY = 0;
   
   function handleScroll(delta) {
     if (state.transitioning) return;
     if (!state.interacted) {
       state.interacted = true;
       hint.classList.add('hidden');
       unlockAudio();
     }
     state.targetProgress = Math.min(100, Math.max(0,
       state.targetProgress + delta * SCROLL_SENSITIVITY
     ));
     if (Math.abs(delta) > 40) spawnScrollImpulse(Math.abs(delta) / 110);
   }
   
   window.addEventListener('wheel', e => {
     e.preventDefault();
     handleScroll(e.deltaY * 0.45);
   }, { passive: false });
   
   window.addEventListener('touchstart', e => {
     touchLastY = e.touches[0].clientY;
     if (!state.interacted) {
       state.interacted = true;
       hint.classList.add('hidden');
       unlockAudio();
     }
   }, { passive: true });
   
   window.addEventListener('touchmove', e => {
     e.preventDefault();
     const y = e.touches[0].clientY;
     state.targetMouseX = e.touches[0].clientX / window.innerWidth;
     state.targetMouseY = e.touches[0].clientY / window.innerHeight;
     handleScroll((touchLastY - y) * 1.6);
     touchLastY = y;
   }, { passive: false });
   
   window.addEventListener('mousemove', e => {
     state.targetMouseX = e.clientX / window.innerWidth;
     state.targetMouseY = e.clientY / window.innerHeight;
     cursor.style.left  = `${e.clientX}px`;
     cursor.style.top   = `${e.clientY}px`;
   });
   
   window.addEventListener('keydown', e => {
     if (['ArrowDown','ArrowRight',' '].includes(e.key)) handleScroll(55);
     if (['ArrowUp','ArrowLeft'].includes(e.key))        handleScroll(-55);
   });
   
   // ============================================================
   //  HAUPT-LOOP
   // ============================================================
   function loop(timestamp) {
     const dt = Math.min((timestamp - state.lastTimestamp) / 1000, 0.1);
     state.lastTimestamp = timestamp;
     state.time += dt;
   
     if (!state.transitioning) {
       state.progress += (state.targetProgress - state.progress) * 0.042;
       if (state.targetProgress >= 100 && state.progress > 97) {
         triggerWorldTransition();
       }
     }
   
     updateTrail();
     if (WORLDS[state.world].warpLines) drawWarpLines();
     spawnParticlesForWorld(dt);
     updateAndDrawParticles(dt);
     updateLightSize();
     updateLightPosition(dt);
     updateAudio(dt);
   
     requestAnimationFrame(loop);
   }
   
   // ============================================================
   //  INIT
   // ============================================================
   function init() {
     app.className = 'world-0';
     tCtx.clearRect(0, 0, cw(), ch());
   
     state.lightX = cw() * 0.5;
     state.lightY = ch() * 0.45;
   
     for (let i = 0; i < 12; i++) spawnParticle();
   
     requestAnimationFrame(ts => {
       state.lastTimestamp = ts;
       loop(ts);
     });
   }
   
   init();
   
