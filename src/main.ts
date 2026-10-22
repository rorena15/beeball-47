import { Application, BitmapText, Container, Graphics, Sprite, Texture, type TextStyleOptions } from 'pixi.js';
import { Sfx } from './audio';
import { MAX_EXTRA, MAX_SLOTS, S, TAGS, extra, maxSlots, colony, byId, cost, equip, lv, resetUpgrades, rollCards, slots, tagCount, trait, unequip, type UpDef } from './upgrades';
import { LANGS, detectLang, lang, setLang, t, type Key, type Lang } from './i18n';
import './style.css';

// ── 수치 (HEAT_BALL_TEMP는 Beecurity configs/constants.py의 HEAT_BALLING_TEMP_THRESHOLD) ──
// 강화로 바뀌는 수치는 upgrades.ts의 S
const HEAT_BALL_TEMP = 47;
const BASE_TEMP = 35;
const HIVE_R = 58;

const IDLE = 0, FLY = 1, BALL = 2;

// ── 말벌 종류 ── from: 처음 나오는 웨이브. cool: 식는 속도 배수(클수록 잘 안 익음), sting: 독침 배수, dmg: 벌집 초당 피해
type Kind = 'normal' | 'dart' | 'giant' | 'hunter' | 'queen';
interface KindDef {
  readonly name: string; readonly desc: string; from: number; size: number; speed: number;
  cool: number; sting: number; honey: number; dmg: number; tint: number;
}
const KINDS_RAW: Record<Kind, Omit<KindDef, 'name' | 'desc'>> = {
  normal: { from: 1, size: 13, speed: 1, cool: 1, sting: 1, honey: 5, dmg: 4, tint: 0xffffff },
  dart: { from: 2, size: 9, speed: 2.1, cool: 1, sting: 0.7, honey: 4, dmg: 5, tint: 0xff5a48 },
  giant: { from: 3, size: 20, speed: 0.55, cool: 1.9, sting: 1.6, honey: 22, dmg: 8, tint: 0xa85a18 },
  hunter: { from: 4, size: 12, speed: 1.3, cool: 1.1, sting: 1, honey: 14, dmg: 0, tint: 0xa878ff },
  queen: { from: 5, size: 26, speed: 1, cool: 1, sting: 1, honey: 60, dmg: 9, tint: 0xffffff },
};
// 이름·설명은 i18n 사전 (foe.<kind>.name / .desc)
const KINDS = Object.fromEntries(Object.entries(KINDS_RAW).map(([id, k]) => [id, {
  ...k,
  get name() { return t(`foe.${id}.name` as Key); },
  get desc() { return t(`foe.${id}.desc` as Key); },
}])) as Record<Kind, KindDef>;
const KIND_ORDER: Kind[] = ['normal', 'dart', 'giant', 'hunter', 'queen'];

// ── 웨이브 등장 패턴 ──
type Pattern = 'scatter' | 'rush' | 'surround' | 'swarm';
const patternName = (p: Pattern) => (p === 'scatter' ? '' : t(`pattern.${p}`));

interface Hornet {
  s: Sprite; glow: Sprite; label: BitmapText; labelT: number; kind: Kind; k: KindDef; orbA: number;
  x: number; y: number; temp: number; attached: number;
  size: number; boss: boolean; alive: boolean; t: number; speed: number;
  atHive: boolean; killT: number; stingT: number;
  power: number; marked: boolean; markAcc: number; guardAcc: number;
  waveT: number; waveChain: number; // 열파를 맞은 뒤 남은 시간, 그 열파의 연쇄 단계
}
interface Bee {
  s: Sprite; x: number; y: number; vx: number; vy: number;
  state: number; target: Hornet | null; a: number; r: number; w: number; seed: number;
  vet: number; auto: boolean; // vet: 열구 생존 횟수, auto: 자동 출격한 벌
}
interface Particle {
  s: Sprite; x: number; y: number; vx: number; vy: number;
  life: number; max: number; drag: number; s0: number; s1: number; a0: number;
}
interface Drop { s: Sprite; x: number; y: number; vx: number; vy: number; age: number; value: number; }
interface Popup { t: BitmapText; life: number; vy: number; }

// 글자는 BitmapText: 글자 모양을 한 번만 그려 두고 재사용한다 (Text는 바꿀 때마다 캔버스에 다시 그려 GPU로 올려서 연쇄 때 프레임이 튐)
// 색은 흰 글자에 tint로, 크기는 scale로 바꾼다 (style을 바꾸면 글꼴을 새로 만든다)
const LABEL_STYLE: TextStyleOptions = { fontFamily: 'system-ui', fontSize: 15, fontWeight: '900', fill: 0xffffff, stroke: { color: 0x000000, width: 4 } };
const POPUP_STYLE: TextStyleOptions = { fontFamily: 'system-ui', fontSize: 26, fontWeight: '900', fill: 0xffffff, stroke: { color: 0x2a1000, width: 5 } };

const sfx = new Sfx();

// ── 설정 (브라우저에만 저장, 못 읽으면 기본값) ──
const SETTINGS_KEY = 'beeball47.settings';
const opts = { lang: '' as string, volume: 80, music: 60, buzz: true, shake: true, lite: false, demo: true };
// 터치 기기(폰·태블릿)는 처음엔 효과 줄이기를 켠 채로 시작 (저장된 설정이 있으면 그걸 따름)
if (matchMedia('(pointer: coarse)').matches) opts.lite = true;
try { Object.assign(opts, JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}')); } catch { /* 기본값 */ }
function applyOpts() {
  sfx.volume = opts.volume / 100;
  sfx.musicVolume = opts.music / 100;
  sfx.buzzOn = opts.buzz;
  sfx.apply();
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(opts)); } catch { /* 저장 불가 */ }
}
setLang(detectLang(opts.lang));
applyOpts();

// 브라우저는 사용자 입력 전에는 소리를 못 낸다. 아무 데나 처음 누르면 오디오(배경음악 포함)를 켠다
for (const ev of ['pointerdown', 'keydown'] as const) window.addEventListener(ev, () => sfx.init(), { once: true });

const app = new Application();
await app.init({
  resizeTo: window,
  background: '#140d04',
  antialias: true,
  resolution: Math.min(window.devicePixelRatio || 1, 2),
  autoDensity: true,
});
document.body.prepend(app.canvas);

// ── 텍스처 ──
function makeBeeTex(): Texture {
  const g = new Graphics();
  g.ellipse(0, 0, 4.2, 2.7).fill(0xffc21a);
  g.rect(-1, -2.7, 1.4, 5.4).fill(0x2a1600);
  g.rect(1.7, -2.4, 1.1, 4.8).fill(0x2a1600);
  g.ellipse(-0.4, -3, 2.2, 1.3).fill({ color: 0xffffff, alpha: 0.55 });
  g.ellipse(-0.4, 3, 2.2, 1.3).fill({ color: 0xffffff, alpha: 0.55 });
  return app.renderer.generateTexture({ target: g, resolution: 3 });
}
function makeHornetTex(): Texture {
  const g = new Graphics();
  g.ellipse(2, -7, 8, 3.4).fill({ color: 0xffffff, alpha: 0.4 });
  g.ellipse(2, 7, 8, 3.4).fill({ color: 0xffffff, alpha: 0.4 });
  g.ellipse(-5, 0, 8.5, 5.8).fill(0xf2a30f);
  g.rect(-10, -5, 2.2, 10).fill(0x1a0d00);
  g.rect(-5, -5.6, 2.2, 11.2).fill(0x1a0d00);
  g.ellipse(4.5, 0, 4.6, 4.2).fill(0x3a1d05);
  g.circle(10.5, 0, 4).fill(0xff8a00);
  g.circle(12, -1.8, 1).fill(0x000000);
  g.circle(12, 1.8, 1).fill(0x000000);
  return app.renderer.generateTexture({ target: g, resolution: 3 });
}
function makeGlowTex(): Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d')!;
  const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,255,255,0.6)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr;
  x.fillRect(0, 0, 128, 128);
  return Texture.from(c);
}
function makeRingTex(): Texture {
  const g = new Graphics();
  g.circle(0, 0, 50).stroke({ width: 5, color: 0xffffff });
  return app.renderer.generateTexture({ target: g, resolution: 2 });
}
function makeDotTex(): Texture {
  const g = new Graphics();
  g.circle(0, 0, 5).fill(0xffffff);
  g.circle(-1.5, -1.5, 1.6).fill({ color: 0xffffff, alpha: 0.9 });
  return app.renderer.generateTexture({ target: g, resolution: 3 });
}
// 첫 연쇄 때 글자 모양을 만드느라 한 번 튀지 않게, 쓰일 글자를 미리 한 번 그려 둔다
const GLYPHS = '0123456789.+-−° 🎯🐝';
function warmGlyphs(layer: Container) {
  for (const style of [LABEL_STYLE, POPUP_STYLE]) {
    const t = new BitmapText({ text: GLYPHS, style });
    t.alpha = 0.001;
    layer.addChild(t);
    setTimeout(() => t.destroy(), 500);
  }
}
const beeTex = makeBeeTex();
const hornetTex = makeHornetTex();
const glowTex = makeGlowTex();
const ringTex = makeRingTex();
const dotTex = makeDotTex();

