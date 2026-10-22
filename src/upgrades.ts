// 웨이브 사이 상점에서 꿀로 사는 카드. 장착 슬롯에 있는 카드만 효과가 있다.
// 같은 계열(tag) 카드를 3장 장착하면 계열 보너스가 켜진다.
import { t, type Key } from './i18n';

export type Tag = 'base' | 'chain' | 'sac' | 'elite' | 'econ' | 'fort' | 'auto';

export type UpId =
  | 'heat' | 'send' | 'brood' | 'cap' | 'wing' | 'insul'
  | 'wave' | 'window' | 'fuse' | 'frenzy'
  | 'martyr' | 'mhoney' | 'berserk' | 'phoenix'
  | 'elite' | 'veteran' | 'tough' | 'resist' | 'royal'
  | 'honey' | 'interest' | 'jelly' | 'merchant'
  | 'armor' | 'spiky' | 'guard'
  | 'scout' | 'mark' | 'alarm'
  | 'hidden';

// 이름·설명 글자는 i18n.ts 사전에 있다 (up.<id>.name / .desc). 여기서는 읽기 전용 속성으로 붙인다
export interface UpDef {
  id: UpId;
  tag: Tag;
  icon: string;
  readonly name: string;
  readonly desc: string;
  rarity: 0 | 1 | 2 | 3; // 일반 / 희귀 / 전설 / 비밀
  instant?: boolean; // 슬롯에 끼지 않고 사는 즉시 효과
  max: number;
}

// 이름 같은 글자는 현재 언어로 그때그때 읽는다
const tag = (id: string, icon: string) => ({
  icon,
  get name() { return t(`tag.${id}.name` as Key); },
  get bonus() { return t(`tag.${id}.bonus` as Key); },
});
export const TAGS = {
  chain: tag('chain', '🔗'),
  sac: tag('sac', '🕯️'),
  elite: tag('elite', '⚔️'),
  econ: tag('econ', '💰'),
  fort: tag('fort', '🏰'),
  auto: tag('auto', '🤖'),
};

export const UPGRADES: UpDef[] = ([
  // 기본: 계열 없음
  { id: 'heat', tag: 'base', icon: '🔥', rarity: 0, max: 8 },
  { id: 'send', tag: 'base', icon: '🐝', rarity: 0, max: 8 },
  { id: 'brood', tag: 'base', icon: '🥚', rarity: 0, max: 8 },
  { id: 'cap', tag: 'base', icon: '🏠', rarity: 0, max: 8 },
  { id: 'wing', tag: 'base', icon: '💨', rarity: 0, max: 5 },
  { id: 'insul', tag: 'base', icon: '🧱', rarity: 0, max: 5 },

  // 연쇄: 하나 익혀서 무리 전체를 터뜨린다
  { id: 'wave', tag: 'chain', icon: '♨️', rarity: 0, max: 6 },
  { id: 'window', tag: 'chain', icon: '⛓️', rarity: 0, max: 5 },
  { id: 'fuse', tag: 'chain', icon: '🧨', rarity: 1, max: 1 },
  { id: 'frenzy', tag: 'chain', icon: '🌋', rarity: 2, max: 1 },

  // 희생: 벌을 소모품처럼 갈아 넣는다
  { id: 'martyr', tag: 'sac', icon: '🩸', rarity: 1, max: 3 },
  { id: 'mhoney', tag: 'sac', icon: '⚱️', rarity: 0, max: 4 },
  { id: 'berserk', tag: 'sac', icon: '😡', rarity: 1, max: 1 },
  { id: 'phoenix', tag: 'sac', icon: '🐦‍🔥', rarity: 2, max: 2 },

  // 정예: 적게 보내고 오래 살린다
  { id: 'elite', tag: 'elite', icon: '🎖️', rarity: 1, max: 1 },
  { id: 'veteran', tag: 'elite', icon: '⭐', rarity: 1, max: 2 },
  { id: 'tough', tag: 'elite', icon: '🛡️', rarity: 0, max: 5 },
  { id: 'resist', tag: 'elite', icon: '🌡️', rarity: 0, max: 4 },
  { id: 'royal', tag: 'elite', icon: '👑', rarity: 2, max: 1 },

  // 경제: 꿀을 쌓아 힘으로 바꾼다
  { id: 'honey', tag: 'econ', icon: '🍯', rarity: 0, max: 6 },
  { id: 'interest', tag: 'econ', icon: '🏦', rarity: 1, max: 3 },
  { id: 'jelly', tag: 'econ', icon: '🫙', rarity: 1, max: 2 },
  { id: 'merchant', tag: 'econ', icon: '🪙', rarity: 0, max: 2 },

  // 요새: 벌집까지 끌어들여 잡는다
  { id: 'armor', tag: 'fort', icon: '🏯', rarity: 0, max: 6 },
  { id: 'spiky', tag: 'fort', icon: '🌵', rarity: 1, max: 3 },
  { id: 'guard', tag: 'fort', icon: '💂', rarity: 1, max: 3 },

  // 자동: 덜 클릭하고 벌이 알아서 싸운다
  { id: 'scout', tag: 'auto', icon: '🔭', rarity: 1, max: 3 },
  { id: 'mark', tag: 'auto', icon: '🎯', rarity: 1, max: 2 },
  { id: 'alarm', tag: 'auto', icon: '🚨', rarity: 2, max: 1 },

  // 비밀: 아주 드물게 뜬다. 슬롯을 차지하지 않고 장착 슬롯을 1칸 늘린다
  { id: 'hidden', tag: 'base', icon: '🗝️', rarity: 3, max: 2, instant: true },
] as Omit<UpDef, 'name' | 'desc'>[]).map(u => ({
  ...u,
  get name() { return t(`up.${u.id}.name` as Key); },
  get desc() { return t(`up.${u.id}.desc` as Key); },
}));

