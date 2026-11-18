// Procedural WebAudio only — no audio files. Engine hum, two-tone siren,
// gunshot noise, pickup chime, mission jingle and a small bass+pad loop.
export class AudioSys {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenHigh = false;
    this.sirenTimer = null;
    this.musicTimer = null;
    this.musicStep = 0;
    this.musicOn = false;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.55;
    this.master.connect(this.ctx.destination);
    // engine: sawtooth through a lowpass, pitch follows speed
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 42;
    const engineFilter = this.ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(engineFilter);
    engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    // siren: square wave that alternates between two tones
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenOsc.type = 'square';
    this.sirenOsc.frequency.value = 720;
    this.sirenGain = this.ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
    this.sirenTimer = setInterval(() => {
      if (!this.ctx) return;
      this.sirenHigh = !this.sirenHigh;
      this.sirenOsc.frequency.value = this.sirenHigh ? 960 : 720;
    }, 420);
  }

  setEngine(speed01, driving) {
    if (!this.ctx || !this.engineOsc) return;
    const target = driving ? 0.045 + speed01 * 0.075 : 0.012;
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
    this.engineOsc.frequency.value = 42 + speed01 * 110;
  }

  setSiren(on) {
    if (!this.ctx || !this.sirenGain) return;
    this.sirenGain.gain.setTargetAtTime(on ? 0.035 : 0, this.ctx.currentTime, 0.1);
  }

  noiseBurst(dur, vol, freq) {
    if (!this.ctx) return;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start();
  }

  tone(freq, dur, type = 'sine', vol = 0.16, when = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  shot() {
    this.noiseBurst(0.14, 0.5, 2400);
    this.tone(150, 0.1, 'square', 0.12);
  }
  punch() {
    this.noiseBurst(0.09, 0.3, 500);
    this.tone(90, 0.12, 'sine', 0.2);
  }
  chime() {
    this.tone(880, 0.16);
    this.tone(1318, 0.22, 'sine', 0.14, 0.09);
  }
  jingle() {
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.24, 'triangle', 0.16, i * 0.11));
  }
  fail() {
    [392, 330, 262].forEach((f, i) => this.tone(f, 0.3, 'triangle', 0.14, i * 0.14));
  }
  busted() {
    [330, 262, 196].forEach((f, i) => this.tone(f, 0.4, 'sawtooth', 0.1, i * 0.2));
  }

  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true;
    // A minor-ish bass walk + soft pad, one step every 240 ms
    const bass = [55, 0, 55, 0, 65.4, 0, 49, 0, 55, 0, 55, 0, 82.4, 0, 73.4, 0];
    this.musicTimer = setInterval(() => {
      if (!this.ctx || this.muted) { this.musicStep++; return; }
      const b = bass[this.musicStep % bass.length];
      if (b) this.tone(b, 0.5, 'triangle', 0.075);
      if (this.musicStep % 8 === 0) {
        this.tone(220, 1.8, 'sine', 0.035);
        this.tone(261.6, 1.8, 'sine', 0.03);
      }
      if (this.musicStep % 8 === 4) {
        this.tone(196, 1.8, 'sine', 0.035);
        this.tone(246.9, 1.8, 'sine', 0.03);
      }
      this.musicStep++;
    }, 240);
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.55, this.ctx.currentTime, 0.05);
    }
    return this.muted;
  }
}