// ── 레이어 ──
const world = new Container();
const bg = new Graphics();
const hive = new Graphics();
const glowLayer = new Container();
const hornetLayer = new Container();
const beeLayer = new Container();
const fxLayer = new Container();
const labelLayer = new Container();
const dropLayer = new Container();
world.addChild(bg, hive, glowLayer, hornetLayer, beeLayer, fxLayer, labelLayer);
app.stage.addChild(world, dropLayer);
warmGlyphs(labelLayer);

// ── DOM HUD ──
const $ = (id: string) => document.getElementById(id)!;
const honeyEl = $('honey'), beesEl = $('bees'), waveEl = $('wave'), hpEl = $('hpfill');
const chainEl = $('chain'), bannerEl = $('banner'), overEl = $('over'), hintEl = $('hint');

// ── 상태 ──
let cx = 0, cy = 0;
let bees: Bee[] = [];
let hornets: Hornet[] = [];
let particles: Particle[] = [];
let drops: Drop[] = [];
let popups: Popup[] = [];
let honey = 0, shownHoney = 0, totalHoney = 0;
let hiveHP = 100, hiveFlash = 0;
let wave = 0, waveState: 'break' | 'spawn' | 'shop' = 'break', waveTimer = 1.2, toSpawn = 0, spawnT = 0;
let chain = 0, maxChain = 0, kills = 0, lostBees = 0, waveLost = 0, waveHoney = 0;
let hottestNow = 0;
let lastStopAt = 0, chainShow = 0, beesHurt = false;
let freeze = 0, trauma = 0, time = 0, beeSpawnT = 0, scoutT = 0, shopDelay = 0;
let over = false;
let inMenu = true; // 메뉴가 떠 있는 동안은 뒤에서 자동 조종 데모가 돈다 (상점·게임 오버 없음)
let paused = false, demoT = 0;
let pattern: Pattern = 'scatter', rushAng = 0;
let mustSpawn: Kind[] = []; // 이번 웨이브에 처음 나오는 종류는 반드시 한 번 등장
let honeyTarget = { x: 40, y: 30 };

function rand(a: number, b: number) { return a + Math.random() * (b - a); }

// 화면 배율: 폰처럼 작은 화면에서는 월드(벌집·벌·말벌) 전체를 줄여 말벌이 날아올 자리를 만든다
// 월드 좌표 = 화면 좌표 / VS. 글자는 줄어든 만큼 다시 키워서 읽을 수 있게 (TEXT_K)
let VS = 1, TEXT_K = 1;
const vw = () => app.screen.width / VS, vh = () => app.screen.height / VS;

function layout() {
  VS = Math.max(0.58, Math.min(1, Math.min(app.screen.width, app.screen.height) / 760));
  TEXT_K = Math.min(1.5, 0.88 / VS);
  world.scale.set(VS);
  cx = vw() / 2;
  cy = vh() / 2 + 10;
  const r = honeyEl.getBoundingClientRect();
  honeyTarget = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  drawBackground();
  drawHive();
}

function hexPath(g: Graphics, x: number, y: number, r: number) {
  const pts: number[] = [];
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 3 * i + Math.PI / 6;
    pts.push(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  g.poly(pts);
}

function drawBackground() {
  const w = vw(), h = vh();
  bg.clear();
  bg.rect(-50, -50, w + 100, h + 100).fill(0x140d04);
  const r = 34, dx = r * Math.sqrt(3), dy = r * 1.5;
  for (let row = -1; row * dy < h + r; row++) {
    for (let col = -1; col * dx < w + r; col++) {
      const x = col * dx + (row % 2 ? dx / 2 : 0), y = row * dy;
      hexPath(bg, x, y, r - 1);
      bg.stroke({ width: 1.5, color: 0xffa000, alpha: 0.05 });
    }
  }
  bg.circle(cx, cy, Math.max(w, h) * 0.5).fill({ color: 0xff9a00, alpha: 0.03 });
}

function drawHive() {
  hive.clear();
  hive.circle(cx, cy, HIVE_R + 14).fill({ color: 0xffb000, alpha: 0.08 });
  const r = 13, dx = r * Math.sqrt(3), dy = r * 1.5;
  for (let row = -4; row <= 4; row++) {
    for (let col = -4; col <= 4; col++) {
      const x = cx + col * dx + (row % 2 ? dx / 2 : 0), y = cy + row * dy;
      if (Math.hypot(x - cx, y - cy) > HIVE_R) continue;
      hexPath(hive, x, y, r - 1.5);
      hive.fill(0xc97a06).stroke({ width: 2, color: 0x5a3000 });
      hexPath(hive, x, y, r - 5);
      hive.fill({ color: 0xffc21a, alpha: 0.55 });
    }
  }
}

// ── 생성 ──
function addBee(x: number, y: number) {
  const s = new Sprite(beeTex);
  s.anchor.set(0.5);
  s.scale.set(1.0);
  beeLayer.addChild(s);
  const b: Bee = {
    s, x, y, vx: 0, vy: 0, state: IDLE, target: null,
    a: 0, r: 0, w: 0, seed: Math.random() * 1000, vet: 0, auto: false,
  };
  toIdle(b);
  bees.push(b);
}

function toIdle(b: Bee) {
  b.state = IDLE;
  b.target = null;
  b.auto = false;
  b.a = Math.random() * Math.PI * 2;
  b.r = HIVE_R + 10 + Math.pow(Math.random(), 0.7) * (60 + Math.sqrt(bees.length) * 2.2);
  b.w = (Math.random() < 0.5 ? -1 : 1) * rand(0.3, 1.1);
}

function addHornet(x: number, y: number, kind: Kind) {
  const k = KINDS[kind];
  const boss = kind === 'queen';
  const size = k.size;
  const s = new Sprite(hornetTex);
  s.anchor.set(0.5);
  s.scale.set(size / 13);
  const glow = new Sprite(glowTex);
  glow.anchor.set(0.5);
  glow.blendMode = 'add';
  glow.visible = false;
  const label = new BitmapText({ text: '', style: LABEL_STYLE });
  label.anchor.set(0.5);
  label.visible = false;
  hornetLayer.addChild(s);
  glowLayer.addChild(glow);
  labelLayer.addChild(label);
  s.tint = k.tint;
  hornets.push({
    s, glow, label, labelT: 0, kind, k, orbA: Math.atan2(y - cy, x - cx),
    x, y, temp: BASE_TEMP, attached: 0, size, boss, alive: true,
    t: Math.random() * 10, speed: boss ? 38 : Math.min(140, 68 + wave * 2.5) * k.speed, atHive: false, killT: 0, stingT: 0.4,
    power: 0, marked: false, markAcc: 0, guardAcc: 0, waveT: 0, waveChain: 0,
  });
}

// 이번 웨이브에 나올 수 있는 종류 중 하나 (뒤로 갈수록 특수 말벌 비중이 커진다)
function pickKind(): Kind {
  if (mustSpawn.length) return mustSpawn.shift()!;
  const g = Math.min(1, wave / 25);
  const w: [Kind, number][] = [
    ['normal', 1],
    ['dart', wave >= KINDS.dart.from ? 0.3 + 0.3 * g : 0],
    ['giant', wave >= KINDS.giant.from ? 0.1 + 0.15 * g : 0],
    // 사냥말벌은 동시에 너무 많으면 벌이 녹아내리므로 수를 제한
    ['hunter', wave >= KINDS.hunter.from && hornets.filter(h => h.alive && h.kind === 'hunter').length < 1 + wave / 8 ? 0.08 + 0.1 * g : 0],
  ];
  let r = Math.random() * w.reduce((s, [, x]) => s + x, 0);
  for (const [kind, x] of w) { r -= x; if (r <= 0) return kind; }
  return 'normal';
}

function spawnGroup() {
  // 출발 거리. 데모는 방향과 상관없이 화면 테두리 바로 바깥에서 나와 금방 보이게
  // 그 방향의 화면 테두리까지 거리. 출발점은 테두리에서 너무 멀지 않게 (세로 폰에서 옆 말벌이 한참 안 보이던 문제)
  const edge = (a: number) => Math.min(Math.abs(vw() / 2 / Math.cos(a)), Math.abs(vh() / 2 / Math.sin(a)));
  const far = Math.max(vw(), vh()) * 0.62 + 40;
  const Rof = (a: number) => inMenu ? edge(a) + 30 : Math.min(far, edge(a) + 200);
  const at = (a: number, spread: number, kind: Kind) => {
    const rr = Rof(a) + rand(0, inMenu ? spread * 0.3 : spread);
    addHornet(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, kind);
  };
  let n: number;
  if (pattern === 'surround') {
    // 포위: 사방에서 같은 거리로 동시에
    n = Math.min(toSpawn, 6 + Math.floor(wave / 3));
    const a0 = Math.random() * Math.PI * 2;
    for (let i = 0; i < n; i++) at(a0 + (i / n) * Math.PI * 2, 20, pickKind());
  } else if (pattern === 'swarm') {
    // 편대: 한 덩어리로 촘촘하게. 가운데를 익히면 연쇄로 터진다
    n = Math.min(toSpawn, 8 + Math.floor(wave / 2));
    const ang = Math.random() * Math.PI * 2, kind = Math.random() < 0.3 && wave >= KINDS.dart.from ? 'dart' : 'normal';
    for (let i = 0; i < n; i++) {
      const a = ang + rand(-0.05, 0.05);
      const off = rand(0, 60), oa = Math.random() * Math.PI * 2;
      addHornet(cx + Math.cos(a) * (Rof(a) + 40) + Math.cos(oa) * off, cy + Math.sin(a) * (Rof(a) + 40) + Math.sin(oa) * off, mustSpawn.length ? pickKind() : kind);
    }
  } else {
    // 흩어짐 / 돌격(한쪽 방향으로만)
    n = Math.min(toSpawn, 1 + Math.floor(Math.random() * Math.min(5, 1 + wave / 2)));
    const ang = pattern === 'rush' ? rushAng + rand(-0.45, 0.45) : Math.random() * Math.PI * 2;
    const kind = pickKind();
    for (let i = 0; i < n; i++) at(ang + rand(-0.12, 0.12), 70, i === 0 ? kind : (kind === 'hunter' ? 'normal' : kind));
  }
  toSpawn -= n;
}

function burst(x: number, y: number, n: number, sp0: number, sp1: number, colors: number[], s0: number, s1: number, life: number) {
  if (opts.lite) n = Math.ceil(n * 0.35);
  for (let i = 0; i < n; i++) {
    const s = new Sprite(glowTex);
    s.anchor.set(0.5);
    s.blendMode = 'add';
    s.tint = colors[(Math.random() * colors.length) | 0];
    fxLayer.addChild(s);
    const a = Math.random() * Math.PI * 2, v = rand(sp0, sp1);
    const sc = rand(s0, s1);
    particles.push({ s, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(life * 0.6, life), max: life, drag: 3.2, s0: sc, s1: sc * 0.2, a0: 1 });
  }
}

function ring(x: number, y: number, r0: number, r1: number, life: number, tint: number) {
  const s = new Sprite(ringTex);
  s.anchor.set(0.5);
  s.blendMode = 'add';
  s.tint = tint;
  fxLayer.addChild(s);
  particles.push({ s, x, y, vx: 0, vy: 0, life, max: life, drag: 0, s0: r0 / 52, s1: r1 / 52, a0: 0.9 });
}

function flash(x: number, y: number, size: number, life: number, tint: number) {
  const s = new Sprite(glowTex);
  s.anchor.set(0.5);
  s.blendMode = 'add';
  s.tint = tint;
  fxLayer.addChild(s);
  particles.push({ s, x, y, vx: 0, vy: 0, life, max: life, drag: 0, s0: size / 64, s1: size / 64 * 1.4, a0: 1 });
}

function popup(x: number, y: number, text: string, size: number, color: number) {
  const t = new BitmapText({ text, style: POPUP_STYLE });
  t.anchor.set(0.5);
  t.tint = color;
  t.scale.set(size / 26 * TEXT_K);
  t.position.set(x, y);
  labelLayer.addChild(t);
  popups.push({ t, life: 0.9, vy: -70 });
}

// ── 조작 ──
function dispatchTo(h: Hornet, count = S.sendCount(), auto = false) {
  const idle = bees.filter(b => b.state === IDLE);
  if (idle.length === 0) {
    if (!auto) {
      beesEl.style.color = '#ff5a3a';
      setTimeout(() => (beesEl.style.color = ''), 200);
    }
    return;
  }
  const n = Math.min(idle.length, count);
  idle.sort((a, b) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y));
  for (let i = 0; i < n; i++) {
    idle[i].state = FLY;
    idle[i].target = h;
    idle[i].auto = auto;
  }
  if (!auto) sfx.dispatch();
}

