// 밸런스 봇: 실제 게임 코드를 렌더링 없이 빠르게 돌려 빌드별 성적을 비교한다.
// 사용법: npm run dev 를 켠 상태에서  node tools/balance.mjs [판 수=2] [최대 웨이브=60] [빌드,빌드..] [스킬,스킬..]
// 한 판은 게임 시간 30분에서 끊는다 (그 이상 버티면 생존으로 기록)
import puppeteer from 'puppeteer-core';

const SEEDS = Number(process.argv[2] ?? 2);
const MAX_WAVE = Number(process.argv[3] ?? 60);
const MAX_MINUTES = 30;
const URL = 'http://localhost:5179/' + (process.env.TUNE ? '?' + process.env.TUNE : ''); // 예: TUNE='brood=16&waveLen=2'
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BUILDS = process.argv[4]?.split(',') ?? ['none', 'base', 'chain', 'sac', 'elite', 'econ', 'fort', 'auto'];
const ALL_SKILLS = { pro: 0.3, casual: 0.7 }; // 클릭 사이 반응 시간(초)
const SKILLS = Object.fromEntries(Object.entries(ALL_SKILLS).filter(([k]) => !process.argv[5] || process.argv[5].split(',').includes(k)));
const PARALLEL = 8;

// 페이지 안에서 한 판을 끝까지 돌린다
function playGame({ build, react, maxWave, maxMinutes }) {
  const g = window.__g.sim;
  g.stop();
  g.reset();
  const DT = 1 / 20; // 게임 루프가 허용하는 최대 간격(0.05초) 이내
  const BASE_PREF = { heat: 1.6, send: 1.4, cap: 1.2, insul: 1.1, brood: 1.0, wing: 0.6 };
  let t = 0, nextAct = 0, clicks = 0, shops = 0;
  const waveStart = {}, waveLen = {}; // 웨이브별 소요 시간 (게임 시간, 상점 제외)

  const pref = (c) => {
    if (c.id === 'hidden') return 9; // 비밀 카드는 보이면 산다
    if (build === 'none') return -1;
    if (c.tag === build) return 3 + (c.owned ? 1 : 0) + c.rarity * 0.5;
    if (c.tag === 'base') return (build === 'base' ? 1.5 : 0) + BASE_PREF[c.id] + (c.owned ? 0.5 : 0);
    return 0;
  };

  function shopPolicy() {
    shops++;
    let rerolls = 0;
    for (let guard = 0; guard < 30; guard++) {
      const st = g.state();
      const sh = g.shop();
      if (st.hiveHP < st.maxHP * 0.5 && sh.honey >= sh.repair) { g.repair(); continue; }
      const cands = sh.cards
        .filter(c => !c.sold && c.cost <= sh.honey && pref(c) > 0)
        .sort((a, b) => pref(b) - pref(a));
      let bought = false;
      for (const c of cands) {
        if (c.owned || c.id === 'hidden' || sh.slots.length < sh.maxSlots) { g.buy(c.i); bought = true; break; }
        // 슬롯이 가득: 가장 쓸모없는 카드와 교체할 가치가 있으면 교체
        const worst = sh.slots
          .map(s => ({ ...s, p: pref({ ...s, owned: true, rarity: 0 }) }))
          .sort((a, b) => a.p - b.p)[0];
        if (worst.p < pref(c) - 0.5) { g.buy(c.i); g.replace(worst.id); bought = true; break; }
      }
      if (bought) continue;
      const hasWanted = sh.cards.some(c => !c.sold && c.tag === build);
      if (build !== 'none' && !hasWanted && rerolls < 3 && sh.honey >= sh.reroll + 60) {
        g.reroll(); rerolls++; continue;
      }
      break;
    }
    g.next();
  }

  function act(st) {
    if (st.idle < 20) return;
    const hs = g.hornets().filter(h =>
      Math.abs(h.x - st.cx) < 640 && Math.abs(h.y - st.cy) < 400 && h.eq < 48.5);
    if (!hs.length) return;
    const R = g.chainRadius();
    const score = (h) => {
      let s = h.distHive;
      if (build === 'chain') {
        const n = hs.filter(o => o !== h && Math.hypot(o.x - h.x, o.y - h.y) < R * 0.6).length;
        s -= n * 120; // 무리 한가운데를 노림
      }
      return s;
    };
    hs.sort((a, b) => score(a) - score(b));
    g.click(hs[0].ref);
    clicks++;
  }

  while (true) {
    const st = g.state();
    if (st.wave && !(st.wave in waveStart)) waveStart[st.wave] = t;
    if (st.shopOpen && st.wave in waveStart && !(st.wave in waveLen)) waveLen[st.wave] = t - waveStart[st.wave];
    if (st.over || st.wave > maxWave || t > maxMinutes * 60) break;
    if (st.shopOpen) { shopPolicy(); continue; }
    if (t >= nextAct) {
      nextAct = t + react * (0.8 + Math.random() * 0.4);
      act(st);
    }
    g.tick(DT);
    t += DT;
  }
  const st = g.state();
  const sh = g.shop();
  const alive = g.hornets();
  return {
    bossAtDeath: st.over && alive.some(h => h.boss), aliveAtDeath: st.over ? alive.length : 0,
    wave: st.over ? st.wave : Math.min(st.wave, maxWave + 1), died: st.over,
    kills: st.kills, maxChain: st.maxChain, lost: st.lostBees, honey: Math.round(st.totalHoney),
    clicks, minutes: +(t / 60).toFixed(1), waveLen, slots: sh.slots.map(s => `${s.id}${s.lv}`).join(' '),
  };
}

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', protocolTimeout: 0,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
});

