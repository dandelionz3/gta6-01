// Procedural WebAudio only — no audio files. Everything is an oscillator
// or filtered noise, built lazily on the first user gesture (browser rule).
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOn = false;
    this._sirenPhase = 0;
    this._musicTimer = 0;
    this._musicStep = 0;
    this._bassNotes = [55, 55, 65.41, 49];
  }

  ensure() {
    if (this.ctx) { if (this.ctx.state === "suspended") this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
    // Engine hum: sawtooth whose pitch follows speed.
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = "sawtooth";
    this.engineOsc.frequency.value = 60;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass"; lp.frequency.value = 420;
    this.engineOsc.connect(lp); lp.connect(this.engineGain); this.engineGain.connect(this.master);
    this.engineOsc.start();
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.5;
    return this.muted;
  }

  setEngine(speedNorm) {
    if (!this.ctx) return;
    this.engineOsc.frequency.value = 55 + speedNorm * 165;
    this.engineGain.gain.value = speedNorm > 0.02 ? 0.05 + speedNorm * 0.06 : 0.0;
  }

  _noiseBurst(dur, freq, vol) {
    if (!this.ctx) return;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass"; f.frequency.value = freq;
    const g = this.ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start();
  }

  _tone(freq, dur, type = "sine", vol = 0.2, when = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  gunshot() { this._noiseBurst(0.16, 1800, 0.5); this._tone(140, 0.08, "square", 0.25); }
  punch() { this._noiseBurst(0.09, 700, 0.3); }
  chime() { this._tone(880, 0.12, "sine", 0.22); this._tone(1318, 0.2, "sine", 0.18, 0.09); }
  jingle() { [523, 659, 784, 1046].forEach((f, i) => this._tone(f, 0.22, "triangle", 0.22, i * 0.11)); }
  fail() { [330, 262, 196].forEach((f, i) => this._tone(f, 0.25, "sawtooth", 0.14, i * 0.14)); }

  update(dt) {
    if (!this.ctx) return;
    // Two-tone siren, alternating every 0.45 s while wanted.
    if (this.sirenOn) {
      this._sirenPhase += dt;
      if (this._sirenPhase >= 0.45) {
        this._sirenPhase = 0;
        this._tone(950, 0.42, "sine", 0.04);
      }
    }
    // Sparse ambient loop: bass note + soft octave every bar.
    this._musicTimer += dt;
    if (this._musicTimer >= 1.9) {
      this._musicTimer = 0;
      const bass = this._bassNotes[this._musicStep % this._bassNotes.length];
      this._musicStep++;
      this._tone(bass, 1.6, "triangle", 0.07);
      this._tone(bass * 2, 1.6, "sine", 0.03);
    }
  }
}