app.canvas.addEventListener('pointerdown', (e) => {
  sfx.init();
  if (over || inMenu) return;
  const x = (e.clientX - world.x) / VS, y = (e.clientY - world.y) / VS;
  let best: Hornet | null = null, bd = Infinity;
  for (const h of hornets) {
    if (!h.alive) continue;
    const d = Math.hypot(h.x - x, h.y - y) - h.size;
    if (d < bd) { bd = d; best = h; }
  }
  ring(x, y, 4, 26, 0.25, 0xffe08a);
  if (best && bd < 120) {
    clickHornet(best);
    hintEl.style.opacity = '0';
  }
});

function clickHornet(h: Hornet) {
  dispatchTo(h);
  if (lv.mark) h.marked = true;
}

// ── 열구 성공 ──
function cook(h: Hornet) {
  h.alive = false;
  h.s.destroy(); h.glow.destroy(); h.label.destroy();

  // 연쇄는 열파를 맞은 말벌을 익혔을 때만 이어진다. 따로 잡으면 1부터 (도화선이면 절반부터)
  if (h.waveT > 0) chain = h.waveChain + 1;
  else chain = lv.fuse ? Math.max(1, Math.floor(chain / 2) + 1) : 1;
  maxChain = Math.max(maxChain, chain);
  kills++;
  if (chain >= 20) gainSlot('chain');
  if (h.boss && !h.atHive) gainSlot('queen');

  // 연쇄 꿀 배율은 최대 ×3 (연쇄 숫자 자체는 계속 커짐)
  const gain = Math.round(h.k.honey * Math.min(3, 1 + 0.25 * (chain - 1)) * S.honeyMult());
  waveHoney += gain;
  const R = S.chainRadius(chain) * (h.boss ? 1.5 : 1);
  // 히트스톱: 연쇄 중에 매번 멈추면 렉처럼 느껴진다. 연쇄 시작과 5의 배수 고비에만, 그것도 0.4초에 한 번. 여왕은 항상
  const now = performance.now() / 1000;
  if (h.boss || ((chain === 1 || chain % 5 === 0) && now - lastStopAt > 0.4)) {
    freeze = h.boss ? 0.16 : 0.045 + Math.min(0.05, chain * 0.006);
    lastStopAt = now;
  }
  trauma = Math.min(1, trauma + (h.boss ? 0.9 : 0.3 + chain * 0.035));

  const k = h.boss ? 2 : h.kind === 'giant' ? 1.4 : 1;
  flash(h.x, h.y, 90 * k + chain * 6, 0.22, 0xfff0c0);
  burst(h.x, h.y, Math.min(80, 26 + chain * 4) * k, 120, 520 * k, [0xffd060, 0xffffff, 0xff8020, 0xffb030], 0.06, 0.16, 0.65);
  ring(h.x, h.y, h.size, R, 0.4, lv.frenzy && chain >= 3 ? 0xff4a20 : 0xff9a30);
  popup(h.x, h.y - 18, `+${gain}`, chain >= 3 ? 26 : 20, 0xffd23a);

  // 꿀 방울
  const nd = Math.ceil(Math.min(46, 7 + chain * 2 + (h.boss ? 24 : 0)) * (opts.lite ? 0.35 : 1));
  for (let i = 0; i < nd; i++) {
    const s = new Sprite(dotTex);
    s.anchor.set(0.5);
    s.tint = Math.random() < 0.3 ? 0xffe27a : 0xffb20a;
    s.scale.set(rand(0.6, 0.95));
    dropLayer.addChild(s);
    const a = Math.random() * Math.PI * 2, v = rand(140, 380);
    drops.push({ s, x: h.x * VS + world.x, y: h.y * VS + world.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0, value: gain / nd });
  }

  // 과열사: 공에 붙어 있던 벌 일부가 같이 죽는다
  const ball = bees.filter(b => b.target === h && b.state === BALL);
  const dead = Math.min(ball.length, Math.floor(ball.length * S.overheatRate() + Math.random()));
  for (let i = 0; i < dead; i++) killBee(ball[i], true);
  if (dead > 0) popup(h.x, h.y + 20, `-${dead} 🐝`, 16, 0xff7a5a);
  // 베테랑: 살아남은 벌은 강해진다
  if (lv.veteran) {
    for (const b of ball) {
      if (b.state < 0 || b.vet >= 3) continue;
      b.vet++;
      b.s.tint = VET_TINT[b.vet];
    }
  }
  // 열파: 주변 말벌 가열. 중심일수록 세고 가장자리는 0 (무리 한가운데를 노려야 연쇄가 이어짐)
  const waveHeat = S.chainHeat(chain) + dead * S.sacHeatPerDead();
  for (const o of hornets) {
    if (!o.alive) continue;
    const d = Math.hypot(o.x - h.x, o.y - h.y);
    if (d >= R) continue;
    o.temp += waveHeat * (1 - d / R) * (h.boss ? 1.6 : 1);
    o.waveChain = Math.max(o.waveT > 0 ? o.waveChain : 0, chain);
    o.waveT = S.chainWindow();
  }
  // 풀려난 벌은 옆 말벌로 넘어감
  for (const b of bees) if (b.target === h && b.state >= 0) retarget(b, R);

  if (chain >= 2) chainShow = Math.max(chainShow, chain); // DOM은 프레임 끝에 한 번만 건드린다
  sfx.pop(chain, h.boss);
}

