export type SfxName =
  | 'hitLight'
  | 'hitHeavy'
  | 'block'
  | 'projectile'
  | 'uppercut'
  | 'tatsumaki'
  | 'dash'
  | 'backdash'
  | 'throwGrab'
  | 'throwTech'
  | 'superFlash'
  | 'exFlash'
  | 'armorHit'
  | 'teleport'
  | 'commandGrab'
  | 'diveKick'
  | 'dodgeRoll'
  | 'ko'
  | 'roundStart';

export class SoundEngine {
  private ctx: AudioContext | null = null;
  public muted = false;

  public unlock(): void {
    try {
      if (!this.ctx) {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (AudioCtx) this.ctx = new AudioCtx();
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
    } catch {
      // Ignorar errores de política de audio
    }
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  private playNoise(
    duration: number,
    filterFreq: number,
    gainVal: number,
    type: BiquadFilterType = 'bandpass'
  ): void {
    if (this.muted || !this.ctx) return;
    try {
      const bufferSize = Math.floor(this.ctx.sampleRate * duration);
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] =
          (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.35));
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.setValueAtTime(filterFreq, this.ctx.currentTime);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        this.ctx.currentTime + duration
      );

      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      src.start();
    } catch {
      // Ignorar errores de audio
    }
  }

  private playTone(
    freqStart: number,
    freqEnd: number,
    duration: number,
    type: OscillatorType = 'sawtooth',
    gainVal = 0.2
  ): void {
    if (this.muted || !this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freqStart, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(20, freqEnd),
        this.ctx.currentTime + duration
      );

      gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(
        0.001,
        this.ctx.currentTime + duration
      );

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch {
      // Ignorar errores de audio
    }
  }

  public play(name: SfxName): void {
    switch (name) {
      case 'hitLight':
        this.hitLight();
        break;
      case 'hitHeavy':
        this.hitHeavy();
        break;
      case 'block':
        this.block();
        break;
      case 'projectile':
        this.projectile();
        break;
      case 'uppercut':
        this.uppercut();
        break;
      case 'tatsumaki':
        this.tatsumaki();
        break;
      case 'dash':
        this.dash();
        break;
      case 'backdash':
        this.backdash();
        break;
      case 'throwGrab':
        this.throwGrab();
        break;
      case 'throwTech':
        this.throwTech();
        break;
      case 'superFlash':
        this.superFlash();
        break;
      case 'exFlash':
        this.exFlash();
        break;
      case 'armorHit':
        this.armorHit();
        break;
      case 'teleport':
        this.teleport();
        break;
      case 'commandGrab':
        this.commandGrab();
        break;
      case 'diveKick':
        this.diveKick();
        break;
      case 'dodgeRoll':
        this.dodgeRoll();
        break;
      case 'ko':
        this.ko();
        break;
      case 'roundStart':
        this.roundStart();
        break;
    }
  }

  public hitLight(): void {
    this.playNoise(0.09, 1200, 0.25);
    this.playTone(240, 80, 0.08, 'triangle', 0.22);
  }

  public hitHeavy(): void {
    this.playNoise(0.18, 600, 0.38, 'lowpass');
    this.playTone(170, 42, 0.17, 'sawtooth', 0.3);
  }

  public block(): void {
    this.playNoise(0.08, 2800, 0.18, 'highpass');
    this.playTone(520, 310, 0.09, 'square', 0.12);
  }

  public projectile(): void {
    this.playTone(220, 760, 0.22, 'sawtooth', 0.16);
    this.playNoise(0.18, 1600, 0.15);
  }

  public uppercut(): void {
    this.playTone(180, 920, 0.24, 'sawtooth', 0.2);
    this.playNoise(0.2, 1800, 0.2);
  }

  public tatsumaki(): void {
    this.playNoise(0.26, 1100, 0.22, 'bandpass');
    this.playTone(320, 580, 0.14, 'triangle', 0.16);
  }

  public dash(): void {
    this.playNoise(0.11, 2200, 0.16, 'highpass');
    this.playTone(260, 520, 0.1, 'sine', 0.12);
  }

  public backdash(): void {
    this.playNoise(0.12, 3000, 0.18, 'highpass');
    this.playTone(540, 290, 0.12, 'triangle', 0.14);
  }

  public throwGrab(): void {
    this.playTone(300, 140, 0.12, 'triangle', 0.22);
  }

  public throwTech(): void {
    this.playTone(680, 1240, 0.16, 'sine', 0.25);
    this.playNoise(0.12, 3200, 0.2);
  }

  public superFlash(): void {
    this.playTone(110, 880, 0.48, 'sawtooth', 0.26);
    this.playTone(220, 1320, 0.48, 'sine', 0.22);
    this.playNoise(0.35, 900, 0.25, 'lowpass');
  }

  public exFlash(): void {
    this.playTone(340, 1080, 0.22, 'triangle', 0.22);
    this.playTone(520, 1460, 0.18, 'sine', 0.16);
  }

  public armorHit(): void {
    this.playTone(130, 75, 0.14, 'square', 0.24);
    this.playNoise(0.14, 1500, 0.26, 'bandpass');
  }

  public teleport(): void {
    this.playNoise(0.14, 3400, 0.2, 'highpass');
    this.playTone(880, 220, 0.14, 'sine', 0.16);
  }

  public commandGrab(): void {
    this.playTone(140, 52, 0.26, 'sawtooth', 0.28);
    this.playNoise(0.24, 520, 0.32, 'lowpass');
  }

  public diveKick(): void {
    this.playTone(620, 190, 0.18, 'sawtooth', 0.18);
    this.playNoise(0.16, 2000, 0.18, 'bandpass');
  }

  public dodgeRoll(): void {
    this.playNoise(0.14, 2400, 0.16, 'bandpass');
    this.playTone(300, 620, 0.12, 'sine', 0.12);
  }

  public ko(): void {
    this.playNoise(0.45, 320, 0.42, 'lowpass');
    this.playTone(150, 32, 0.55, 'sawtooth', 0.32);
  }

  public roundStart(): void {
    this.playTone(440, 660, 0.18, 'triangle', 0.18);
  }
}

export const sfx = new SoundEngine();