const BASE_COST = [60, 130, 280, 160];

export const lv = Object.fromEntries(UPGRADES.map(u => [u.id, 0])) as Record<UpId, number>;

// 벌집은 웨이브마다 스스로 자란다 (상점과 별개로 힘이 꾸준히 늘어남)
export const colony = { wave: 0 };

export const MAX_SLOTS = 5;
/** 숨은 조건이나 비밀 카드로 늘어나는 슬롯 (그 판에서만, 둘을 합쳐 최대 2칸) */
export const MAX_EXTRA = 2;
export const extra = { slots: 0 };
export const maxSlots = () => MAX_SLOTS + extra.slots;
export const slots: UpId[] = [];

export const byId = (id: UpId) => UPGRADES.find(u => u.id === id)!;

// 한계 돌파: 여러 레벨로 오르는 카드는 원래 최대(max)의 두 배까지 올릴 수 있다. max를 넘은 레벨은 효과 절반
const MAX_OF = Object.fromEntries(UPGRADES.map(u => [u.id, u.max])) as Record<UpId, number>;
export const limit = (u: UpDef) => (u.max > 1 && !u.instant ? u.max * 2 : u.max);
export const overcap = (u: UpDef) => lv[u.id] >= u.max && lv[u.id] < limit(u) && u.max > 1;
/** 카드 효과에 쓰는 실효 레벨 */
const e = (id: UpId) => Math.min(lv[id], MAX_OF[id]) + 0.5 * Math.max(0, lv[id] - MAX_OF[id]);