function retarget(b: Bee, radius = S.chainRadius(1)) {
  let best: Hornet | null = null, bd = radius;
  for (const h of hornets) {
    if (!h.alive) continue;
    const d = Math.hypot(h.x - b.x, h.y - b.y);
    if (d < bd) { bd = d; best = h; }
  }
  if (best) { b.state = FLY; b.target = best; }
  else toIdle(b);
}

const VET_TINT = [0xffffff, 0xffe0a0, 0xffb060, 0xff7040];

function killBee(b: Bee, inBall = false) {
  if (b.state < 0) return;
  const dh = S.deathHoney();
  if (dh) { honey += dh; totalHoney += dh; waveHoney += dh; }
  if (inBall && Math.random() < S.phoenixChance()) {
    addBee(cx + rand(-10, 10), cy + rand(-10, 10));
    flash(cx + rand(-30, 30), cy + rand(-30, 30), 18, 0.25, 0xff7a30);
  }
  burst(b.x, b.y, 4, 30, 90, [0xffc21a, 0xff6a3a], 0.03, 0.06, 0.3);
  b.s.destroy();
  b.state = -1;
  lostBees++;
  waveLost++;
  sfx.sting();
  beesHurt = true;
}

// ── 웨이브 ──
function startWave() {
  wave++;
  colony.wave = wave;
  waveHiveHit = false;
  waveState = 'spawn';
  toSpawn = 6 + Math.floor(wave * 2 + wave * wave * 0.1);
  spawnT = 0.5;

  // 패턴: 초반 두 웨이브와 여왕 웨이브는 흩어짐. 그 뒤로는 웨이브마다 하나를 고른다
  const boss = wave % 5 === 0;
  const opts: Pattern[] = ['scatter', 'rush'];
  if (wave >= 3) opts.push('swarm');
  if (wave >= 4) opts.push('surround');
  pattern = wave <= 2 || boss ? 'scatter' : opts[(Math.random() * opts.length) | 0];
  rushAng = Math.random() * Math.PI * 2;

  // 이번 웨이브에 처음 나오는 종류는 반드시 등장시키고 배너로 알린다
  const fresh = KIND_ORDER.filter(k => k !== 'normal' && k !== 'queen' && KINDS[k].from === wave);
  mustSpawn = [...fresh];

  waveEl.textContent = `WAVE ${wave}`;
  const sub = boss ? KINDS.queen.name : patternName(pattern);
  const intro = fresh.map(k => t('wave.bannerNew', { name: KINDS[k].name, desc: KINDS[k].desc })).join('<br>');
  bannerEl.innerHTML = `WAVE ${wave}${sub ? ` · ${sub}` : ''}` + (intro ? `<small>${intro}</small>` : '');
  bannerEl.classList.remove('go');
  void bannerEl.offsetWidth;
  bannerEl.classList.add('go');
  if (boss) {
    const a = Math.random() * Math.PI * 2;
    const R = Math.min(Math.max(vw(), vh()) * 0.62 + 60, Math.min(Math.abs(vw() / 2 / Math.cos(a)), Math.abs(vh() / 2 / Math.sin(a))) + 220);
    addHornet(cx + Math.cos(a) * R, cy + Math.sin(a) * R, 'queen');
  }
}

