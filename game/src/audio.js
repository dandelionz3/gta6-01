// Every sound is synthesized locally. The context starts only after a user gesture.
export function createAudio() {
  let ctx = null, master = null, engine = null, engineGain = null, siren = null, sirenGain = null;
  let muted = false, musicStep = 0, musicClock = 0;
  function start() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    ctx = new Audio(); master = ctx.createGain(); master.gain.value = muted ? 0 : 0.45; master.connect(ctx.destination);
    engine = ctx.createOscillator(); engine.type = 'sawtooth'; engine.frequency.value = 45;
    const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 240;
    engineGain = ctx.createGain(); engineGain.gain.value = 0;
    engine.connect(filter); filter.connect(engineGain); engineGain.connect(master); engine.start();
    siren = ctx.createOscillator(); siren.type = 'triangle'; siren.frequency.value = 660;
    sirenGain = ctx.createGain(); sirenGain.gain.value = 0; siren.connect(sirenGain); sirenGain.connect(master); siren.start();
  }
  function tone(frequency, duration, volume, type = 'sine', delay = 0) {
    if (!ctx) return;
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    const t = ctx.currentTime + delay;
    osc.type = type; osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0, t); gain.gain.linearRampToValueAtTime(volume, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain); gain.connect(master); osc.start(t); osc.stop(t + duration + 0.05);
  }
  function noise(duration, volume, cutoff) {
    if (!ctx) return;
    const length = Math.floor(ctx.sampleRate * duration), buffer = ctx.createBuffer(1, length, ctx.sampleRate), channel = buffer.getChannelData(0);
    // A deterministic noise sequence keeps even procedural audio self-contained.
    let n = 17431;
    for (let i = 0; i < length; i++) { n = (Math.imul(n, 1664525) + 1013904223) | 0; channel[i] = (n / 2147483648) * Math.pow(1 - i / length, 2); }
    const source = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    source.buffer = buffer; filter.type = 'lowpass'; filter.frequency.value = cutoff; gain.gain.value = volume;
    source.connect(filter); filter.connect(gain); gain.connect(master); source.start();
  }
  return {
    start,
    toggle() { muted = !muted; if (master) master.gain.setTargetAtTime(muted ? 0 : 0.45, ctx.currentTime, 0.08); return muted; },
    get muted() { return muted; },
    gun(volume = 1) { noise(0.16, volume * 0.8, 4500); tone(90, 0.12, volume * 0.25, 'triangle'); },
    hit() { noise(0.15, 0.35, 450); },
    pickup() { [523.25, 659.25, 783.99].forEach((f, i) => tone(f, 0.25, 0.15, 'sine', i * 0.08)); },
    mission() { [261.63, 329.63, 392, 523.25, 659.25, 783.99].forEach((f, i) => tone(f, 0.6, 0.18, 'triangle', i * 0.12)); },
    update(dt, game) {
      if (!ctx) return;
      const playing = game.mode === 'play';
      engine.frequency.setTargetAtTime(42 + Math.abs(game.car?.speed || 0) * 3.6, ctx.currentTime, 0.12);
      engineGain.gain.setTargetAtTime(playing && game.car ? 0.13 : 0, ctx.currentTime, 0.1);
      siren.frequency.setTargetAtTime(Math.floor(game.time * 2) % 2 ? 880 : 620, ctx.currentTime, 0.03);
      sirenGain.gain.setTargetAtTime(playing && game.wanted >= 2 && game.policeSeen ? 0.07 : 0, ctx.currentTime, 0.2);
      musicClock -= dt;
      if (musicClock <= 0 && playing) {
        musicClock = 0.48; const bass = [65.41, 65.41, 77.78, 58.27, 65.41, 87.31, 77.78, 58.27];
        tone(bass[Math.floor(musicStep / 4) % bass.length], 0.4, 0.075, 'triangle');
        if (musicStep % 8 === 0) {
          const root = bass[Math.floor(musicStep / 4) % bass.length] * 4;
          [1, 1.5, 2].forEach(r => tone(root * r, 3, 0.018, 'sine'));
        }
        if (musicStep % 2) noise(0.025, 0.025, 7000);
        musicStep++;
      }
    }
  };
}
