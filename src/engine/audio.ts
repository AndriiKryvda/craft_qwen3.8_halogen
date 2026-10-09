/** Procedural sound effects (no audio files). */

export type SoundKind = 'break' | 'place' | 'step' | 'hurt' | 'craft' | 'eat' | 'hit' | 'death';

export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  volume = 0.6;
  muted = false;

  init(): void {
    if (this.ctx) return;
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  private noise(duration: number, filterFreq: number, gain: number): void {
    if (!this.ctx || !this.master) return;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start();
  }

  private tone(freq: number, duration: number, gain: number, type: OscillatorType = 'sine', slide = 0): void {
    if (!this.ctx || !this.master) return;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    if (slide !== 0) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), this.ctx.currentTime + duration);
    }
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
    osc.connect(g);
    g.connect(this.master);
    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  play(kind: SoundKind): void {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    switch (kind) {
      case 'break':
        this.noise(0.16, 1400, 0.35);
        break;
      case 'place':
        this.noise(0.1, 800, 0.3);
        this.tone(220, 0.08, 0.12, 'square', -40);
        break;
      case 'step':
        this.noise(0.07, 420, 0.14);
        break;
      case 'hurt':
        this.tone(300, 0.22, 0.25, 'sawtooth', -180);
        break;
      case 'hit':
        this.tone(160, 0.12, 0.22, 'square', -60);
        break;
      case 'craft':
        this.tone(660, 0.09, 0.16, 'triangle');
        this.tone(880, 0.12, 0.12, 'triangle');
        break;
      case 'eat':
        this.tone(420, 0.1, 0.14, 'square', 60);
        break;
      case 'death':
        this.tone(220, 0.9, 0.3, 'sawtooth', -160);
        break;
    }
  }
}