// ── 업데이트 ──
function update(dt: number) {
  time += dt;

  // 웨이브
  if (waveState === 'break') {
    if (!inMenu || opts.demo) waveTimer -= dt;
    if (waveTimer <= 0) startWave();
  } else if (waveState === 'spawn') {
    spawnT -= dt;
    if (toSpawn > 0 && spawnT <= 0) {
      spawnGroup();
      if (toSpawn > 0 && Math.random() < 0.35) spawnGroup(); // 다른 방향에서 동시에
      spawnT = Math.max(0.3, 1.1 - wave * 0.08) * rand(0.6, 1.4) * (inMenu ? 0.6 : 1);
    }
    if (toSpawn === 0 && hornets.every(h => !h.alive) && (inMenu || drops.length === 0)) {
      if (inMenu) {
        // 데모는 상점 없이 바로 다음 웨이브. 너무 길어지면 앞쪽 웨이브로 되돌린다
        waveState = 'break';
        waveTimer = 0.3;
        if (wave >= 12) wave = 2;
      } else {
        waveState = 'shop';
        shopDelay = 0.5;
      }
    }
  }
  if (inMenu) demoPilot(dt);

  if (waveState === 'shop' && shopDelay > 0) {
    shopDelay -= dt;
    if (shopDelay <= 0) openShop();
  }

  // 번식: 웨이브 중에는 느리게 (벌을 아껴 써야 한다), 상점·메뉴에서는 빠르게 다시 채운다
  const cap = S.maxBees();
  beeSpawnT -= dt * (waveState === 'shop' || inMenu ? 12 : 1);
  while (bees.length < cap && beeSpawnT <= 0) {
    addBee(cx + rand(-10, 10), cy + rand(-10, 10));
    beeSpawnT += 1 / S.broodRate();
  }
  if (beeSpawnT < 0) beeSpawnT = 0;

  // 벌
  for (const h of hornets) { h.attached = 0; h.power = 0; }
  for (const b of bees) {
    if (b.state < 0) continue;
    if (b.state === IDLE) {
      b.a += b.w * dt;
      const tx = cx + Math.cos(b.a) * b.r + Math.sin(time * 2 + b.seed) * 6;
      const ty = cy + Math.sin(b.a) * b.r * 0.82 + Math.cos(time * 2.3 + b.seed) * 6;
      const k = Math.min(1, dt * 3.5);
      const nx = b.x + (tx - b.x) * k, ny = b.y + (ty - b.y) * k;
      b.s.rotation = Math.atan2(ny - b.y, nx - b.x);
      b.x = nx; b.y = ny;
    } else if (b.state === FLY) {
      const h = b.target!;
      if (!h.alive) { retarget(b); continue; }
      const dx = h.x - b.x, dy = h.y - b.y, d = Math.hypot(dx, dy) || 1;
      if (d < h.size * 0.9 + 6) {
        b.state = BALL;
        b.a = Math.atan2(-dy, -dx);
        b.r = h.size * 0.75 + 2 + Math.random() * (4 + Math.sqrt(h.attached + 1) * 1.1);
        b.w = (Math.random() < 0.5 ? -1 : 1) * rand(3, 7);
      } else {
        const sp = S.beeSpeed(), wob = Math.sin(time * 18 + b.seed) * 90;
        b.vx = dx / d * sp - dy / d * wob;
        b.vy = dy / d * sp + dx / d * wob;
        b.x += b.vx * dt; b.y += b.vy * dt;
        b.s.rotation = Math.atan2(b.vy, b.vx);
      }
    } else if (b.state === BALL) {
      const h = b.target!;
      if (!h.alive) { retarget(b); continue; }
      h.attached++;
      h.power += S.vetMult(b.vet) * (b.auto ? S.autoMult() : 1);
      b.a += b.w * dt;
      b.x = h.x + Math.cos(b.a) * b.r + rand(-1, 1);
      b.y = h.y + Math.sin(b.a) * b.r + rand(-1, 1);
      b.s.rotation = b.a + Math.PI / 2;
    }
    b.s.position.set(b.x, b.y);
  }

  // 정찰벌: 주기적으로 벌집에 가장 가까운 말벌에 자동 출격
  const si = S.scoutInterval();
  if (si > 0) {
    scoutT -= dt;
    if (scoutT <= 0) {
      scoutT = si;
      let near: Hornet | null = null, nd = Infinity;
      for (const h of hornets) {
        if (!h.alive) continue;
        const d = Math.hypot(h.x - cx, h.y - cy);
        if (d < nd) { nd = d; near = h; }
      }
      if (near) {
        dispatchTo(near, S.scoutCount(), true);
        ring(near.x, near.y, 6, 40, 0.3, 0x7ac8ff);
      }
    }
  }

  // 말벌
  const heatMult = S.heatMult(honey);
  let hottest = 0, balled = 0;
  for (const h of hornets) {
    if (!h.alive) continue;
    h.t += dt;
    if (h.waveT > 0) h.waveT -= dt;
    balled += h.attached;
    const rate = (h.boss ? S.bossHeatPerBee() : S.heatPerBee()) * heatMult;
    h.temp += (h.power * rate - S.cooling() * h.k.cool * (h.temp - BASE_TEMP)) * dt;
    if (h.atHive) h.temp += S.spikyHeat() * dt;

    // 페로몬 표식, 문지기: 벌이 알아서 계속 흘러간다
    if (h.marked) {
      h.markAcc += S.markRate() * dt;
      if (h.markAcc >= 6) { dispatchTo(h, Math.floor(h.markAcc), true); h.markAcc %= 1; }
    }
    if (h.atHive && lv.guard) {
      h.guardAcc += S.guardRate() * dt;
      if (h.guardAcc >= 6) { dispatchTo(h, Math.floor(h.guardAcc), true); h.guardAcc %= 1; }
    }

    // 독침: 공 안의 벌을 계속 죽인다. 공이 늦게 익을수록 손실이 커짐
    if (h.attached > 0) {
      h.stingT -= dt;
      if (h.stingT <= 0) {
        h.stingT = h.boss ? 0.3 : 0.42;
        // 공 크기에 비례해서 죽인다 (120마리 공이면 약 4마리). 근위대면 베테랑은 면역
        const ball = bees.filter(b => b.target === h && b.state === BALL && !(lv.royal && b.vet > 0));
        const tries = Math.floor(S.stingKills(h.attached) * h.k.sting + Math.random());
        for (let i = 0, k = 0; i < tries && k < ball.length; i++) {
          if (Math.random() >= S.stingKillChance()) continue;
          killBee(ball[k++], true);
          h.attached--;
          h.temp += S.martyrHeat();
        }
      }
    }
    if (h.temp >= HEAT_BALL_TEMP) { cook(h); continue; }
    const frac = Math.max(0, (h.temp - BASE_TEMP) / (HEAT_BALL_TEMP - BASE_TEMP));
    hottest = Math.max(hottest, frac);

    const dx = cx - h.x, dy = cy - h.y, d = Math.hypot(dx, dy) || 1;
    if (h.kind === 'hunter') {
      // 사냥말벌: 대기 벌떼 고리를 따라 돌며 가까운 벌을 낚아챈다. 공에 감기면 느려지고 사냥을 멈춘다
      const orbR = HIVE_R + 40 + Math.sqrt(bees.length) * 2.4;
      h.orbA += (h.speed / orbR) * 0.55 * dt / (1 + h.attached * 0.03);
      const tx = cx + Math.cos(h.orbA) * orbR, ty = cy + Math.sin(h.orbA) * orbR * 0.82;
      const ex = tx - h.x, ey = ty - h.y, ed = Math.hypot(ex, ey) || 1;
      const sp = Math.min(ed * 4, h.speed / (1 + h.attached * 0.011));
      h.x += ex / ed * sp * dt;
      h.y += ey / ed * sp * dt;
      h.s.rotation = Math.atan2(ey, ex);
      h.killT -= dt;
      if (h.killT <= 0 && ed < 60 && h.attached < 20) {
        h.killT = 0.35;
        let got = 0;
        for (const b of bees) {
          if (got >= 2) break;
          if (b.state !== IDLE || Math.hypot(b.x - h.x, b.y - h.y) > 34) continue;
          killBee(b);
          got++;
        }
      }
    } else if (!h.atHive) {
      if (d < HIVE_R + h.size * 0.6) h.atHive = true;
      const sp = h.speed / (1 + h.attached * 0.011);
      const weave = Math.sin(h.t * 3) * 34 / (1 + h.attached * 0.025);
      h.x += (dx / d * sp - dy / d * weave) * dt;
      h.y += (dy / d * sp + dx / d * weave) * dt;
      h.s.rotation = Math.atan2(dy, dx);
    } else {
      // 벌집 공격
      const press = h.attached < 48 ? 1 : 0.25;
      hiveHP -= h.k.dmg * press * S.hiveDamageMult() * dt;
      if (h.k.dmg > 0) waveHiveHit = true;
      h.killT -= dt;
      if (h.killT <= 0 && press === 1) {
        h.killT = 0.45;
        const near = bees
          .filter(b => b.state === IDLE && Math.hypot(b.x - h.x, b.y - h.y) < 160)
          .sort((a, b) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y));
        for (const v of near.slice(0, 4)) killBee(v);
        hiveFlash = 1;
        trauma = Math.min(1, trauma + 0.12);
        sfx.hiveHit();
      }
    }

    const jit = frac * frac * 2.5;
    h.s.position.set(h.x + rand(-jit, jit), h.y + rand(-jit, jit));
    h.s.tint = lerpColor(h.k.tint, 0xff5030, frac * 0.8);
    h.glow.visible = frac > 0.12 || h.kind === 'hunter';
    if (h.glow.visible && frac <= 0.12) {
      // 사냥말벌은 식어 있어도 보라빛 기운을 둘러 한눈에 구분되게
      h.glow.position.set(h.x, h.y);
      h.glow.scale.set(0.75 + Math.sin(h.t * 6) * 0.08);
      h.glow.alpha = 0.55;
      h.glow.tint = 0x8a50ff;
    } else if (h.glow.visible) {
      h.glow.position.set(h.x, h.y);
      h.glow.scale.set((h.size / 13) * (0.5 + frac * 1.5));
      h.glow.alpha = 0.25 + frac * 0.75;
      h.glow.tint = frac > 0.75 ? lerpColor(0xffa040, 0xfff4d0, (frac - 0.75) * 4) : 0xff6a10;
    }
    h.label.visible = h.attached > 0 || frac > 0.1 || h.marked;
    if (h.label.visible) {
      h.labelT -= dt;
      if (h.labelT <= 0) {
        h.labelT = 0.1;
        h.label.text = (h.marked ? '🎯 ' : '') + `${h.temp.toFixed(1)}°`;
      }
      h.label.position.set(h.x, h.y - h.size - 22 - Math.sqrt(h.attached) * 1.5);
      h.label.tint = frac > 0.8 ? 0xffffff : frac > 0.5 ? 0xffd040 : 0xffa060;
      h.label.scale.set((1 + frac * 0.35) * TEXT_K);
    }
  }
  hornets = hornets.filter(h => h.alive);
  bees = bees.filter(b => b.state !== -1);
  sfx.setBuzz(Math.min(1, balled / 120), hottest);
  hottestNow = hottest;


  // 파티클
  for (const p of particles) {
    p.life -= dt;
    const k = 1 - p.life / p.max;
    p.vx *= Math.exp(-p.drag * dt); p.vy *= Math.exp(-p.drag * dt);
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.s.position.set(p.x, p.y);
    p.s.scale.set(p.s0 + (p.s1 - p.s0) * k);
    p.s.alpha = p.a0 * (1 - k);
    if (p.life <= 0) p.s.destroy();
  }
  particles = particles.filter(p => p.life > 0);

  for (const p of popups) {
    p.life -= dt;
    p.t.y += p.vy * dt;
    p.vy *= Math.exp(-3 * dt);
    p.t.alpha = Math.min(1, p.life * 3);
    if (p.life <= 0) p.t.destroy();
  }
  popups = popups.filter(p => p.life > 0);

  if (inMenu) hiveHP = Math.max(hiveHP, S.maxHP() * 0.4); // 데모 벌집은 무너지지 않는다
  if (hiveHP <= 0) gameOver();
}

// 메뉴 뒤 데모의 자동 조종: 화면 안에서 무리가 가장 빽빽한 말벌을 골라 연쇄를 노린다
function demoPilot(dt: number) {
  demoT -= dt;
  if (demoT > 0) return;
  demoT = rand(0.28, 0.55);
  if (bees.filter(b => b.state === IDLE).length < 40) return;
  const w = vw(), ht = vh();
  const incoming = new Map<Hornet, number>();
  for (const b of bees) if (b.target && (b.state === FLY || b.state === BALL)) incoming.set(b.target, (incoming.get(b.target) ?? 0) + 1);
  const hm = S.heatMult(honey);
  let best: Hornet | null = null, bs = -Infinity;
  for (const h of hornets) {
    if (!h.alive || h.x < 110 || h.x > w - 110 || h.y < 90 || h.y > ht - 90) continue; // 날아 들어오는 모습이 보이게 조금 기다린다
    const rate = (h.boss ? S.bossHeatPerBee() : S.heatPerBee()) * hm;
    const eq = BASE_TEMP + (incoming.get(h) ?? 0) * rate / (S.cooling() * h.k.cool);
    if (eq > 49) continue; // 이미 충분히 익는 중
    let s = -Math.hypot(h.x - cx, h.y - cy) * 0.5;
    for (const o of hornets) if (o !== h && o.alive && Math.hypot(o.x - h.x, o.y - h.y) < 150) s += 120;
    if (s > bs) { bs = s; best = h; }
  }
  if (!best) return;
  ring(best.x, best.y, 4, 30, 0.3, 0xffe08a); // 보이지 않는 손가락이 누른 자리
  dispatchTo(best);
}

