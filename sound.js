const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

export class ForgeSound {
  constructor() {
    this.muted = false;
    this.samples = new Map();
  }

  unlock() {
    if (!Audio || this.muted) return;
    if (!this.context) {
      this.context = new Audio();
      this.master = this.context.createDynamicsCompressor();
      this.master.threshold.value = -12;
      this.master.ratio.value = 5;
      this.master.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') this.context.resume().catch(() => {});
  }

  toggle() {
    this.muted = !this.muted;
    if (!this.muted) this.unlock();
    this.master?.disconnect();
    if (!this.muted) this.master?.connect(this.context.destination);
    return this.muted;
  }

  sample(kind, variation) {
    const key = kind + ':' + variation;
    if (this.samples.has(key)) return this.samples.get(key);
    const breakage = kind === 'break';
    const chime = kind === 'surge' || kind === 'appraise';
    const ore = kind === 'ore';
    const damage = kind === 'scar';
    const length = breakage ? .58 : chime ? .54 : .26;
    const rate = this.context.sampleRate;
    const buffer = this.context.createBuffer(1, Math.ceil(length * rate), rate);
    const samples = buffer.getChannelData(0);
    const scale = .94 + variation * .037;
    const voices = chime
      ? [[245, .40, 23], [711, .24, 12], [1389, .17, 9], [2517, .11, 13]]
      : [[139, .46, 31], [491, .28, 24], [1187, .22, 32], [2207, .17, 52], [3472, .10, 55]];
    let noise = (350112 + variation * 773) | 0;
    let slow = 0;
    for (let i = 0; i < samples.length; i++) {
      const t = i / rate;
      noise = (Math.imul(noise, 1664525) + 1013904223) | 0;
      const grit = noise / 2147483648;
      slow += .16 * (grit - slow);
      const attack = Math.min(1, t / .0018);
      let sample = 0;
      for (const [freq, strength, decay] of voices) {
        const pitch = freq * scale * (ore ? .68 : breakage ? .77 : damage ? .88 : 1);
        sample += Math.sin(2 * Math.PI * pitch * t) * Math.exp(-t * decay) * strength;
      }
      const strike = (grit - .64 * slow) * Math.exp(-t * (breakage || ore ? 67 : 132));
      sample += strike * (ore || breakage ? .55 : .28) + .26 * slow * Math.exp(-t * 58);
      if (breakage) {
        const shards = Math.exp(-Math.abs(t - .041) * 119) + .73 * Math.exp(-Math.abs(t - .114) * 77);
        sample += (grit * .32 + slow * .31) * shards;
      }
      samples[i] = Math.tanh(attack * sample * .92);
    }
    this.samples.set(key, buffer);
    return buffer;
  }

  play(kind = 'polish') {
    if (this.muted || !this.context || this.context.state !== 'running') return;
    const source = this.context.createBufferSource();
    const level = this.context.createGain();
    const variation = Math.floor(Math.random() * 4);
    source.buffer = this.sample(kind, variation);
    level.gain.value = kind === 'break' ? .57 : kind === 'appraise' ? .31 : .43;
    source.connect(level);
    level.connect(this.master);
    source.start();
    source.onended = () => { source.disconnect(); level.disconnect(); };
  }

  impact(event) {
    this.play(event.type);
    if (!reduced && navigator.vibrate) {
      navigator.vibrate(event.type === 'break' ? [26, 24, 21] : event.type === 'surge' ? [11, 14, 10] : 10);
    }
  }
}
