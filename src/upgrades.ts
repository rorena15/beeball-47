// 웨이브 사이 상점에서 꿀로 사는 카드. 장착 슬롯에 있는 카드만 효과가 있다.
// 같은 계열(tag) 카드를 3장 장착하면 계열 보너스가 켜진다.

export type Tag = 'base' | 'chain' | 'sac' | 'elite' | 'econ' | 'fort' | 'auto';

export type UpId =
  | 'heat' | 'send' | 'brood' | 'cap' | 'wing' | 'insul'
  | 'wave' | 'window' | 'fuse' | 'frenzy'
  | 'martyr' | 'mhoney' | 'berserk' | 'phoenix'
  | 'elite' | 'veteran' | 'tough' | 'resist' | 'royal'
  | 'honey' | 'interest' | 'jelly' | 'merchant'
  | 'armor' | 'spiky' | 'guard'
  | 'scout' | 'mark' | 'alarm';

export interface UpDef {
  id: UpId;
  tag: Tag;
  icon: string;
  name: string;
  desc: string;
  rarity: 0 | 1 | 2; // 일반 / 희귀 / 전설
  max: number;
}

export const TAGS: Record<Exclude<Tag, 'base'>, { icon: string; name: string; bonus: string }> = {
  chain: { icon: '🔗', name: '연쇄', bonus: '열파 +2°C' },
  sac: { icon: '🕯️', name: '희생', bonus: '과열사한 벌 1마리당 열파 +0.3°C' },
  elite: { icon: '⚔️', name: '정예', bonus: '비행 속도 +40%, 독침 사망 −30%' },
  econ: { icon: '💰', name: '경제', bonus: '웨이브마다 꿀 +30' },
  fort: { icon: '🏰', name: '요새', bonus: '벌집 피해 −50%' },
  auto: { icon: '🤖', name: '자동', bonus: '자동 출격 간격 −40%' },
};