// 꿀 방울은 히트스톱 중에도 계속 날아간다
function updateDrops(dt: number) {
  for (const d of drops) {
    d.age += dt;
    if (d.age < 0.32) {
      d.vx *= Math.exp(-5 * dt); d.vy *= Math.exp(-5 * dt);
    } else {
      const dx = honeyTarget.x - d.x, dy = honeyTarget.y - d.y, dist = Math.hypot(dx, dy) || 1;
      const sp = 300 + (d.age - 0.32) * 2600;
      d.vx += (dx / dist * sp - d.vx) * Math.min(1, dt * 9);
      d.vy += (dy / dist * sp - d.vy) * Math.min(1, dt * 9);
      // 이번 스텝에 목표를 지나치면 수집 (프레임이 떨어져도 영원히 맴돌지 않게), 3초 지나면 무조건
      if (dist < 16 + Math.hypot(d.vx, d.vy) * dt || d.age > 3) {
        honey += d.value; totalHoney += d.value;
        d.age = -1;
        d.s.destroy();
        sfx.plink();
        honeyEl.classList.remove('bump');
        void honeyEl.offsetWidth;
        honeyEl.classList.add('bump');
        continue;
      }
    }
    d.x += d.vx * dt; d.y += d.vy * dt;
    d.s.position.set(d.x, d.y);
  }
  drops = drops.filter(d => d.age >= 0);
}

function lerpColor(a: number, b: number, t: number) {
  t = Math.max(0, Math.min(1, t));
  const ar = a >> 16, ag = (a >> 8) & 255, ab = a & 255;
  const br = b >> 16, bg_ = (b >> 8) & 255, bb = b & 255;
  return ((ar + (br - ar) * t) << 16) | ((ag + (bg_ - ag) * t) << 8) | (ab + (bb - ab) * t);
}

function fmt(n: number) {
  n = Math.floor(n);
  if (n < 10000) return n.toLocaleString();
  if (n < 1e6) return (n / 1000).toFixed(1) + 'K';
  return (n / 1e6).toFixed(2) + 'M';
}

// ── 최고 기록 (브라우저에만 저장, 못 쓰면 그냥 넘어간다) ──
const BEST_KEY = 'beeball47.best';
function loadBest(): { wave: number; kills: number; chain: number } {
  try { return { wave: 0, kills: 0, chain: 0, ...JSON.parse(localStorage.getItem(BEST_KEY) ?? '{}') }; }
  catch { return { wave: 0, kills: 0, chain: 0 }; }
}
function saveBest() {
  const b = loadBest();
  const nb = { wave: Math.max(b.wave, wave), kills: Math.max(b.kills, kills), chain: Math.max(b.chain, maxChain) };
  try { localStorage.setItem(BEST_KEY, JSON.stringify(nb)); } catch { /* 저장 불가 */ }
  return { prev: b, now: nb };
}

function gameOver() {
  over = true;
  sfx.setBuzz(0, 0);
  const { prev } = saveBest();
  const record = wave > prev.wave ? `<br><b style="color:#ffc21a">${t('over.record')}</b>` : '';
  $('over-stats').innerHTML =
    t('over.stats', { wave, record, kills, chain: maxChain, honey: fmt(totalHoney), lost: fmt(lostBees) });
  overEl.hidden = false;
  shopEl.hidden = true;
}

// ── 숨겨진 벌방: 숨은 조건 하나 또는 비밀 카드로 장착 슬롯 +1 (그 판에서만, 합쳐서 최대 2칸) ──
const secretEl = $('secret');
let secretsFound = new Set<string>();
let waveHiveHit = false; // 이번 웨이브에 벌집이 맞았는지 (무피해 조건)
function gainSlot(why: 'chain' | 'queen' | 'flawless' | 'card') {
  if (inMenu || extra.slots >= MAX_EXTRA) return;
  if (why !== 'card') {
    if (secretsFound.has(why)) return;
    secretsFound.add(why);
  }
  extra.slots++;
  secretEl.innerHTML = `<b>🗝️ ${t('secret.found')}</b><small>${t(`secret.${why}`)} · ${t('secret.slot')}</small>`;
  secretEl.classList.remove('go');
  void secretEl.offsetWidth;
  secretEl.classList.add('go');
  sfx.buy();
  renderSlots();
  if (!shopEl.hidden) renderShop();
}

// ── 상점 ──
const shopEl = $('shop'), cardsEl = $('cards'), slotsEl = $('slots'), slotsHudEl = $('slots-hud');
const shopMsgEl = $('shop-msg'), traitsEl = $('traits');
const rerollBtn = $('reroll') as HTMLButtonElement;
const repairBtn = $('repair') as HTMLButtonElement;
let shopCards: UpDef[] = [], sold = new Set<number>(), rerolls = 0, repairs = 0;
let freeUsed = false; // 밀랍 상인 무료 새로고침을 이번 상점에서 썼는지
let pending: number | null = null; // 슬롯이 가득 찬 상태에서 고른 새 카드

function openShop() {
  if (over) return;
  if (wave >= 8 && !waveHiveHit) gainSlot('flawless');
  const bonus = S.interest(honey) + S.waveBonus();
  honey += bonus;
  shopHead = { honey: waveHoney, lost: waveLost, bonus };
  renderShopHead();
  waveHoney = 0; waveLost = 0; rerolls = 0; freeUsed = false; pending = null;
  shopCards = rollCards(3);
  sold = new Set();
  renderShop();
  shopEl.hidden = false;
  shopEl.scrollTop = 0;
  document.body.classList.add('shop-open');
}

// rerolls는 유료 횟수만 센다. 상점 안에서 상인을 사도 바로 무료 1회가 생긴다
function rerollCost() { return S.freeReroll() && !freeUsed ? 0 : 10 + rerolls * 6; }
function repairCost() { return 40 + repairs * 20; }

// 상점 제목·부제 (언어를 바꾸면 다시 그릴 수 있게 숫자만 기억)
let shopHead = { honey: 0, lost: 0, bonus: 0 };
function renderShopHead() {
  $('shop-title').textContent = t('shop.title', { n: wave });
  $('shop-sub').innerHTML = t('shop.sub', { honey: fmt(shopHead.honey), lost: shopHead.lost }) +
    (shopHead.bonus ? t('shop.interest', { n: shopHead.bonus }) : '');
}

function renderSlots() {
  const cells: string[] = [];
  for (let i = 0; i < maxSlots(); i++) {
    const id = slots[i];
    const ex = i >= MAX_SLOTS ? ' extra' : ''; // 숨겨진 벌방으로 늘어난 칸
    if (!id) { cells.push(`<div class="slot empty${ex}"></div>`); continue; }
    const u = byId(id);
    const lit = u.tag !== 'base' && trait(u.tag) ? ' lit' : '';
    cells.push(`<div class="slot r${u.rarity}${lit}${ex}${pending !== null ? ' pick' : ''}" data-id="${id}" ${tipAttrs(u)}>` +
      `<span class="icon">${u.icon}</span><span class="lv">${lv[id]}</span></div>`);
  }
  slotsEl.innerHTML = cells.join('');
  slotsHudEl.innerHTML = cells.join('').replace(/ pick/g, '');
  slotsEl.querySelectorAll<HTMLElement>('.slot[data-id]').forEach(el =>
    el.addEventListener('click', () => replaceSlot(el.dataset.id as UpDef['id'])));
}

// 계열 현황: 장착 중인 계열만, 3장이면 보너스 켜짐
function renderTraits() {
  const html: string[] = [];
  for (const [tag, tg] of Object.entries(TAGS) as [keyof typeof TAGS, (typeof TAGS)[keyof typeof TAGS]][]) {
    const n = tagCount(tag);
    if (n === 0) continue;
    const on = n >= 3;
    html.push(`<div class="trait${on ? ' on' : ''}">${tg.icon} ${tg.name} ${Math.min(n, 3)}/3` +
      `<span>${on ? tg.bonus : t('trait.need', { bonus: tg.bonus })}</span></div>`);
  }
  traitsEl.innerHTML = html.join('');
}

function renderShop() {
  const rar = [t('rarity.0'), t('rarity.1'), t('rarity.2'), t('rarity.3')];
  const full = slots.length >= maxSlots();
  cardsEl.innerHTML = '';
  shopCards.forEach((u, i) => {
    const c = cost(u);
    const owned = slots.includes(u.id);
    const el = document.createElement('div');
    el.className = `card r${u.rarity}` + (sold.has(i) ? ' sold' : honey < c ? ' poor' : '') + (pending === i ? ' chosen' : '');
    const tag = u.instant ? t('card.secret') : owned ? t('card.owned', { a: lv[u.id], b: lv[u.id] + 1 }) : full ? t('card.full') : t('card.new');
    el.innerHTML =
      `<div class="rar">${rar[u.rarity]}${u.instant ? '' : ' · ' + (u.tag === 'base' ? t('card.base') : TAGS[u.tag].icon + ' ' + TAGS[u.tag].name)}</div><div class="icon">${u.icon}</div>` +
      `<div class="name">${u.name}</div><div class="desc">${u.desc}</div>` +
      `<div class="lvl${!owned && full && !u.instant ? ' warn' : ''}">${tag}</div><div class="price">🍯 ${c}</div>`;
    el.addEventListener('click', () => buy(i));
    cardsEl.appendChild(el);
  });
  shopMsgEl.textContent = pending !== null
    ? t('shop.pick', { name: shopCards[pending].name })
    : t('shop.slots', { n: slots.length, max: maxSlots() });
  shopMsgEl.classList.toggle('warn', pending !== null);
  renderSlots();
  renderTraits();
  rerollBtn.textContent = rerollCost() === 0 ? t('shop.rerollFree') : t('shop.reroll', { n: rerollCost() });
  rerollBtn.disabled = honey < rerollCost();
  repairBtn.textContent = t('shop.repair', { n: repairCost() });
  repairBtn.disabled = honey < repairCost() || hiveHP >= S.maxHP();
}