const jobs = [];
for (const skill of Object.keys(SKILLS))
  for (const build of BUILDS)
    for (let seed = 1; seed <= SEEDS; seed++) jobs.push({ skill, build, seed });

const results = [];
let done = 0;
const started = Date.now();
async function worker() {
  while (jobs.length) {
    const job = jobs.shift();
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.evaluateOnNewDocument((seed) => {
      let a = seed * 2654435761 >>> 0; // mulberry32
      Math.random = () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }, job.seed);
    await page.goto(URL, { waitUntil: 'networkidle0' });
    const r = await page.evaluate(playGame, { build: job.build, react: SKILLS[job.skill], maxWave: MAX_WAVE, maxMinutes: MAX_MINUTES });
    await page.close();
    results.push({ ...job, ...r });
    if (process.env.DEBUG) console.log(JSON.stringify(r));
    done++;
    const sec = ((Date.now() - started) / 1000).toFixed(0);
    console.log(`[${done}/${done + jobs.length}] ${sec}s ${job.skill.padEnd(6)} ${job.build.padEnd(5)} seed${job.seed} → wave ${r.wave}${r.died ? (r.bossAtDeath ? ' 💀여왕' : ' 💀') : '+'} 남은말벌 ${r.aliveAtDeath} kills ${r.kills} chain ${r.maxChain} lost ${r.lost} | ${r.slots}`);
  }
}
await Promise.all(Array.from({ length: PARALLEL }, worker));
await browser.close();

// 웨이브 길이: 구간별 평균 (초)
const BANDS = [[1, 3], [4, 6], [7, 10], [11, 15], [16, 25]];
console.log('\n=== 웨이브 길이 (초, 상점 제외) ===');
console.log('skill  ' + BANDS.map(([a, b]) => `w${a}-${b}`.padStart(8)).join(''));
for (const skill of Object.keys(SKILLS)) {
  const cells = BANDS.map(([a, b]) => {
    const xs = results.filter(r => r.skill === skill).flatMap(r => Object.entries(r.waveLen).filter(([w]) => w >= a && w <= b).map(([, v]) => v));
    return (xs.length ? (xs.reduce((s, x) => s + x, 0) / xs.length).toFixed(1) : '-').padStart(8);
  });
  console.log(skill.padEnd(7) + cells.join(''));
}

// 요약: 스킬 × 빌드별 평균
const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
console.log('\n=== 요약 (평균) ===');
console.log('skill  build  wave   kills  chain  lost   honey  clicks/min  minutes');
for (const skill of Object.keys(SKILLS)) {
  for (const build of BUILDS) {
    const rs = results.filter(r => r.skill === skill && r.build === build);
    if (!rs.length) continue;
    const cpm = avg(rs.map(r => r.clicks / Math.max(0.1, r.minutes)));
    console.log(
      `${skill.padEnd(6)} ${build.padEnd(6)} ${avg(rs.map(r => r.wave)).toFixed(1).padStart(5)} ` +
      `${avg(rs.map(r => r.kills)).toFixed(0).padStart(6)} ${avg(rs.map(r => r.maxChain)).toFixed(1).padStart(6)} ` +
      `${avg(rs.map(r => r.lost)).toFixed(0).padStart(6)} ${avg(rs.map(r => r.honey)).toFixed(0).padStart(7)} ${cpm.toFixed(0).padStart(8)} ${avg(rs.map(r => r.minutes)).toFixed(1).padStart(8)}`);
  }
}