export const UPGRADES: UpDef[] = [
  // 기본: 계열 없음
  { id: 'heat', tag: 'base', icon: '🔥', name: '날갯짓 발열', desc: '벌 한 마리당 발열 +15%', rarity: 0, max: 8 },
  { id: 'send', tag: 'base', icon: '🐝', name: '출격 규모', desc: '한 번에 보내는 벌 +20마리', rarity: 0, max: 8 },
  { id: 'brood', tag: 'base', icon: '🥚', name: '육아벌', desc: '벌 번식 속도 +35%', rarity: 0, max: 8 },
  { id: 'cap', tag: 'base', icon: '🏠', name: '벌방 증설', desc: '최대 벌 수 +140', rarity: 0, max: 8 },
  { id: 'wing', tag: 'base', icon: '💨', name: '날개 근육', desc: '벌 비행 속도 +18%', rarity: 0, max: 5 },
  { id: 'insul', tag: 'base', icon: '🧱', name: '밀랍 단열', desc: '공이 식는 속도 −12%', rarity: 0, max: 5 },

  // 연쇄: 하나 익혀서 무리 전체를 터뜨린다
  { id: 'wave', tag: 'chain', icon: '♨️', name: '열파 증폭', desc: '열파 +2°C, 범위 +8%', rarity: 0, max: 6 },
  { id: 'window', tag: 'chain', icon: '⛓️', name: '연쇄 페로몬', desc: '연쇄 유지 시간 +0.3초', rarity: 0, max: 5 },
  { id: 'fuse', tag: 'chain', icon: '🧨', name: '도화선', desc: '연쇄가 끊겨도 0이 아니라 절반에서 다시 시작', rarity: 1, max: 1 },
  { id: 'frenzy', tag: 'chain', icon: '🌋', name: '연쇄 폭주', desc: '3연쇄부터 열파 1.6배, 범위 +30%, 연쇄 감쇠 없음', rarity: 2, max: 1 },

  // 희생: 벌을 소모품처럼 갈아 넣는다
  { id: 'martyr', tag: 'sac', icon: '🩸', name: '희생 발열', desc: '공 안에서 벌이 죽을 때마다 +0.15°C', rarity: 1, max: 3 },
  { id: 'mhoney', tag: 'sac', icon: '⚱️', name: '순교자의 꿀', desc: '벌이 죽을 때마다 꿀 +0.05', rarity: 0, max: 4 },
  { id: 'berserk', tag: 'sac', icon: '😡', name: '광란', desc: '독침에 죽는 벌 2배, 대신 발열 +40%', rarity: 1, max: 1 },
  { id: 'phoenix', tag: 'sac', icon: '🐦‍🔥', name: '불사조', desc: '공 안에서 죽은 벌의 20%가 벌집에서 즉시 부화', rarity: 2, max: 2 },

  // 정예: 적게 보내고 오래 살린다
  { id: 'elite', tag: 'elite', icon: '🎖️', name: '정예 소대', desc: '출격 수 절반, 벌 한 마리 발열 1.7배', rarity: 1, max: 1 },
  { id: 'veteran', tag: 'elite', icon: '⭐', name: '베테랑', desc: '열구에서 살아남은 벌은 발열 +20% (3번까지 중첩)', rarity: 1, max: 2 },
  { id: 'tough', tag: 'elite', icon: '🛡️', name: '단단한 외골격', desc: '독침에 죽을 확률 −20%', rarity: 0, max: 5 },
  { id: 'resist', tag: 'elite', icon: '🌡️', name: '열 내성', desc: '열구 성공 시 과열사 −35%', rarity: 0, max: 4 },
  { id: 'royal', tag: 'elite', icon: '👑', name: '근위대', desc: '베테랑 벌은 독침에 죽지 않음', rarity: 2, max: 1 },

  // 경제: 꿀을 쌓아 힘으로 바꾼다
  { id: 'honey', tag: 'econ', icon: '🍯', name: '꿀 감별', desc: '꿀 획득 +25%', rarity: 0, max: 6 },
  { id: 'interest', tag: 'econ', icon: '🏦', name: '꿀 저장고', desc: '웨이브마다 보유 꿀의 10% 이자 (최대 +40)', rarity: 1, max: 3 },
  { id: 'jelly', tag: 'econ', icon: '🫙', name: '로열젤리', desc: '보유 꿀 100마다 발열 +4% (최대 +60%)', rarity: 1, max: 2 },
  { id: 'merchant', tag: 'econ', icon: '🪙', name: '밀랍 상인', desc: '카드 값 −15%, 상점마다 첫 새로고침 무료', rarity: 0, max: 2 },

  // 요새: 벌집까지 끌어들여 잡는다
  { id: 'armor', tag: 'fort', icon: '🏯', name: '밀랍 성벽', desc: '벌집 최대 체력 +25 (즉시 채움)', rarity: 0, max: 6 },
  { id: 'spiky', tag: 'fort', icon: '🌵', name: '가시 벌집', desc: '벌집에 붙은 말벌은 초당 +4°C', rarity: 1, max: 3 },
  { id: 'guard', tag: 'fort', icon: '💂', name: '문지기', desc: '벌집에 붙은 말벌에게 대기 벌이 자동으로 달려듦', rarity: 1, max: 3 },

  // 자동: 덜 클릭하고 벌이 알아서 싸운다
  { id: 'scout', tag: 'auto', icon: '🔭', name: '정찰벌', desc: '3초마다 벌집에 가장 가까운 말벌에 자동 출격', rarity: 1, max: 3 },
  { id: 'mark', tag: 'auto', icon: '🎯', name: '페로몬 표식', desc: '클릭한 말벌이 익을 때까지 벌이 계속 흘러감', rarity: 1, max: 2 },
  { id: 'alarm', tag: 'auto', icon: '🚨', name: '경보 페로몬', desc: '자동으로 출격한 벌의 발열 +60%', rarity: 2, max: 1 },
];

const BASE_COST = [60, 130, 280];

export const lv = Object.fromEntries(UPGRADES.map(u => [u.id, 0])) as Record<UpId, number>;

// 벌집은 웨이브마다 스스로 자란다 (상점과 별개로 힘이 꾸준히 늘어남)
export const colony = { wave: 0 };

export const MAX_SLOTS = 5;
export const slots: UpId[] = [];

export const byId = (id: UpId) => UPGRADES.find(u => u.id === id)!;

export function resetUpgrades() {
  for (const k in lv) lv[k as UpId] = 0;
  slots.length = 0;
}

export function equip(id: UpId) {
  if (!slots.includes(id)) slots.push(id);
  lv[id]++;
}

export function unequip(id: UpId) {
  const i = slots.indexOf(id);
  if (i >= 0) slots.splice(i, 1);
  lv[id] = 0;
}

export function tagCount(tag: Tag) {
  return slots.filter(id => byId(id).tag === tag).length;
}

/** 계열 보너스 켜짐 여부 (같은 계열 3장) */
export const trait = (tag: Exclude<Tag, 'base'>) => tagCount(tag) >= 3;

