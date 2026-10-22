// 배경음악도 전부 WebAudio 합성. 파일 없음.
// 긴장도(intensity 0..1)에 따라 악기가 한 겹씩 들어오고 빠지는 적응형 음악.
// 조성은 A단조 = C장조 5음계라서 연쇄 효과음(C 5음계 '띵')이 그대로 멜로디처럼 얹힌다.

const BPM = 104;
const STEP = 60 / BPM / 4; // 16분음표 길이(초)
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

// 한 마디에 한 화음: Am – F – C – G
const CHORDS = [
  { root: 45, tones: [57, 60, 64] }, // Am
  { root: 41, tones: [57, 60, 65] }, // F
  { root: 48, tones: [55, 60, 64] }, // C
  { root: 43, tones: [55, 59, 62] }, // G
];

// 층마다 켜지는 긴장도. 마디가 바뀔 때만 켜고 끈다 (박자 중간에 툭 끊기지 않게)
const GATE = { arp: 0.15, hat: 0.35, bass: 0.3, kick: 0.45, snare: 0.6, hat16: 0.75, lead: 0.85 };
type Layer = keyof typeof GATE;

export class Music {
  private bus: GainNode;
  private padBus: GainNode;
  private nextTime = 0;
  private step = 0;
  private bar = 0;
  private timer = 0;
  private on: Record<Layer, boolean> = { arp: false, hat: false, bass: false, kick: false, snare: false, hat16: false, lead: false };
  /** 게임이 매 프레임 넣어 주는 목표 긴장도. 실제 값은 천천히 따라간다 */
  target = 0.2;
  private level = 0.2;

  constructor(private ctx: AudioContext, out: AudioNode, private noise: AudioBuffer) {
    this.bus = ctx.createGain();
    this.bus.gain.value = 0;
    this.bus.connect(out);
    this.padBus = ctx.createGain();
    this.padBus.gain.value = 1;
    const padLp = ctx.createBiquadFilter();
    padLp.type = 'lowpass';
    padLp.frequency.value = 900;
    this.padBus.connect(padLp).connect(this.bus);
  }

  start() {
    if (this.timer) return;
    this.nextTime = this.ctx.currentTime + 0.1;
    this.step = 0;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  /** 볼륨 0..1 (부드럽게) */
  setVolume(v: number) {
    this.bus.gain.setTargetAtTime(v * 1.2, this.ctx.currentTime, 0.15);
  }

  private schedule() {
    const now = this.ctx.currentTime;
    // 탭이 뒤로 가서 타이머가 밀렸으면 몰아서 치지 말고 지금부터 다시
    if (this.nextTime < now - 0.2) this.nextTime = now + 0.05;
    while (this.nextTime < now + 0.12) {
      this.playStep(this.step, this.nextTime);
      this.nextTime += STEP;
      this.step = (this.step + 1) % 16;
      if (this.step === 0) this.bar++;
    }
  }

  private playStep(s: number, t: number) {
    this.level += (this.target - this.level) * 0.08;
    const I = this.level;
    const chord = CHORDS[this.bar % 4];

    if (s === 0) {
      for (const k of Object.keys(GATE) as Layer[]) this.on[k] = I >= GATE[k];
      this.pad(chord.tones, t, STEP * 16);
    }

    // 아르페지오: 화음 음을 오르내리며, 긴장도가 오를수록 밝게
    if (this.on.arp && s % 2 === 0) {
      const pat = [0, 1, 2, 1, 0, 2, 1, 2];
      const tones = chord.tones;
      const n = tones[pat[(s / 2) % 8]] + 12;
      this.pluck('triangle', mtof(n), t, STEP * 1.8, 0.05, 1400 + I * 3200);
    }

    // 베이스: 엇박이 섞인 8분음표, 여왕 웨이브급 긴장도면 톱니파로 거칠게
    if (this.on.bass && [0, 3, 6, 8, 11, 14].includes(s)) {
      const n = chord.root + (s === 6 || s === 14 ? 12 : 0);
      this.pluck(I > 0.9 ? 'sawtooth' : 'square', mtof(n), t, STEP * 1.6, 0.09, 380 + I * 500);
    }

    if (this.on.kick && (s === 0 || s === 8 || (I > 0.75 && s === 10))) this.kick(t);
    if (this.on.snare && (s === 4 || s === 12)) this.snare(t);
    if (this.on.hat16 ? true : this.on.hat && s % 4 === 2) this.hat(t, s % 4 === 2 ? 0.05 : 0.025);

    // 리드: 최고조에서만, 5음계로 짧은 동기를 반복
    if (this.on.lead && [0, 3, 6, 10, 12].includes(s)) {
      const PENTA = [69, 72, 74, 76, 79, 81];
      const motif = [4, 3, 1, 2, 0];
      const n = PENTA[motif[[0, 3, 6, 10, 12].indexOf(s)]];
      this.pluck('square', mtof(n), t, STEP * 2.2, 0.035, 2600);
    }
  }

  private pad(tones: number[], t: number, dur: number) {
    for (const n of tones) {
      for (const det of [-6, 6]) {
        const o = this.ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(n - 12);
        o.detune.value = det;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.018, t + 0.5);
        g.gain.setValueAtTime(0.018, t + dur - 0.3);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.2);
        o.connect(g).connect(this.padBus);
        o.start(t);
        o.stop(t + dur + 0.25);
      }
    }
  }

  private pluck(type: OscillatorType, f: number, t: number, dur: number, gain: number, cutoff: number) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(cutoff, t);
    lp.frequency.exponentialRampToValueAtTime(Math.max(120, cutoff * 0.3), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp).connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private kick(t: number) {
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.32, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
    o.connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + 0.3);
  }

  private noiseHit(t: number, type: BiquadFilterType, freq: number, dur: number, gain: number) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.bus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  private snare(t: number) {
    this.noiseHit(t, 'bandpass', 1800, 0.16, 0.14);
    this.pluck('triangle', 190, t, 0.08, 0.06, 2000);
  }

  private hat(t: number, gain: number) {
    this.noiseHit(t, 'highpass', 7000, 0.04, gain);
  }
}