export function resetUpgrades() {
  for (const k in lv) lv[k as UpId] = 0;
  slots.length = 0;
  extra.slots = 0;
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

// 값은 원래 최대까지 레벨마다 ×1.6, 한계 돌파 구간은 ×1.3 (쌓인 꿀을 꾸준히 쓸 곳)
export function cost(u: UpDef) {
  const l = lv[u.id];
  return Math.round(BASE_COST[u.rarity] * Math.pow(1.6, Math.min(l, u.max)) * Math.pow(1.3, Math.max(0, l - u.max)) * Math.pow(0.85, e('merchant')));
}

/** 가중치 랜덤으로 서로 다른 카드 n장. 이미 장착한 계열은 더 잘 나온다 */
export function rollCards(n: number): UpDef[] {
  const weight = [62, 30, 8, 12]; // 비밀 카드는 상점 한 번에 3% 안팎
  const owned = new Set(slots.map(id => byId(id).tag));
  const w = (u: UpDef) => weight[u.rarity] * (u.tag !== 'base' && owned.has(u.tag) ? 1.8 : 1);
  const pool = UPGRADES.filter(u => lv[u.id] < limit(u) && !(u.instant && extra.slots >= MAX_EXTRA));
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

/** 밸런스 조정용 기본값 (개발 모드에서는 주소 뒤 ?brood=..로 바꿔 볼 수 있음) */
// waveLen: 한 웨이브 마릿수 배수, spawnGap: 등장 간격 배수, honeyK: 마리당 꿀, dmgK: 벌집 피해, brood: 웨이브 중 번식(초당)
export const tune = { brood: 22, waveLen: 2.5, spawnGap: 1.4, honeyK: 0.7, dmgK: 0.5 };

/** 열구 템포: 발열·식는 속도·독침 주기를 같은 비율로 당긴다. 필요한 벌 수와 한 마리당 손실은 그대로, 익는 시간만 짧아짐 */
export const PACE = 1.6;

// 카드가 반영된 수치. honey가 필요한 건 인자로 받는다
export const S = {
  heatMult: (honey: number) =>
    (1 + 0.15 * e('heat')) * (lv.elite ? 1.7 : 1) * (lv.berserk ? 1.4 : 1) *
    (1 + Math.min(0.3 * e('jelly'), Math.floor(honey / 100) * 0.04 * e('jelly'))),
  heatPerBee: () => 0.11 * PACE,
  bossHeatPerBee: () => 0.06 * PACE,
  vetMult: (vet: number) => (lv.veteran ? 1 + 0.2 * vet * (1 + 0.3 * (e('veteran') - 1)) : 1),
  autoMult: () => (lv.alarm ? 1.6 : 1),
  cooling: () => 0.4 * PACE * Math.pow(0.88, e('insul')),
  sendCount: () => Math.round((60 + 20 * e('send')) * (lv.elite ? 0.5 : 1)),
  broodRate: () => tune.brood * (1 + 0.35 * e('brood')) * (1 + 0.08 * colony.wave),
  maxBees: () => 600 + 140 * e('cap') + 45 * colony.wave,
  beeSpeed: () => 560 * (1 + 0.18 * e('wing')) * (trait('elite') ? 1.4 : 1),
  honeyMult: () => 1 + 0.25 * e('honey'),
  stingKills: (attached: number) => attached * (lv.berserk ? 0.07 : 0.035),
  stingKillChance: () => 0.85 * Math.pow(0.8, e('tough')) * (trait('elite') ? 0.7 : 1),
  overheatRate: () => 0.07 * Math.pow(0.65, e('resist')),
  // 연쇄가 이어질수록 열파가 ×0.8씩 약해진다 (연쇄 폭주는 3연쇄부터 감쇠 무시)
  chainHeat: (chain: number) => {
    const frenzy = lv.frenzy && chain >= 3;
    const decay = frenzy ? 1 : Math.pow(0.85, chain - 1);
    return (6 + 2 * e('wave') + (trait('chain') ? 2 : 0)) * decay * (frenzy ? 1.6 : 1);
  },
  chainRadius: (chain: number) => 180 * (1 + 0.08 * e('wave')) * (lv.frenzy && chain >= 3 ? 1.3 : 1),
  chainWindow: () => 1.3 + 0.3 * e('window'),
  martyrHeat: () => 0.15 * e('martyr'),
  sacHeatPerDead: () => (trait('sac') ? 0.3 : 0),
  deathHoney: () => 0.05 * e('mhoney'),
  phoenixChance: () => 0.2 * e('phoenix'),
  maxHP: () => 100 + 25 * e('armor'),
  hiveDamageMult: () => (trait('fort') ? 0.5 : 1),
  spikyHeat: () => 4 * PACE * e('spiky'),
  guardRate: () => 30 * e('guard'),
  scoutInterval: () => (lv.scout ? 3 / (1 + 0.35 * (e('scout') - 1)) * (trait('auto') ? 0.6 : 1) : 0),
  scoutCount: () => Math.round(S.sendCount() * 0.4),
  markRate: () => S.sendCount() * 0.5 * e('mark') * (trait('auto') ? 1.4 : 1),
  interest: (honey: number) => (lv.interest ? Math.min(40 * e('interest'), Math.floor(honey * 0.1 * e('interest'))) : 0),
  waveBonus: () => (trait('econ') ? 30 : 0),
  freeReroll: () => lv.merchant > 0,
};
