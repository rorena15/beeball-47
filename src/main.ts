import { Application, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { Sfx } from './audio';
import { MAX_SLOTS, S, TAGS, colony, byId, cost, equip, lv, resetUpgrades, rollCards, slots, tagCount, trait, unequip, type UpDef } from './upgrades';
import './style.css';

// ── 수치 (HEAT_BALL_TEMP는 Beecurity configs/constants.py의 HEAT_BALLING_TEMP_THRESHOLD) ──
// 강화로 바뀌는 수치는 upgrades.ts의 S
const HEAT_BALL_TEMP = 47;
const BASE_TEMP = 35;
const HIVE_R = 58;

const IDLE = 0, FLY = 1, BALL = 2;

interface Hornet {
  s: Sprite; glow: Sprite; label: Text;
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
interface Popup { t: Text; life: number; vy: number; }

const sfx = new Sfx();
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
let freeze = 0, trauma = 0, time = 0, beeSpawnT = 0, scoutT = 0, shopDelay = 0;
let over = false;
let honeyTarget = { x: 40, y: 30 };

function rand(a: number, b: number) { return a + Math.random() * (b - a); }

function layout() {
  cx = app.screen.width / 2;
  cy = app.screen.height / 2 + 10;
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
  const w = app.screen.width, h = app.screen.height;
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

function addHornet(x: number, y: number, boss: boolean) {
  const size = boss ? 26 : 13;
  const s = new Sprite(hornetTex);
  s.anchor.set(0.5);
  s.scale.set(size / 13);
  const glow = new Sprite(glowTex);
  glow.anchor.set(0.5);
  glow.blendMode = 'add';
  glow.visible = false;
  const label = new Text({
    text: '',
    style: { fontFamily: 'system-ui', fontSize: 15, fontWeight: '900', fill: 0xffffff, stroke: { color: 0x000000, width: 4 } },
  });
  label.anchor.set(0.5);
  label.visible = false;
  hornetLayer.addChild(s);
  glowLayer.addChild(glow);
  labelLayer.addChild(label);
  hornets.push({
    s, glow, label, x, y, temp: BASE_TEMP, attached: 0, size, boss, alive: true,
    t: Math.random() * 10, speed: boss ? 38 : Math.min(140, 68 + wave * 2.5), atHive: false, killT: 0, stingT: 0.4,
    power: 0, marked: false, markAcc: 0, guardAcc: 0, waveT: 0, waveChain: 0,
  });
}

function spawnGroup() {
  const n = Math.min(toSpawn, 1 + Math.floor(Math.random() * Math.min(5, 1 + wave / 2)));
  const ang = Math.random() * Math.PI * 2;
  const R = Math.max(app.screen.width, app.screen.height) * 0.62 + 40;
  for (let i = 0; i < n; i++) {
    const a = ang + rand(-0.12, 0.12);
    const rr = R + rand(0, 70);
    addHornet(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, false);
  }
  toSpawn -= n;
}

function burst(x: number, y: number, n: number, sp0: number, sp1: number, colors: number[], s0: number, s1: number, life: number) {
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
  const t = new Text({
    text,
    style: { fontFamily: 'system-ui', fontSize: size, fontWeight: '900', fill: color, stroke: { color: 0x2a1000, width: 5 } },
  });
  t.anchor.set(0.5);
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
  if (over) return;
  const x = e.clientX - world.x, y = e.clientY - world.y;
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

  // 연쇄 꿀 배율은 최대 ×3 (연쇄 숫자 자체는 계속 커짐)
  const gain = Math.round((h.boss ? 60 : 5) * Math.min(3, 1 + 0.25 * (chain - 1)) * S.honeyMult());
  waveHoney += gain;
  const R = S.chainRadius(chain) * (h.boss ? 1.5 : 1);
  freeze = h.boss ? 0.16 : 0.045 + Math.min(0.09, chain * 0.01);
  trauma = Math.min(1, trauma + (h.boss ? 0.9 : 0.3 + chain * 0.035));

  const k = h.boss ? 2 : 1;
  flash(h.x, h.y, 90 * k + chain * 6, 0.22, 0xfff0c0);
  burst(h.x, h.y, Math.min(80, 26 + chain * 4) * k, 120, 520 * k, [0xffd060, 0xffffff, 0xff8020, 0xffb030], 0.06, 0.16, 0.65);
  ring(h.x, h.y, h.size, R, 0.4, lv.frenzy && chain >= 3 ? 0xff4a20 : 0xff9a30);
  popup(h.x, h.y - 18, `+${gain}`, chain >= 3 ? 26 : 20, 0xffd23a);

  // 꿀 방울
  const nd = Math.min(46, 7 + chain * 2 + (h.boss ? 24 : 0));
  for (let i = 0; i < nd; i++) {
    const s = new Sprite(dotTex);
    s.anchor.set(0.5);
    s.tint = Math.random() < 0.3 ? 0xffe27a : 0xffb20a;
    s.scale.set(rand(0.6, 0.95));
    dropLayer.addChild(s);
    const a = Math.random() * Math.PI * 2, v = rand(140, 380);
    drops.push({ s, x: h.x + world.x, y: h.y + world.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0, value: gain / nd });
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

  if (chain >= 2) {
    chainEl.textContent = chain >= 5 ? `${chain} CHAIN!!` : `${chain} CHAIN`;
    chainEl.style.fontSize = `${Math.min(110, 38 + chain * 8)}px`;
    chainEl.classList.remove('go');
    void chainEl.offsetWidth;
    chainEl.classList.add('go');
  }
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
  beesEl.classList.remove('hurt');
  void beesEl.offsetWidth;
  beesEl.classList.add('hurt');
}

// ── 웨이브 ──
function startWave() {
  wave++;
  colony.wave = wave;
  waveState = 'spawn';
  toSpawn = 6 + Math.floor(wave * 2 + wave * wave * 0.1);
  spawnT = 0.5;
  waveEl.textContent = `WAVE ${wave}`;
  bannerEl.textContent = wave % 5 === 0 ? `WAVE ${wave} · 여왕말벌` : `WAVE ${wave}`;
  bannerEl.classList.remove('go');
  void bannerEl.offsetWidth;
  bannerEl.classList.add('go');
  if (wave % 5 === 0) {
    const a = Math.random() * Math.PI * 2, R = Math.max(app.screen.width, app.screen.height) * 0.62 + 60;
    addHornet(cx + Math.cos(a) * R, cy + Math.sin(a) * R, true);
  }
}

// ── 업데이트 ──
function update(dt: number) {
  time += dt;

  // 웨이브
  if (waveState === 'break') {
    waveTimer -= dt;
    if (waveTimer <= 0) startWave();
  } else if (waveState === 'spawn') {
    spawnT -= dt;
    if (toSpawn > 0 && spawnT <= 0) {
      spawnGroup();
      if (toSpawn > 0 && Math.random() < 0.35) spawnGroup(); // 다른 방향에서 동시에
      spawnT = Math.max(0.3, 1.1 - wave * 0.08) * rand(0.6, 1.4);
    }
    if (toSpawn === 0 && hornets.every(h => !h.alive) && drops.length === 0) {
      waveState = 'shop';
      shopDelay = 0.5;
    }
  }

  if (waveState === 'shop' && shopDelay > 0) {
    shopDelay -= dt;
    if (shopDelay <= 0) openShop();
  }

  // 번식: 꿀과 무관하게 최대치까지 일정 속도로 채워짐 (상점에서는 빠르게)
  const cap = S.maxBees();
  beeSpawnT -= dt * (waveState === 'shop' ? 4 : 1);
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
    h.temp += (h.power * rate - S.cooling() * (h.temp - BASE_TEMP)) * dt;
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
        const tries = Math.floor(S.stingKills(h.attached) + Math.random());
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
    if (!h.atHive) {
      if (d < HIVE_R + h.size * 0.6) h.atHive = true;
      const sp = h.speed / (1 + h.attached * 0.011);
      const weave = Math.sin(h.t * 3) * 34 / (1 + h.attached * 0.025);
      h.x += (dx / d * sp - dy / d * weave) * dt;
      h.y += (dy / d * sp + dx / d * weave) * dt;
      h.s.rotation = Math.atan2(dy, dx);
    } else {
      // 벌집 공격
      const press = h.attached < 48 ? 1 : 0.25;
      hiveHP -= (h.boss ? 9 : 4) * press * S.hiveDamageMult() * dt;
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
    h.s.tint = lerpColor(0xffffff, 0xff5030, frac * 0.8);
    h.glow.visible = frac > 0.12;
    if (h.glow.visible) {
      h.glow.position.set(h.x, h.y);
      h.glow.scale.set((h.size / 13) * (0.5 + frac * 1.5));
      h.glow.alpha = 0.25 + frac * 0.75;
      h.glow.tint = frac > 0.75 ? lerpColor(0xffa040, 0xfff4d0, (frac - 0.75) * 4) : 0xff6a10;
    }
    h.label.visible = h.attached > 0 || frac > 0.1 || h.marked;
    if (h.label.visible) {
      h.label.text = (h.marked ? '🎯 ' : '') + `${h.temp.toFixed(1)}°`;
      h.label.position.set(h.x, h.y - h.size - 22 - Math.sqrt(h.attached) * 1.5);
      h.label.style.fill = frac > 0.8 ? 0xffffff : frac > 0.5 ? 0xffd040 : 0xffa060;
      h.label.scale.set(1 + frac * 0.35);
    }
  }
  hornets = hornets.filter(h => h.alive);
  bees = bees.filter(b => b.state !== -1);
  sfx.setBuzz(Math.min(1, balled / 120), hottest);


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

  if (hiveHP <= 0) gameOver();
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

function gameOver() {
  over = true;
  sfx.setBuzz(0, 0);
  $('over-stats').innerHTML =
    `WAVE ${wave} 도달<br>익힌 말벌 ${kills}마리 · 최대 연쇄 ${maxChain}<br>모은 꿀 ${fmt(totalHoney)} · 잃은 벌 ${fmt(lostBees)}마리`;
  overEl.hidden = false;
  shopEl.hidden = true;
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
  const bonus = S.interest(honey) + S.waveBonus();
  honey += bonus;
  $('shop-title').textContent = `WAVE ${wave} 방어 성공`;
  $('shop-sub').innerHTML =
    `꿀 +${fmt(waveHoney)} · 잃은 벌 ${waveLost}마리` + (bonus ? ` · 이자 +${bonus}` : '');
  waveHoney = 0; waveLost = 0; rerolls = 0; freeUsed = false; pending = null;
  shopCards = rollCards(3);
  sold = new Set();
  renderShop();
  shopEl.hidden = false;
}

// rerolls는 유료 횟수만 센다. 상점 안에서 상인을 사도 바로 무료 1회가 생긴다
function rerollCost() { return S.freeReroll() && !freeUsed ? 0 : 10 + rerolls * 6; }
function repairCost() { return 40 + repairs * 20; }

function renderSlots() {
  const cells: string[] = [];
  for (let i = 0; i < MAX_SLOTS; i++) {
    const id = slots[i];
    if (!id) { cells.push(`<div class="slot empty"></div>`); continue; }
    const u = byId(id);
    const lit = u.tag !== 'base' && trait(u.tag) ? ' lit' : '';
    cells.push(`<div class="slot r${u.rarity}${lit}${pending !== null ? ' pick' : ''}" data-id="${id}" title="${u.name}: ${u.desc}">` +
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
  for (const [tag, t] of Object.entries(TAGS) as [keyof typeof TAGS, (typeof TAGS)[keyof typeof TAGS]][]) {
    const n = tagCount(tag);
    if (n === 0) continue;
    const on = n >= 3;
    html.push(`<div class="trait${on ? ' on' : ''}">${t.icon} ${t.name} ${Math.min(n, 3)}/3` +
      `<span>${on ? t.bonus : '3장: ' + t.bonus}</span></div>`);
  }
  traitsEl.innerHTML = html.join('');
}

function renderShop() {
  const rar = ['일반', '희귀', '전설'];
  const full = slots.length >= MAX_SLOTS;
  cardsEl.innerHTML = '';
  shopCards.forEach((u, i) => {
    const c = cost(u);
    const owned = slots.includes(u.id);
    const el = document.createElement('div');
    el.className = `card r${u.rarity}` + (sold.has(i) ? ' sold' : honey < c ? ' poor' : '') + (pending === i ? ' chosen' : '');
    const tag = owned ? `Lv ${lv[u.id]} → ${lv[u.id] + 1}` : full ? '슬롯 가득 · 교체 필요' : '새 카드';
    el.innerHTML =
      `<div class="rar">${rar[u.rarity]} · ${u.tag === 'base' ? '기본' : TAGS[u.tag].icon + ' ' + TAGS[u.tag].name}</div><div class="icon">${u.icon}</div>` +
      `<div class="name">${u.name}</div><div class="desc">${u.desc}</div>` +
      `<div class="lvl${!owned && full ? ' warn' : ''}">${tag}</div><div class="price">🍯 ${c}</div>`;
    el.addEventListener('click', () => buy(i));
    cardsEl.appendChild(el);
  });
  shopMsgEl.textContent = pending !== null
    ? `버릴 카드를 고르세요 (${shopCards[pending].name} 장착) · 카드를 다시 누르면 취소`
    : `장착 카드 ${slots.length} / ${MAX_SLOTS}`;
  shopMsgEl.classList.toggle('warn', pending !== null);
  renderSlots();
  renderTraits();
  rerollBtn.textContent = rerollCost() === 0 ? '새로고침 · 무료' : `새로고침 🍯 ${rerollCost()}`;
  rerollBtn.disabled = honey < rerollCost();
  repairBtn.textContent = `벌집 수리 +30 🍯 ${repairCost()}`;
  repairBtn.disabled = honey < repairCost() || hiveHP >= S.maxHP();
}

function buy(i: number) {
  const u = shopCards[i];
  const c = cost(u);
  if (sold.has(i) || honey < c) return;
  if (!slots.includes(u.id) && slots.length >= MAX_SLOTS) {
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
  chain = maxChain = kills = lostBees = waveLost = waveHoney = 0;
  repairs = 0;
  freeze = trauma = scoutT = shopDelay = 0;
  over = false;
  overEl.hidden = true;
  shopEl.hidden = true;
  resetUpgrades();
  renderSlots();
  for (let i = 0; i < S.maxBees(); i++) addBee(cx + rand(-60, 60), cy + rand(-60, 60));
}
$('restart').addEventListener('click', () => { sfx.init(); reset(); });

// 개발 중 자동 테스트용
if (import.meta.env.DEV) {
  (window as any).__g = {
    hornets: () => hornets.map(h => ({ x: h.x + world.x, y: h.y + world.y, temp: h.temp, attached: h.attached })),
    give: (n: number) => { honey += n; },
    slots: () => [...slots],
    shop: () => openShop(),
    eq: (id: string) => { equip(id as UpDef['id']); renderSlots(); },
    stats: () => ({ wave, honey: Math.round(honey), bees: bees.length, hiveHP: Math.round(hiveHP), kills, maxChain, lostBees, waveState }),
    // 밸런스 봇: 렌더링 없이 게임 시간을 직접 돌린다 (tools/balance.mjs)
    sim: {
      stop: () => app.ticker.stop(),
      reset: () => reset(),
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
            eq: BASE_TEMP + pw * rate / S.cooling() + (h.atHive ? S.spikyHeat() / S.cooling() : 0),
            distHive: Math.hypot(h.x - cx, h.y - cy),
          };
        });
      },
      click: (h: Hornet) => clickHornet(h),
      chainRadius: () => S.chainRadius(1),
      shop: () => ({
        cards: shopCards.map((u, i) => ({ i, id: u.id, tag: u.tag, rarity: u.rarity, cost: cost(u), sold: sold.has(i), owned: slots.includes(u.id) })),
        slots: slots.map(id => ({ id, tag: byId(id).tag, lv: lv[id] })),
        reroll: rerollCost(), repair: repairCost(), honey,
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

function tick(dt: number) {
  if (!over) {
    if (freeze > 0) freeze -= dt;
    else update(dt);
  }
  updateDrops(dt);
}

app.ticker.add((tk) => {
  const dt = Math.min(tk.deltaMS / 1000, 0.05);
  tick(dt);

  trauma = Math.max(0, trauma - dt * 1.6);
  const sh = trauma * trauma * 18;
  world.x = rand(-sh, sh);
  world.y = rand(-sh, sh);

  hiveFlash = Math.max(0, hiveFlash - dt * 4);
  hive.tint = lerpColor(0xffffff, 0xff4020, hiveFlash);

  shownHoney += (honey - shownHoney) * Math.min(1, dt * 12);
  if (Math.abs(honey - shownHoney) < 0.5) shownHoney = honey;
  honeyEl.textContent = fmt(shownHoney);
  hpEl.style.width = `${Math.max(0, hiveHP / S.maxHP() * 100)}%`;
  beesEl.textContent = `${fmt(bees.length)} / ${fmt(S.maxBees())}`;
});
