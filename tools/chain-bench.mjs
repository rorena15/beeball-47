// 연쇄 렉 측정: 말벌을 촘촘히 깔아 대형 연쇄를 일으키고 프레임 튐·로직 시간·히트스톱 시간·CPU 상위 함수를 출력한다
// 사용법: npx vite --port 5179 를 켠 상태에서  node tools/chain-bench.mjs
// (swiftshader 없이 실제 GPU로 돌린다. 소프트웨어 렌더러는 빈 화면도 80ms라 비교가 안 됨)
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new', args: ['--mute-audio'] });
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 800 });
await p.goto('http://localhost:5179/', { waitUntil: 'networkidle0' });
await p.click('#start');
await new Promise(r => setTimeout(r, 600));
const cdp = await p.createCDPSession();
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
await cdp.send('Profiler.start');
const r = await p.evaluate(() => new Promise(res => {
  const g = window.__g; g.profReset(); g.chainBench(60);
  const deltas = []; const t0 = performance.now(); let last = t0; const end = last + 5000; window.__spikes = [];
  const loop = (t) => { deltas.push(t - last); if (t - last > 40) window.__spikes.push(Math.round(t - t0) + "ms:" + Math.round(t - last)); last = t; if (t < end) requestAnimationFrame(loop); else res({ deltas, prof: g.prof(), stats: g.stats(), spikes: window.__spikes }); };
  requestAnimationFrame(loop);
}));
const { profile } = await cdp.send('Profiler.stop');
const d = r.deltas.slice(1).sort((a, c) => a - c);
console.log("spikes(at:len)", r.spikes.join(" "));
console.log(`real GPU: frames ${d.length} p50 ${d[d.length>>1].toFixed(1)} max ${d[d.length-1].toFixed(1)} | maxTick ${r.prof.maxTickMs.toFixed(1)}ms slow ${r.prof.slowTicks}/${r.prof.frames} frozen ${r.prof.frozen.toFixed(2)}s | chain ${r.stats.maxChain} kills ${r.stats.kills}`);
// self time by function
const dt = new Map(); const byId = new Map(profile.nodes.map(n => [n.id, n]));
for (let i = 0; i < profile.samples.length; i++) {
  const n = byId.get(profile.samples[i]); const cf = n.callFrame;
  const key = `${cf.functionName || '(anon)'} ${cf.url.split('/').pop().split('?')[0]}:${cf.lineNumber + 1}`;
  dt.set(key, (dt.get(key) ?? 0) + (profile.timeDeltas[i] ?? 0));
}
const tot = [...dt.values()].reduce((a, c) => a + c, 0);
for (const [k, v] of [...dt].sort((a, c) => c[1] - a[1]).slice(0, 22)) console.log((v / 1000).toFixed(0).padStart(6) + 'ms ' + (v / tot * 100).toFixed(1).padStart(5) + '%  ' + k);
await b.close();
