// Procedural WebAudio only — no audio files. Engine hum, two-tone siren,
// gunshot noise, pickup chime, mission jingle, ambient bass + pad loop.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.musicNodes = null;
    this._musicTimer = 0;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this._buildEngine();
    this._buildMusic();
  }

  _buildEngine() {
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = "sawtooth";
    this.engineOsc.frequency.value = 55;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 420;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(filter).connect(this.engineGain).connect(this.ctx.destination);
    this.engineOsc.start();
  }

  setEngine(speedNorm, driving) {
    if (!this.ctx || !this.engineGain) return;
    const target = this.muted ? 0 : driving ? 0.035 + speedNorm * 0.05 : 0.012;
    this.engineGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
    this.engineOsc.frequency.setTargetAtTime(50 + speedNorm * 130, this.ctx.currentTime, 0.08);
  }

  setMuted(m) {
    this.muted = m;
    if (this.ctx) this.ctx.destination.gain?.setTargetAtTime?.(m ? 0 : 1, this.ctx.currentTime, 0.05);
    // Fallback: master gain via engine gain when no master node exists.
    if (this.ctx && this.engineGain) {
      this.engineGain.gain.setTargetAtTime(m ? 0 : 0.03, this.ctx.currentTime, 0.05);
    }
  }

  _blip(freq, dur, type = "sine", vol = 0.12, when = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  _noise(dur, vol = 0.25, filterFreq = 1800) {
    if (!this.ctx || this.muted) return;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.ctx.destination);
    src.start();
  }

  playShot() {
    this._noise(0.14, 0.3, 2400);
    this._blip(160, 0.08, "square", 0.08);
  }

  playEnemyShot() {
    this._noise(0.1, 0.12, 1400);
  }

  playSwing() {
    this._noise(0.09, 0.1, 900);
  }

  playClick() {
    this._blip(1200, 0.05, "square", 0.06);
  }

  playReload() {
    this._blip(500, 0.06, "square", 0.08);
    this._blip(750, 0.06, "square", 0.08, 0.09);
  }

  playPickup() {
    this._blip(880, 0.12, "sine", 0.14);
    this._blip(1318, 0.16, "sine", 0.12, 0.09);
  }

  playJingle() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((n, i) => this._blip(n, 0.22, "triangle", 0.14, i * 0.11));
  }

  playSirenBurst() {
    // Two-tone wail, one cycle.
    this._blip(720, 0.3, "sine", 0.05);
    this._blip(960, 0.3, "sine", 0.05, 0.3);
  }

  _buildMusic() {
    // Simple ambient loop: soft pad chord + slow bass pulse, scheduled
    // on a timer from the game loop via tickMusic().
    this.musicNodes = { step: 0 };
  }

  tickMusic(dt) {
    if (!this.ctx || this.muted) return;
    this._musicTimer -= dt;
    if (this._musicTimer > 0) return;
    this._musicTimer = 0.5;
    const bassNotes = [55, 55, 65.4, 49];
    const step = this.musicNodes.step++ % 4;
    this._blip(bassNotes[step], 0.45, "triangle", 0.05);
    if (step === 0) this._blip(220, 0.9, "sine", 0.025);
    if (step === 2) this._blip(277, 0.9, "sine", 0.02);
  }
}
