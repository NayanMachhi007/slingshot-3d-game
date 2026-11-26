/**
 * Procedural Web Audio API sound synthesizer.
 * Zero external audio assets required.
 */
export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.lastStretchSound = 0;
    this.lastImpactTime = 0;
    this.noiseBuffer = null;
  }

  ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
      this.noiseBuffer = this._createNoiseBuffer(1.5);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }

  _createNoiseBuffer(durationSec) {
    const sampleRate = this.ctx.sampleRate;
    const length = Math.floor(sampleRate * durationSec);
    const buffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  playStretch(tension) {
    if (this.muted) return;
    const now = performance.now();
    if (now - this.lastStretchSound < 95) return;
    this.lastStretchSound = now;

    const ctx = this.ensureContext();
    if (!ctx) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    const baseFreq = 110 + tension * 150;
    osc.frequency.setValueAtTime(baseFreq, t);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.15, t + 0.055);

    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.06, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.065);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.07);
  }

  playLaunch(power) {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const t = ctx.currentTime;

    // Elastic twang
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(160 + power * 120, t);
    osc.frequency.exponentialRampToValueAtTime(55, t + 0.22);
    oscGain.gain.setValueAtTime(0.24, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
    osc.connect(oscGain);
    oscGain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.25);

    // Air whoosh
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(420, t);
    filter.frequency.exponentialRampToValueAtTime(1750, t + 0.14);
    filter.frequency.exponentialRampToValueAtTime(320, t + 0.32);
    filter.Q.value = 2.2;

    const nGain = ctx.createGain();
    nGain.gain.setValueAtTime(0.001, t);
    nGain.gain.linearRampToValueAtTime(0.22 * Math.max(0.4, power), t + 0.06);
    nGain.gain.exponentialRampToValueAtTime(0.001, t + 0.34);

    noise.connect(filter);
    filter.connect(nGain);
    nGain.connect(ctx.destination);
    noise.start(t);
    noise.stop(t + 0.36);
  }

  playImpact(material, intensity = 0.6) {
    if (this.muted) return;
    const now = performance.now();
    if (now - this.lastImpactTime < 35) return;
    this.lastImpactTime = now;

    const ctx = this.ensureContext();
    if (!ctx) return;

    const vol = Math.min(0.45, Math.max(0.06, intensity * 0.35));
    const t = ctx.currentTime;

    if (material === 'glass') {
      // Crisp high-pitched glass clink / shatter
      const freqs = [1850, 2650, 3420, 4280];
      freqs.forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f * (0.9 + Math.random() * 0.2), t + idx * 0.012);
        g.gain.setValueAtTime(vol * 0.4, t + idx * 0.012);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.14 + idx * 0.02);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(t + idx * 0.012);
        osc.stop(t + 0.19 + idx * 0.02);
      });
    } else if (material === 'wood') {
      // Resonant hollow wood knock
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      const freq = 185 + Math.random() * 75;
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.48, t + 0.11);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.13);
    } else {
      // Stone deep thud
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(105 + Math.random() * 25, t);
      osc.frequency.exponentialRampToValueAtTime(36, t + 0.16);
      g.gain.setValueAtTime(vol * 1.15, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.19);
    }
  }

  playBreak(material) {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const t = ctx.currentTime;
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    const g = ctx.createGain();

    if (material === 'glass') {
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(2400, t);
      g.gain.setValueAtTime(0.28, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      this.playImpact('glass', 1.0);
    } else if (material === 'wood') {
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(650, t);
      filter.Q.value = 1.4;
      g.gain.setValueAtTime(0.32, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    } else {
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(340, t);
      g.gain.setValueAtTime(0.38, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
    }

    noise.connect(filter);
    filter.connect(g);
    g.connect(ctx.destination);
    noise.start(t);
    noise.stop(t + 0.36);
  }

  playSplit() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const t = ctx.currentTime;
    [520, 740, 980].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t + i * 0.035);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.45, t + i * 0.035 + 0.09);
      g.gain.setValueAtTime(0.18, t + i * 0.035);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.035 + 0.1);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t + i * 0.035);
      osc.stop(t + i * 0.035 + 0.11);
    });
  }

  playExplosion() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const t = ctx.currentTime;

    // Sub-bass boom
    const osc = ctx.createOscillator();
    const og = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(125, t);
    osc.frequency.exponentialRampToValueAtTime(24, t + 0.55);
    og.gain.setValueAtTime(0.55, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    osc.connect(og);
    og.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.62);

    // Explosion roar noise
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(950, t);
    filter.frequency.exponentialRampToValueAtTime(140, t + 0.65);

    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.45, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.72);

    noise.connect(filter);
    filter.connect(ng);
    ng.connect(ctx.destination);
    noise.start(t);
    noise.stop(t + 0.75);
  }

  playTargetPop() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const t = ctx.currentTime;
    // Bubble pop
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(280, t);
    osc.frequency.exponentialRampToValueAtTime(920, t + 0.09);
    g.gain.setValueAtTime(0.28, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.12);

    // Reward chime
    const chime = ctx.createOscillator();
    const cg = ctx.createGain();
    chime.type = 'triangle';
    chime.frequency.setValueAtTime(1046.5, t + 0.07);
    cg.gain.setValueAtTime(0.18, t + 0.07);
    cg.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
    chime.connect(cg);
    cg.connect(ctx.destination);
    chime.start(t + 0.07);
    chime.stop(t + 0.36);
  }

  playVictory() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const t = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      const start = t + idx * 0.11;
      const dur = idx === notes.length - 1 ? 0.55 : 0.22;
      osc.frequency.setValueAtTime(freq, start);
      g.gain.setValueAtTime(0.22, start);
      g.gain.exponentialRampToValueAtTime(0.001, start + dur);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + dur + 0.02);
    });
  }

  playGameOver() {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const t = ctx.currentTime;
    const notes = [392.0, 349.23, 311.13, 261.63];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sawtooth';
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 700;
      const start = t + idx * 0.16;
      osc.frequency.setValueAtTime(freq, start);
      g.gain.setValueAtTime(0.12, start);
      g.gain.exponentialRampToValueAtTime(0.001, start + 0.28);
      osc.connect(filter);
      filter.connect(g);
      g.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.3);
    });
  }
}