function buy(i: number) {
  const u = shopCards[i];
  const c = cost(u);
  if (sold.has(i) || honey < c) return;
  if (u.instant) {
    // 비밀 카드: 슬롯에 끼지 않고 바로 칸을 늘린다
    honey -= c;
    lv[u.id]++;
    gainSlot('card');
    finishBuy(i);
    return;
  }
  if (!slots.includes(u.id) && slots.length >= maxSlots()) {
    pending = pending === i ? null : i;
    renderShop();
    return;
  }
  honey -= c;
  equip(u.id);
  if (u.id === 'armor') hiveHP += 25;
  finishBuy(i);
}

function replaceSlot(oldId: UpDef['id']) {
  if (pending === null) return;
  const i = pending, u = shopCards[i], c = cost(u);
  pending = null;
  if (honey < c) { renderShop(); return; }
  honey -= c;
  unequip(oldId);
  equip(u.id);
  if (u.id === 'armor') hiveHP += 25;
  hiveHP = Math.min(hiveHP, S.maxHP());
  finishBuy(i);
}

function finishBuy(i: number) {
  sold.add(i);
  sfx.buy();
  renderShop();
  (cardsEl.children[i] as HTMLElement).classList.add('bought');
}

function doReroll() {
  const c = rerollCost();
  if (honey < c) return;
  honey -= c;
  if (c === 0) freeUsed = true;
  else rerolls++;
  pending = null;
  shopCards = rollCards(3);
  sold = new Set();
  sfx.reroll();
  renderShop();
}
function doRepair() {
  if (honey < repairCost()) return;
  honey -= repairCost();
  repairs++;
  hiveHP = Math.min(S.maxHP(), hiveHP + 30);
  sfx.buy();
  renderShop();
}
function doNext() {
  shopEl.hidden = true;
  document.body.classList.remove('shop-open');
  pending = null;
  waveState = 'break';
  waveTimer = 0.8;
}
rerollBtn.addEventListener('click', doReroll);
repairBtn.addEventListener('click', doRepair);
$('next').addEventListener('click', doNext);

function reset() {
  for (const b of bees) b.s.destroy();
  for (const h of hornets) { h.s.destroy(); h.glow.destroy(); h.label.destroy(); }
  for (const p of particles) p.s.destroy();
  for (const d of drops) d.s.destroy();
  for (const p of popups) p.t.destroy();
  bees = []; hornets = []; particles = []; drops = []; popups = [];
  honey = shownHoney = totalHoney = 0;
  hiveHP = 100; wave = 0; colony.wave = 0; waveState = 'break'; waveTimer = 1.2; toSpawn = 0;
  waveEl.textContent = 'WAVE 1';
  chain = maxChain = kills = lostBees = waveLost = waveHoney = 0;
  repairs = 0;
  secretsFound = new Set();
  freeze = trauma = scoutT = shopDelay = 0;
  over = false;
  overEl.hidden = true;
  shopEl.hidden = true;
  document.body.classList.remove('shop-open');
  resetUpgrades();
  renderSlots();
  for (let i = 0; i < S.maxBees(); i++) addBee(cx + rand(-60, 60), cy + rand(-60, 60));
}
$('restart').addEventListener('click', () => { sfx.init(); reset(); });

// ── 말풍선: 브라우저 기본 툴팁 대신 게임 스타일로. data-tip(제목) / data-tip-body(설명) / data-tip-r(등급 색) ──
const tipEl = $('tip');
function tipAttrs(u: UpDef) {
  const esc = (x: string) => x.replace(/"/g, '&quot;');
  return `data-tip="${esc(`${u.icon} ${u.name}`)}" data-tip-body="${esc(u.desc)}" data-tip-r="${u.rarity}"`;
}
let tipFor: HTMLElement | null = null;
function placeTip(x: number, y: number) {
  const r = tipEl.getBoundingClientRect();
  let tx = x + 14, ty = y - r.height - 12; // 기본은 포인터 오른쪽 위
  if (tx + r.width > innerWidth - 8) tx = x - r.width - 14;
  if (ty < 8) ty = y + 18;
  tipEl.style.transform = `translate(${Math.round(tx)}px, ${Math.round(ty)}px)`;
}
document.addEventListener('pointerover', (e) => {
  if (e.pointerType === 'touch') return;
  const el = (e.target as HTMLElement).closest?.('[data-tip]') as HTMLElement | null;
  if (!el || el === tipFor) return;
  tipFor = el;
  const body = el.dataset.tipBody;
  tipEl.innerHTML = `<b>${el.dataset.tip}</b>` + (body ? `<span>${body}</span>` : '');
  tipEl.className = `show r${el.dataset.tipR ?? 0}`;
  placeTip(e.clientX, e.clientY);
});
document.addEventListener('pointermove', (e) => { if (tipFor) placeTip(e.clientX, e.clientY); });
document.addEventListener('pointerout', (e) => {
  if (!tipFor) return;
  const to = e.relatedTarget as HTMLElement | null;
  if (to && tipFor.contains(to)) return;
  tipFor = null;
  tipEl.className = '';
});
document.addEventListener('pointerdown', () => { tipFor = null; tipEl.className = ''; });

// ── 메인 메뉴 ──
const menuEl = $('menu');
function refreshMenuText() {
  const b = loadBest();
  $('best').textContent = b.wave ? t('menu.best', { wave: b.wave, chain: b.chain }) : '';
  // 도감: 아직 도달 못 한 웨이브의 말벌은 흐리게
  $('codex-list').innerHTML = KIND_ORDER.map(kind => {
    const k = KINDS[kind], locked = k.from > 1 && b.wave < k.from;
    return `<div class="foe${locked ? ' locked' : ''}"><b>${locked ? '???' : k.name}</b>` +
      `${locked ? '' : k.desc + '<br>'}<i>${t('codex.from', { n: k.from })}</i></div>`;
  }).join('');
}
function showMenu() {
  refreshMenuText();
  inMenu = true;
  paused = false;
  pauseEl.hidden = true;
  menuEl.hidden = false;
  document.body.classList.add('in-menu');
  hintEl.style.opacity = '0';
  sfx.muted = true;
  sfx.apply();
  startDemo();
}
// 데모: 연쇄 카드를 몇 장 쥐여 주고 3웨이브부터 화려하게 돌린다
function startDemo() {
  reset();
  if (!opts.demo) return;
  for (const id of ['wave', 'wave', 'wave', 'heat', 'heat', 'frenzy', 'window'] as UpDef['id'][]) equip(id);
  wave = 2;
  waveTimer = 0.4;
}
function startGame() {
  sfx.init();
  reset();
  inMenu = false;
  menuEl.hidden = true;
  document.body.classList.remove('in-menu');
  hintEl.style.opacity = '';
  sfx.muted = false;
  sfx.apply();
}
$('start').addEventListener('click', startGame);
$('to-menu').addEventListener('click', showMenu);

// ── 창: 도감, 설정, 일시정지 ──
const codexEl = $('codex'), settingsEl = $('settings'), pauseEl = $('pause');
for (const el of [codexEl, settingsEl]) {
  el.querySelector('.close')!.addEventListener('click', () => (el.hidden = true));
  el.addEventListener('pointerdown', (e) => { if (e.target === el) el.hidden = true; }); // 바깥 누르면 닫기
}
$('open-codex').addEventListener('click', () => (codexEl.hidden = false));

const optVol = $('opt-volume') as HTMLInputElement, optVolV = $('opt-volume-v');
const optBuzz = $('opt-buzz') as HTMLInputElement, optShake = $('opt-shake') as HTMLInputElement;
const optLite = $('opt-lite') as HTMLInputElement, optDemo = $('opt-demo') as HTMLInputElement;
function openSettings() {
  optLang.value = lang;
  optVol.value = String(opts.volume); optVolV.textContent = String(opts.volume);
  optMusic.value = String(opts.music); optMusicV.textContent = String(opts.music);
  optBuzz.checked = opts.buzz; optShake.checked = opts.shake; optLite.checked = opts.lite; optDemo.checked = opts.demo;
  settingsEl.hidden = false;
}
const optMusic = $('opt-music') as HTMLInputElement, optMusicV = $('opt-music-v');
optMusic.addEventListener('input', () => {
  opts.music = Number(optMusic.value); optMusicV.textContent = optMusic.value;
  applyOpts();
});
optVol.addEventListener('input', () => {
  opts.volume = Number(optVol.value); optVolV.textContent = optVol.value;
  applyOpts();
  if (!inMenu) { sfx.init(); sfx.plink(); } // 크기 미리 듣기
});
optBuzz.addEventListener('change', () => { opts.buzz = optBuzz.checked; applyOpts(); });
optShake.addEventListener('change', () => { opts.shake = optShake.checked; applyOpts(); });
optLite.addEventListener('change', () => { opts.lite = optLite.checked; applyOpts(); });
optDemo.addEventListener('change', () => { opts.demo = optDemo.checked; applyOpts(); if (inMenu) startDemo(); });
// 언어: 고르면 고정 글자는 바로, 열려 있는 화면(메뉴·도감·상점)은 다시 그린다
const optLang = $('opt-lang') as HTMLSelectElement;
optLang.innerHTML = LANGS.map(l => `<option value="${l.id}">${l.label}</option>`).join('');
optLang.addEventListener('change', () => {
  opts.lang = optLang.value;
  setLang(optLang.value as Lang);
  applyOpts();
  refreshMenuText();
  if (!shopEl.hidden) { renderShopHead(); renderShop(); }
  renderSlots();
});
$('open-settings').addEventListener('click', openSettings);
$('pause-settings').addEventListener('click', openSettings);

function setPaused(p: boolean) {
  if (inMenu || over) p = false;
  paused = p;
  pauseEl.hidden = !p;
  sfx.setIntensity(musicIntensity());
  if (p) sfx.setBuzz(0, 0);
}
$('gear').addEventListener('click', () => setPaused(true));
$('resume').addEventListener('click', () => setPaused(false));
$('pause-menu').addEventListener('click', showMenu);

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (!settingsEl.hidden) settingsEl.hidden = true;
    else if (!codexEl.hidden) codexEl.hidden = true;
    else setPaused(!paused);
    return;
  }
  if (inMenu && codexEl.hidden && settingsEl.hidden && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); startGame(); }
});
// 다른 탭으로 가면 자동 일시정지
document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });

// 개발 중 자동 테스트용
if (import.meta.env.DEV) {
  (window as any).__g = {
    hornets: () => hornets.map(h => ({ x: h.x * VS + world.x, y: h.y * VS + world.y, temp: h.temp, attached: h.attached })),
    give: (n: number) => { honey += n; },
    spawn: (kind: Kind, x: number, y: number) => addHornet((x - world.x) / VS, (y - world.y) / VS, kind),
    prof: () => ({ ...prof }),
    offer: (id: UpDef['id']) => { shopCards[0] = byId(id); sold.delete(0); renderShop(); },
    secret: (why: 'chain' | 'queen' | 'flawless') => gainSlot(why),
    profReset: () => Object.assign(prof, { maxTickMs: 0, slowTicks: 0, frozen: 0, frames: 0 }),
    // 연쇄 재현: 한 점 주변에 말벌 n마리를 촘촘히 깔고 거의 익은 상태로 만든 뒤 하나를 누른다
    chainBench: (n: number) => {
      const px = cx + 260, py = cy - 120;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 220;
        addHornet(px + Math.cos(a) * r, py + Math.sin(a) * r, 'normal');
      }
      for (const h of hornets) { h.speed = 0; h.temp = rand(41, 45.5); }
      for (const h of hornets.slice(0, 6)) dispatchTo(h, 80);
    },
    slots: () => [...slots],
    shop: () => openShop(),
    eq: (id: string) => { equip(id as UpDef['id']); renderSlots(); },
    stats: () => ({ wave, honey: Math.round(honey), bees: bees.length, hiveHP: Math.round(hiveHP), kills, maxChain, lostBees, waveState }),
    // 밸런스 봇: 렌더링 없이 게임 시간을 직접 돌린다 (tools/balance.mjs)
    sim: {
      stop: () => app.ticker.stop(),
      reset: () => { reset(); inMenu = false; menuEl.hidden = true; document.body.classList.remove('in-menu'); },
      tick: (dt: number) => tick(dt),
      state: () => ({
        wave, waveState, honey, hiveHP, maxHP: S.maxHP(), bees: bees.length,
        idle: bees.filter(b => b.state === IDLE).length, kills, maxChain, lostBees, totalHoney, over,
        shopOpen: !shopEl.hidden, cx, cy,
      }),
      // 말벌마다 날아오는 벌까지 합친 예상 평형 온도
      hornets: () => {
        const incoming = new Map<Hornet, number>();
        for (const b of bees) {
          if (b.state !== FLY && b.state !== BALL) continue;
          incoming.set(b.target!, (incoming.get(b.target!) ?? 0) + S.vetMult(b.vet) * (b.auto ? S.autoMult() : 1));
        }
        const hm = S.heatMult(honey);
        return hornets.filter(h => h.alive).map(h => {
          const rate = (h.boss ? S.bossHeatPerBee() : S.heatPerBee()) * hm;
          const pw = incoming.get(h) ?? 0;
          return {
            ref: h, x: h.x, y: h.y, temp: h.temp, boss: h.boss, atHive: h.atHive,
            eq: BASE_TEMP + (pw * rate + (h.atHive ? S.spikyHeat() : 0)) / (S.cooling() * h.k.cool),
            distHive: Math.hypot(h.x - cx, h.y - cy),
          };
        });
      },
      click: (h: Hornet) => clickHornet(h),
      chainRadius: () => S.chainRadius(1),
      shop: () => ({
        cards: shopCards.map((u, i) => ({ i, id: u.id, tag: u.tag, rarity: u.rarity, cost: cost(u), sold: sold.has(i), owned: slots.includes(u.id) })),
        slots: slots.map(id => ({ id, tag: byId(id).tag, lv: lv[id] })),
        reroll: rerollCost(), repair: repairCost(), honey, maxSlots: maxSlots(),
      }),
      buy: (i: number) => buy(i),
      replace: (id: UpDef['id']) => replaceSlot(id),
      reroll: () => doReroll(),
      repair: () => doRepair(),
      next: () => doNext(),
    },
  };
}

// ── 루프 ──
window.addEventListener('resize', () => requestAnimationFrame(layout));
layout();
reset();
showMenu();

function tick(dt: number) {
  if (!over) {
    if (freeze > 0) freeze -= dt;
    else update(dt);
  }
  updateDrops(dt);
}

const hudCache = { honey: '', bees: '', hp: '' };

// 배경음악 긴장도: 말벌이 많고, 공이 뜨겁고, 벌집이 위험할수록 악기가 겹겹이 들어온다
function musicIntensity() {
  if (over) return 0;
  if (paused) return 0.1;
  if (inMenu) return 0.32;
  if (waveState === 'shop') return 0.12;
  if (hornets.some(h => h.boss)) return 1;
  let I = 0.4 + Math.min(0.3, hornets.length / 40) + hottestNow * 0.12;
  if (hiveHP < S.maxHP() * 0.35) I += 0.15;
  return Math.min(1, I * Math.min(1, 0.7 + wave * 0.06));
}

// 개발용 계측: 프레임마다 게임 로직 시간, 히트스톱으로 멈춘 시간
const prof = { maxTickMs: 0, slowTicks: 0, frozen: 0, frames: 0 };
app.ticker.add((tk) => {
  if (paused) return;
  const dt = Math.min(tk.deltaMS / 1000, 0.05);
  const t0 = performance.now();
  if (freeze > 0) prof.frozen += dt;
  tick(dt);
  const ms = performance.now() - t0;
  prof.frames++;
  prof.maxTickMs = Math.max(prof.maxTickMs, ms);
  if (ms > 8) prof.slowTicks++;

  trauma = Math.max(0, trauma - dt * 1.6);
  const sh = opts.shake ? trauma * trauma * (inMenu ? 6 : 18) : 0; // 메뉴 뒤에서는 살짝만
  world.x = rand(-sh, sh);
  world.y = rand(-sh, sh);

  sfx.setIntensity(musicIntensity());

  if (chainShow) {
    chainEl.textContent = t(chainShow >= 5 ? 'chainBig' : 'chain', { n: chainShow });
    chainEl.style.fontSize = `${Math.min(110, 38 + chainShow * 8)}px`;
    chainEl.classList.remove('go');
    void chainEl.offsetWidth;
    chainEl.classList.add('go');
    chainShow = 0;
  }
  if (beesHurt) {
    beesEl.classList.remove('hurt');
    void beesEl.offsetWidth;
    beesEl.classList.add('hurt');
    beesHurt = false;
  }

  hiveFlash = Math.max(0, hiveFlash - dt * 4);
  hive.tint = lerpColor(0xffffff, 0xff4020, hiveFlash);

  shownHoney += (honey - shownHoney) * Math.min(1, dt * 12);
  if (Math.abs(honey - shownHoney) < 0.5) shownHoney = honey;
  // DOM 글자는 바뀔 때만 (toLocaleString과 textContent 갱신이 매 프레임이면 아깝다)
  const hs = fmt(shownHoney), bs = `${fmt(bees.length)} / ${fmt(S.maxBees())}`, hp = `${Math.max(0, hiveHP / S.maxHP() * 100).toFixed(1)}%`;
  if (hs !== hudCache.honey) honeyEl.textContent = hudCache.honey = hs;
  if (bs !== hudCache.bees) beesEl.textContent = hudCache.bees = bs;
  if (hp !== hudCache.hp) hpEl.style.width = hudCache.hp = hp;
});
