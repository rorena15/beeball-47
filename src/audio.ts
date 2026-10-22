// 효과음은 전부 WebAudio 합성. 파일 없음.
import { Music } from './music';

const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33, 36];

export class Sfx {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private noise!: AudioBuffer;
  private buzzGain!: GainNode;
  private buzzLfoDepth!: GainNode;
  private buzzOsc: OscillatorNode[] = [];
  private buzzFilter!: BiquadFilterNode;
  private lastPlink = 0;
  /** 설정: 효과음 볼륨 0..1, 벌떼 웅웅 소리 켜기 */
  volume = 0.8;
  buzzOn = true;
  /** 메뉴 뒤 데모 중에는 효과음을 끈다 (배경음악은 따로) */
  muted = false;
  /** 배경음악 볼륨 0..1 */
  musicVolume = 0.6;
  music: Music | null = null;
  private musicTarget = 0.2;

  init() {
    if (this.ctx) return;
    const ctx = new AudioContext();
    this.ctx = ctx;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(comp).connect(ctx.destination);

    this.noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // 벌떼 웅웅: 살짝 어긋난 톱니파 두 개 + 날갯짓 떨림
    this.buzzFilter = ctx.createBiquadFilter();
    this.buzzFilter.type = 'lowpass';
    this.buzzFilter.frequency.value = 600;
    this.buzzGain = ctx.createGain();
    this.buzzGain.gain.value = 0;
    for (const f of [172, 175.5]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.connect(this.buzzFilter);
      o.start();
      this.buzzOsc.push(o);
    }
    this.buzzFilter.connect(this.buzzGain).connect(this.master);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 31;
    this.buzzLfoDepth = ctx.createGain();
    this.buzzLfoDepth.gain.value = 0;
    lfo.connect(this.buzzLfoDepth).connect(this.buzzGain.gain);
    lfo.start();

    this.music = new Music(ctx, comp, this.noise);
    this.music.target = this.musicTarget;
    this.music.setVolume(this.musicVolume);
    this.music.start();
  }

  /** 배경음악 긴장도 0..1 (오디오가 켜지기 전에 와도 기억해 둔다) */
  setIntensity(i: number) {
    this.musicTarget = i;
    if (this.music) this.music.target = i;
  }

  /** 볼륨·음소거 설정을 바로 반영 */
  apply() {
    if (!this.ctx) return;
    this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.03);
    this.music?.setVolume(this.musicVolume);
  }

  /** level: 공에 붙은 벌 비율 0..1, heat: 가장 뜨거운 공의 진행도 0..1 */
  setBuzz(level: number, heat: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const g = this.buzzOn ? Math.min(0.11, level * 0.11) : 0;
    this.buzzGain.gain.setTargetAtTime(g, t, 0.08);
    this.buzzLfoDepth.gain.setTargetAtTime(g * 0.5, t, 0.08);
    const f = 165 + heat * 140;
    this.buzzOsc[0].frequency.setTargetAtTime(f, t, 0.06);
    this.buzzOsc[1].frequency.setTargetAtTime(f * 1.021, t, 0.06);
    this.buzzFilter.frequency.setTargetAtTime(500 + heat * 2400, t, 0.06);
  }

  private noiseBurst(dur: number, type: BiquadFilterType, freq: number, gain: number, freqEnd?: number) {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, gain: number, delay = 0) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /** 열구 성공. 연쇄가 길수록 반짝이 음이 올라간다 */
  private lastPop = 0;

  /** 말벌이 익음. 연쇄로 한꺼번에 터지면 25ms 안의 것은 하나로 합친다 (노드가 수십 개씩 쌓이지 않게) */
  pop(chain: number, boss: boolean) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (!boss && now - this.lastPop < 0.025) return;
    this.lastPop = now;
    const k = boss ? 1.6 : 1;
    this.tone('sine', 160 / k, 38, 0.22 * k, 0.75);          // 쿵
    this.noiseBurst(0.09 * k, 'highpass', 1800, 0.35);       // 탁
    this.noiseBurst(0.35 * k, 'lowpass', 2500, 0.18, 200);   // 치익
    const step = PENTA[Math.min(chain - 1, PENTA.length - 1)];
    const f = 523.25 * Math.pow(2, step / 12);
    this.tone('triangle', f, f * 0.995, 0.35, 0.16, 0.02);   // 띵
    if (chain >= 3) this.tone('sine', f * 2, f * 2, 0.25, 0.06, 0.05);
  }

  dispatch() {
    if (!this.ctx) return;
    this.noiseBurst(0.16, 'bandpass', 350, 0.12, 1600);
  }

  plink() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastPlink < 0.035) return;
    this.lastPlink = now;
    const f = 1400 + Math.random() * 500;
    this.tone('sine', f, f * 1.05, 0.06, 0.05);
  }

  private lastSting = 0;

  /** 벌 한 마리가 죽음. 짧고 둔한 소리, 겹치지 않게 */
  sting() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastSting < 0.06) return;
    this.lastSting = now;
    this.noiseBurst(0.04, 'bandpass', 900, 0.07);
  }

  buy() {
    if (!this.ctx) return;
    [0, 4, 7, 12].forEach((s, i) => {
      const f = 659.25 * Math.pow(2, s / 12);
      this.tone('triangle', f, f, 0.18, 0.12, i * 0.045);
    });
  }

  reroll() {
    if (!this.ctx) return;
    this.noiseBurst(0.2, 'bandpass', 2400, 0.1, 500);
  }

  hiveHit() {
    if (!this.ctx) return;
    this.tone('sine', 90, 45, 0.15, 0.35);
    this.noiseBurst(0.08, 'lowpass', 600, 0.2);
  }
}
