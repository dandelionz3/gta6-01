// Procedural WebAudio for Solmar Bay — no audio files at all. Engine
// hum, two-tone siren, gunshot noise, pickup chimes, a mission jingle
// and a quiet bass-and-pad loop are all synthesized on the fly. Nothing
// starts until the first user gesture unlocks the AudioContext.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this._engineOsc = null;
    this._engineGain = null;
    this._engineFilter = null;
    this._sirenOsc = null;
    this._sirenGain = null;
    this._sirenTimer = 0;
    this._musicTimer = 0;
    this._musicStep = 0;
    this._noiseBuf = null;
  }

  // Call from a keydown / click handler. Safe to call repeatedly.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      this.master.connect(this.ctx.destination);
      // Shared noise buffer for gunshots and impacts.
      const len = Math.floor(this.ctx.sampleRate * 0.25);
      this._noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this._noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this._startEngine();
      this._startMusic();
    } catch (err) {
      this.ctx = null;
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.9, this.ctx.currentTime, 0.05);
    }
    return this.muted;
  }

  _startEngine() {
    this._engineOsc = this.ctx.createOscillator();
    this._engineOsc.type = 'sawtooth';
    this._engineOsc.frequency.value = 55;
    this._engineFilter = this.ctx.createBiquadFilter();
    this._engineFilter.type = 'lowpass';
    this._engineFilter.frequency.value = 320;
    this._engineGain = this.ctx.createGain();
    this._engineGain.gain.value = 0;
    this._engineOsc.connect(this._engineFilter);
    this._engineFilter.connect(this._engineGain);
    this._engineGain.connect(this.master);
    this._engineOsc.start();
  }

  // speed01: 0..1, driving: whether the player is in a car.
  engine(speed01, driving) {
    if (!this.ctx || !this._engineOsc) return;
    const t = this.ctx.currentTime;
    const target = driving ? 0.05 + speed01 * 0.075 : 0.0;
    this._engineGain.gain.setTargetAtTime(target, t, 0.08);
    this._engineOsc.frequency.setTargetAtTime(52 + speed01 * 165, t, 0.08);
    this._engineFilter.frequency.setTargetAtTime(280 + speed01 * 900, t, 0.1);
  }

  siren(on) {
    if (!this.ctx) return;
    if (on && !this._sirenOsc) {
      this._sirenOsc = this.ctx.createOscillator();
      this._sirenOsc.type = 'triangle';
      this._sirenOsc.frequency.value = 720;
      this._sirenGain = this.ctx.createGain();
      this._sirenGain.gain.value = 0.035;
      this._sirenOsc.connect(this._sirenGain);
      this._sirenGain.connect(this.master);
      this._sirenOsc.start();
      this._sirenTimer = setInterval(() => {
        if (!this._sirenOsc) return;
        const f = this._sirenOsc.frequency.value > 800 ? 660 : 920;
        this._sirenOsc.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.05);
      }, 420);
    } else if (!on && this._sirenOsc) {
      clearInterval(this._sirenTimer);
      this._sirenTimer = 0;
      try {
        this._sirenOsc.stop();
      } catch (err) {}
      this._sirenOsc.disconnect();
      this._sirenOsc = null;
      this._sirenGain = null;
    }
  }

  _tone(freq, dur, type, vol, when = 0) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol || 0.12, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  shot() {
    if (!this.ctx || !this._noiseBuf) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 900;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
    src.stop(t + 0.16);
  }

  punch() {
    this._tone(110, 0.12, 'sine', 0.25);
    this._tone(70, 0.14, 'triangle', 0.2, 0.01);
  }

  chime() {
    this._tone(880, 0.18, 'sine', 0.12);
    this._tone(1318, 0.26, 'sine', 0.1, 0.09);
  }

  jingle() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((n, i) => this._tone(n, 0.3, 'triangle', 0.14, i * 0.11));
  }

  failSting() {
    this._tone(311, 0.35, 'sawtooth', 0.1);
    this._tone(233, 0.5, 'sawtooth', 0.1, 0.16);
  }

  // Quiet loop: a slow bass walk under a soft pad chord, one step every
  // 240 ms. Kept low so it never fights the engine or the siren.
  _startMusic() {
    const bassLine = [55, 0, 55, 65.4, 0, 55, 49, 0, 55, 0, 55, 65.4, 82.4, 0, 73.4, 0];
    const padChords = [
      [220, 261.6, 329.6],
      [174.6, 220, 261.6],
      [196, 246.9, 293.7],
      [164.8, 220, 261.6],
    ];
    this._musicTimer = setInterval(() => {
      if (!this.ctx || this.muted) return;
      this._musicStep += 1;
      const step = this._musicStep % 16;
      const bass = bassLine[step];
      if (bass) this._tone(bass, 0.3, 'triangle', 0.07);
      if (step === 0) {
        const chord = padChords[Math.floor(this._musicStep / 16) % padChords.length];
        for (const f of chord) this._tone(f, 3.4, 'sine', 0.022);
      }
    }, 240);
  }
}
