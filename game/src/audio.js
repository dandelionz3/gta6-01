// Procedural WebAudio for Solmar Bay — no audio files at all.
// Engine hum, sirens, gunshots, chimes and a small bass-and-pad loop
// are all synthesised. Everything is guarded: if the browser blocks
// audio, the game keeps running silently.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenLfo = null;
    this.sirenOn = false;
    this.musicTimer = null;
    this.musicStep = 0;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return true;
    }
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return false;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      this.startEngineHum();
      this.startMusic();
      return true;
    } catch (err) {
      return false;
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.5, this.ctx.currentTime, 0.05);
    }
  }

  startEngineHum() {
    try {
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 55;
      this.engineFilter = this.ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.value = 320;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0.0;
      this.engineOsc.connect(this.engineFilter);
      this.engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.engineOsc.start();
    } catch (err) { /* silent */ }
  }

  // speed01: 0 parked, 1 flat out. Called every frame while driving.
  setEngine(speed01, driving) {
    if (!this.ctx || !this.engineOsc) return;
    const t = this.ctx.currentTime;
    const target = driving ? 0.05 + speed01 * 0.09 : 0.0;
    this.engineGain.gain.setTargetAtTime(target, t, 0.08);
    this.engineOsc.frequency.setTargetAtTime(52 + speed01 * 130, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(300 + speed01 * 900, t, 0.1);
  }

  setSiren(on) {
    if (!this.ctx) return;
    if (on === this.sirenOn) return;
    this.sirenOn = on;
    try {
      if (on) {
        this.sirenOsc = this.ctx.createOscillator();
        this.sirenOsc.type = 'triangle';
        this.sirenOsc.frequency.value = 720;
        this.sirenGain = this.ctx.createGain();
        this.sirenGain.gain.value = 0.035;
        const lfo = this.ctx.createOscillator();
        lfo.frequency.value = 0.9;
        const lfoGain = this.ctx.createGain();
        lfoGain.gain.value = 240;
        lfo.connect(lfoGain);
        lfoGain.connect(this.sirenOsc.frequency);
        this.sirenOsc.connect(this.sirenGain);
        this.sirenGain.connect(this.master);
        this.sirenOsc.start();
        lfo.start();
        this.sirenLfo = lfo;
      } else if (this.sirenOsc) {
        this.sirenOsc.stop();
        if (this.sirenLfo) this.sirenLfo.stop();
        this.sirenOsc = null;
        this.sirenLfo = null;
      }
    } catch (err) { /* silent */ }
  }

  noiseBurst(duration, volume, filterFreq) {
    if (!this.ctx) return;
    try {
      const len = Math.floor(this.ctx.sampleRate * duration);
      const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq;
      const gain = this.ctx.createGain();
      gain.gain.value = volume;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      src.start();
    } catch (err) { /* silent */ }
  }

  shot() {
    this.noiseBurst(0.14, 0.5, 2400);
  }

  thud() {
    this.noiseBurst(0.12, 0.35, 300);
  }

  chime() {
    this.note(880, 0.12, 0.18);
    setTimeout(() => this.note(1318, 0.16, 0.18), 90);
  }

  jingle() {
    const seq = [523, 659, 784, 1046];
    seq.forEach((freq, i) => {
      setTimeout(() => this.note(freq, 0.22, 0.2), i * 130);
    });
  }

  note(freq, duration, volume) {
    if (!this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(volume, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (err) { /* silent */ }
  }

  startMusic() {
    // Slow bass walk in A minor over a soft pad. One quiet note per
    // step keeps it under the engine and the sirens.
    const bass = [110, 110, 130.8, 98, 110, 110, 146.8, 164.8];
    const pad = [220, 261.6, 329.6];
    this.musicTimer = setInterval(() => {
      if (!this.ctx || this.muted) return;
      const step = this.musicStep % bass.length;
      this.note(bass[step], 0.5, 0.05);
      if (step % 4 === 0) {
        pad.forEach((f) => this.note(f, 1.6, 0.018));
      }
      this.musicStep += 1;
    }, 420);
  }
}
