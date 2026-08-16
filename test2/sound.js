/* ---------------------------------------------------------------
   Lo-fi hip-hop bed, synthesised live in the browser.

   Not a recording: a step sequencer at 74 BPM with swung hats drives
   a boom-bap kit, an upright-ish bass and a Rhodes-flavoured chord
   stack walking a ii–V–I–vi loop, all pushed through a lowpass and a
   wobbling delay for the tape character, over vinyl crackle.
   Small random variations mean it never loops identically.

   No audio file, nothing to licence, ~0 KB of network.
   Never autoplays. The visitor's choice is remembered.
   --------------------------------------------------------------- */

(function lofi() {
  "use strict";

  const btn = document.getElementById("sound");
  if (!btn || !(window.AudioContext || window.webkitAudioContext)) return;
  const label = document.getElementById("soundVal");

  const MIX = {
    master: 0.3,
    kick: 0.62,
    snare: 0.2,
    hat: 0.075,
    bass: 0.34,
    chord: 0.15,
    crackle: 0.05,
    fadeIn: 1.6,
    fadeOut: 1.1,
  };

  const BPM = 74;
  const SWING = 0.56; // where the off-16th lands, 0.5 = straight
  const STEPS = 16; // per bar

  /* ii – V – I – vi in C, one bar each. [bass, then the chord voicing] */
  const BARS = [
    { bass: 73.42, chord: [146.83, 174.61, 220.0, 261.63] }, // Dm7
    { bass: 98.0, chord: [123.47, 146.83, 174.61, 196.0] }, // G7
    { bass: 65.41, chord: [130.81, 164.81, 196.0, 246.94] }, // Cmaj7
    { bass: 55.0, chord: [130.81, 164.81, 196.0, 220.0] }, // Am7
  ];

  /* Which 16ths fire. Boom-bap: kick lands off the grid on 7 and 10. */
  const KICK = [0, 7, 10];
  const SNARE = [4, 12];
  const CHORD = [2, 11];
  const BASS = [0, 7, 10];

  let ctx = null;
  let master = null,
    bus = null,
    verb = null;
  let timer = null;
  let step = 0,
    bar = 0,
    nextTime = 0;
  let on = false;

  const stepDur = () => 60 / BPM / 4;

  /* --- graph --------------------------------------------------------- */

  function build() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();

    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    /* the muffled character: everything above ~2.4 kHz rolls away */
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2400;
    lp.Q.value = 0.6;

    /* tape flutter */
    const wob = ctx.createDelay(0.05);
    wob.delayTime.value = 0.011;
    const flut = ctx.createOscillator();
    const flutAmt = ctx.createGain();
    flut.frequency.value = 0.31;
    flutAmt.gain.value = 0.0028;
    flut.connect(flutAmt).connect(wob.delayTime);
    flut.start();

    lp.connect(wob).connect(master);

    verb = ctx.createConvolver();
    verb.buffer = impulse(1.9, 2.6);
    const verbGain = ctx.createGain();
    verbGain.gain.value = 0.28;
    verb.connect(verbGain).connect(master);

    bus = lp; // everything instrumental lands here

    /* vinyl crackle sits outside the lowpass so it keeps its air */
    const noise = ctx.createBufferSource();
    noise.buffer = crackle(4);
    noise.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 1200;
    const ng = ctx.createGain();
    ng.gain.value = MIX.crackle;
    noise.connect(hp).connect(ng).connect(master);
    noise.start();
  }

  function impulse(sec, decay) {
    const len = (ctx.sampleRate * sec) | 0;
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return b;
  }

  function crackle(sec) {
    const len = (ctx.sampleRate * sec) | 0;
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.1;
    for (let n = 0; n < sec * 24; n++) {
      const at = (Math.random() * len) | 0;
      const amp = 0.3 + Math.random() * 0.5;
      for (let k = 0; k < 55 && at + k < len; k++) {
        d[at + k] += amp * Math.exp(-k / 8) * (Math.random() * 2 - 1);
      }
    }
    return b;
  }

  /* --- voices --------------------------------------------------------- */

  function kick(t, vel) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.11);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(MIX.kick * vel, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + 0.45);
  }

  function snare(t, vel) {
    const src = ctx.createBufferSource();
    const len = (ctx.sampleRate * 0.22) | 0;
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.4);
    }
    src.buffer = b;

    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1750;
    bp.Q.value = 0.8;

    const g = ctx.createGain();
    g.gain.value = MIX.snare * vel;
    src.connect(bp).connect(g);
    g.connect(bus);
    g.connect(verb);
    src.start(t);
  }

  function hat(t, vel) {
    const src = ctx.createBufferSource();
    const len = (ctx.sampleRate * 0.05) | 0;
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 5);
    }
    src.buffer = b;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7000;
    const g = ctx.createGain();
    g.gain.value = MIX.hat * vel;
    src.connect(hp).connect(g).connect(bus);
    src.start(t);
  }

  function bass(t, freq, dur) {
    const o = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "triangle";
    o2.type = "sine";
    o.frequency.value = freq;
    o2.frequency.value = freq / 2; // a little sub underneath
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(MIX.bass, t + 0.02);
    g.gain.setTargetAtTime(0.0001, t + dur * 0.55, 0.09);
    o.connect(g);
    o2.connect(g);
    g.connect(bus);
    o.start(t);
    o2.start(t);
    o.stop(t + dur + 0.3);
    o2.stop(t + dur + 0.3);
  }

  /* Rhodes-ish: sine plus a quiet octave, soft attack, long tail */
  function chord(t, notes, vel) {
    notes.forEach((f, i) => {
      const o = ctx.createOscillator();
      const h = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      h.type = "sine";
      o.frequency.value = f;
      h.frequency.value = f * 2;
      h.detune.value = i % 2 ? 6 : -6;

      const hg = ctx.createGain();
      hg.gain.value = 0.18;
      h.connect(hg).connect(g);

      const peak = MIX.chord * vel * (i === 0 ? 1 : 0.82);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + 0.05);
      g.gain.setTargetAtTime(0.0001, t + 0.28, 0.5);

      o.connect(g);
      g.connect(bus);
      g.connect(verb);
      o.start(t);
      h.start(t);
      o.stop(t + 2.4);
      h.stop(t + 2.4);
    });
  }

  /* --- sequencer ------------------------------------------------------ */

  function scheduleStep(s, t) {
    const b = BARS[bar];
    const rnd = () => 0.88 + Math.random() * 0.24; // human-ish velocity

    if (KICK.includes(s)) kick(t, rnd());
    if (SNARE.includes(s)) snare(t, rnd());

    /* hats on every 8th, plus the odd extra 16th for movement */
    if (s % 2 === 0) hat(t, rnd() * (s % 4 === 0 ? 1 : 0.7));
    else if (Math.random() < 0.14) hat(t, 0.45);

    if (BASS.includes(s)) bass(t, b.bass, stepDur() * 3);
    if (CHORD.includes(s)) chord(t, b.chord, s === 2 ? 1 : 0.72);
  }

  /* Look ahead ~120 ms so timing never depends on the main thread */
  function tick() {
    if (!ctx) return;
    while (nextTime < ctx.currentTime + 0.12) {
      /* swing: push the odd 16ths late */
      const swung = step % 2 ? (SWING - 0.5) * stepDur() * 2 : 0;
      scheduleStep(step, nextTime + swung);

      nextTime += stepDur();
      step = (step + 1) % STEPS;
      if (step === 0) bar = (bar + 1) % BARS.length;
    }
  }

  /* --- transport ------------------------------------------------------ */

  function start() {
    if (!ctx) build();
    if (ctx.state === "suspended") ctx.resume();

    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(master.gain.value, t);
    master.gain.linearRampToValueAtTime(MIX.master, t + MIX.fadeIn);

    nextTime = t + 0.08;
    clearInterval(timer);
    timer = setInterval(tick, 25);
    setState(true);
  }

  function stop() {
    clearInterval(timer);
    timer = null;
    if (ctx) {
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0, t + MIX.fadeOut);
      setTimeout(() => {
        if (!on && ctx.state === "running") ctx.suspend();
      }, MIX.fadeOut * 1000 + 150);
    }
    setState(false);
  }

  function setState(next) {
    on = next;
    if (label) label.textContent = next ? "ON" : "OFF";
    btn.setAttribute("aria-pressed", String(next));
    btn.classList.toggle("is-on", next);
    try {
      localStorage.setItem("sound", next ? "on" : "off");
    } catch (e) {}
  }

  btn.addEventListener("click", () => (on ? stop() : start()));

  /* Remembered preference — audio still needs a gesture, so wait for one */
  let saved = "off";
  try {
    saved = localStorage.getItem("sound") || "off";
  } catch (e) {}

  if (saved === "on") {
    if (label) label.textContent = "ON";
    btn.classList.add("is-on");
    const wake = () => {
      start();
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
    };
    window.addEventListener("pointerdown", wake);
    window.addEventListener("keydown", wake);
  }

  /* Silence in a background tab */
  document.addEventListener("visibilitychange", () => {
    if (!ctx || !on) return;
    if (document.hidden) {
      ctx.suspend();
    } else {
      ctx.resume();
      nextTime = ctx.currentTime + 0.08;
    }
  });
})();