export function cost(u: UpDef) {
  return Math.round(BASE_COST[u.rarity] * Math.pow(1.6, lv[u.id]) * Math.pow(0.85, lv.merchant));
}

/** 가중치 랜덤으로 서로 다른 카드 n장. 이미 장착한 계열은 더 잘 나온다 */
export function rollCards(n: number): UpDef[] {
  const weight = [62, 30, 8];
  const owned = new Set(slots.map(id => byId(id).tag));
  const w = (u: UpDef) => weight[u.rarity] * (u.tag !== 'base' && owned.has(u.tag) ? 1.8 : 1);
  const pool = UPGRADES.filter(u => lv[u.id] < u.max);
  const out: UpDef[] = [];
  while (out.length < n && pool.length) {
    const total = pool.reduce((s, u) => s + w(u), 0);
    let r = Math.random() * total;
    let i = 0;
    for (; i < pool.length - 1; i++) {
      r -= w(pool[i]);
      if (r <= 0) break;
    }
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}

// 카드가 반영된 수치. honey가 필요한 건 인자로 받는다
export const S = {
  heatMult: (honey: number) =>
    (1 + 0.15 * lv.heat) * (lv.elite ? 1.7 : 1) * (lv.berserk ? 1.4 : 1) *
    (1 + Math.min(0.6, Math.floor(honey / 100) * 0.04 * lv.jelly)),
  heatPerBee: () => 0.11,
  bossHeatPerBee: () => 0.06,
  vetMult: (vet: number) => (lv.veteran ? 1 + 0.2 * vet * (1 + 0.3 * (lv.veteran - 1)) : 1),
  autoMult: () => (lv.alarm ? 1.6 : 1),
  cooling: () => 0.4 * Math.pow(0.88, lv.insul),
  sendCount: () => Math.round((60 + 20 * lv.send) * (lv.elite ? 0.5 : 1)),
  broodRate: () => 16 * (1 + 0.35 * lv.brood) * (1 + 0.08 * colony.wave),
  maxBees: () => 600 + 140 * lv.cap + 45 * colony.wave,
  beeSpeed: () => 560 * (1 + 0.18 * lv.wing) * (trait('elite') ? 1.4 : 1),
  honeyMult: () => 1 + 0.25 * lv.honey,
  stingKills: (attached: number) => attached * (lv.berserk ? 0.07 : 0.035),
  stingKillChance: () => 0.85 * Math.pow(0.8, lv.tough) * (trait('elite') ? 0.7 : 1),
  overheatRate: () => 0.07 * Math.pow(0.65, lv.resist),
  // 연쇄가 이어질수록 열파가 ×0.8씩 약해진다 (연쇄 폭주는 3연쇄부터 감쇠 무시)
  chainHeat: (chain: number) => {
    const frenzy = lv.frenzy && chain >= 3;
    const decay = frenzy ? 1 : Math.pow(0.85, chain - 1);
    return (6 + 2 * lv.wave + (trait('chain') ? 2 : 0)) * decay * (frenzy ? 1.6 : 1);
  },
  chainRadius: (chain: number) => 180 * (1 + 0.08 * lv.wave) * (lv.frenzy && chain >= 3 ? 1.3 : 1),
  chainWindow: () => 1.3 + 0.3 * lv.window,
  martyrHeat: () => 0.15 * lv.martyr,
  sacHeatPerDead: () => (trait('sac') ? 0.3 : 0),
  deathHoney: () => 0.05 * lv.mhoney,
  phoenixChance: () => 0.2 * lv.phoenix,
  maxHP: () => 100 + 25 * lv.armor,
  hiveDamageMult: () => (trait('fort') ? 0.5 : 1),
  spikyHeat: () => 4 * lv.spiky,
  guardRate: () => 30 * lv.guard,
  scoutInterval: () => (lv.scout ? 3 / (1 + 0.35 * (lv.scout - 1)) * (trait('auto') ? 0.6 : 1) : 0),
  scoutCount: () => Math.round(S.sendCount() * 0.4),
  markRate: () => S.sendCount() * 0.5 * lv.mark * (trait('auto') ? 1.4 : 1),
  interest: (honey: number) => (lv.interest ? Math.min(40 * lv.interest, Math.floor(honey * 0.1 * lv.interest)) : 0),
  waveBonus: () => (trait('econ') ? 30 : 0),
  freeReroll: () => lv.merchant > 0,
};
