import { base, type Game } from './ctx';
import {
  aiAccepts,
  attackOdds,
  conscript,
  develop,
  diploGift,
  handleCaptive,
  moveOfficer,
  prepareAttack,
  recruit,
  recruitChance,
  relief,
  reward,
  rumor,
  setTreaty,
  train,
  transport,
} from './commands';
import { cityBase } from './ctx';
import { pactBoost } from './joint';
import { DIFFICULTY_MOD, getRelation, type BattleSetup, type OfficerState } from './state';
import {
  armyPower,
  canAttack,
  captivesOf,
  citiesOf,
  cityDefense,
  factionTotals,
  FOOD_PER_1000,
  freeOfficersIn,
  maxTroops,
  neighborsOf,
  officersIn,
} from './world';

const ATTACK_RATIO: Record<string, number> = { aggressive: 1.05, balanced: 1.2, defensive: 1.6, diplomatic: 1.4 };

/**
 * 개막 정비 기간 (QA-DEV-06): 시작하자마자 AI끼리 땅을 뺏어 시나리오의 역사 구도가 무너지지 않도록
 * 첫 달은 AI가 출진하지 않고(내정·편성만), 그다음 두 달은 공격 판단을 더 신중하게 하고 세력마다 한 달에 한 곳만 친다. 플레이어는 첫 달부터 출진할 수 있다.
 */
export const OPENING = { freezeMonths: 1, cautiousMonths: 3, cautiousRatio: 1.25, maxAttacks: 1 };

/** 시나리오 시작 달로부터 지난 개월 수 (시작 달 = 0) */
export function monthsSinceStart(g: Game): number {
  const sc = g.ix.data.scenarios.find((x) => x.id === g.s.scenarioId);
  if (!sc) return Infinity;
  return g.s.year * 12 + g.s.month - (sc.year * 12 + sc.month);
}

/** 적대 세력의 인접 위협도 */
function threatAt(g: Game, faction: string, cityId: string): number {
  let t = 0;
  for (const n of neighborsOf(g, cityId)) {
    const c = g.s.cities[n.to]!;
    if (!c.faction || c.faction === faction || !canAttack(g, c.faction, faction)) continue;
    t += armyPower(g, officersIn(g, n.to, c.faction));
  }
  return t;
}

function isFrontier(g: Game, faction: string, cityId: string): boolean {
  return neighborsOf(g, cityId).some((n) => g.s.cities[n.to]?.faction !== faction);
}

/** AI 세력 한 달 행동. 결정된 공격 목록을 돌려준다 */
export function runAiFaction(g: Game, faction: string): BattleSetup[] {
  const f = g.s.factions[faction]!;
  const attacks: BattleSetup[] = [];
  handleCaptives(g, faction);
  if (g.rng.chance(30)) diplomacy(g, faction);

  const cities = g.rng.shuffle(citiesOf(g, faction));
  for (const c of cities) {
    const idle = () => officersIn(g, c.id, faction).filter((o) => !o.acted);
    const threat = threatAt(g, faction, c.id);

    // 1) 공격 (개막 정비 기간에는 쉬거나 신중하게)
    const opening = monthsSinceStart(g);
    const aggression = DIFFICULTY_MOD[g.s.difficulty ?? 'normal'].attack * (opening < OPENING.cautiousMonths ? OPENING.cautiousRatio : 1);
    const capped = opening < OPENING.cautiousMonths && attacks.length >= OPENING.maxAttacks;
    const atk = opening < OPENING.freezeMonths || capped ? null : planAttack(g, faction, c.id, threat, (ATTACK_RATIO[f.personality] ?? 1.4) * aggression);
    if (atk) attacks.push(atk);

    // 2) 재야 등용 (AI는 탐색 없이 바로 시도)
    for (const free of freeOfficersIn(g, c.id)) {
      const rec = idle().sort((a, b) => base(g, b.id).charisma - base(g, a.id).charisma)[0];
      if (rec && recruitChance(g, rec.id, free.id) >= 25) recruit(g, rec.id, free.id);
    }

    // 3) 내정
    for (const o of idle()) domestic(g, faction, o, threat);

    // 4) 포상
    for (const o of officersIn(g, c.id, faction)) {
      if (o.loyalty < 70 && c.gold > 600 && o.id !== f.ruler) reward(g, faction, o.id, 100);
    }
  }

  // 5) 후방 병력을 전선으로
  for (const c of citiesOf(g, faction)) {
    if (isFrontier(g, faction, c.id)) continue;
    const front = neighborsOf(g, c.id).find((n) => g.s.cities[n.to]?.faction === faction && isFrontier(g, faction, n.to));
    if (!front) continue;
    const mover = officersIn(g, c.id, faction).find((o) => !o.acted && o.troops >= 3000 && o.id !== g.s.cities[c.id]!.governor);
    if (mover) moveOfficer(g, mover.id, front.to);
    // 남는 군량도 전선으로
    const cc = g.s.cities[c.id]!;
    const keeper = officersIn(g, c.id, faction).find((o) => !o.acted);
    if (keeper && cc.food > 40000) transport(g, keeper.id, front.to, 0, Math.floor(cc.food / 2));
  }
  return attacks;
}

function planAttack(g: Game, faction: string, cityId: string, threat: number, needRatio: number): BattleSetup | null {
  const c = g.s.cities[cityId]!;
  const avail = officersIn(g, cityId, faction)
    .filter((o) => !o.acted && o.troops >= 1000)
    .sort((a, b) => b.troops * (base(g, b.id).leadership + base(g, b.id).war) - a.troops * (base(g, a.id).leadership + base(g, a.id).war));
  if (!avail.length) return null;
  // 수비 병력 일부 남김: 위협의 절반 이상
  const keep: OfficerState[] = [];
  const army: OfficerState[] = [];
  let keepPower = 0;
  for (const o of [...avail].reverse()) {
    if (keepPower < threat * 0.5 && avail.length - keep.length > 1) {
      keep.push(o);
      keepPower += armyPower(g, [o]);
    }
  }
  for (const o of avail) if (!keep.includes(o) && army.length < 5) army.push(o);
  if (!army.length) return null;

  const targets = neighborsOf(g, cityId)
    .map((n) => g.s.cities[n.to]!)
    .filter((t) => t.faction !== faction && canAttack(g, faction, t.faction));
  let best: { id: string; odds: number; value: number } | null = null;
  for (const t of targets) {
    const units = army.map((o) => ({ officer: o.id, troops: o.troops }));
    const odds = attackOdds(g, { units, city: t.id });
    // 동맹국과 협공을 약속한 도시는 덜 신중하게, 먼저 친다
    const pact = pactBoost(g, faction, t.id);
    const value = ((t.faction ? 1 : 1.3) + cityBase(g, t.id).maxPopulation / 1e6) * (pact ? 3 : 1);
    if (odds >= needRatio * (pact ? 0.75 : 1) && (!best || odds * value > best.odds * best.value)) best = { id: t.id, odds, value };
  }
  if (!best) return null;
  // 빈 도시는 최소 병력만
  const units = g.s.cities[best.id]!.faction ? army : army.slice(0, 1);
  const troops = units.reduce((s, o) => s + o.troops, 0);
  const food = Math.min(c.food - 2000, Math.ceil(troops / 100) * 25);
  if (food < Math.ceil(troops / 10)) return null;
  const setup = prepareAttack(g, faction, cityId, best.id, units.map((o) => o.id), food);
  return typeof setup === 'string' ? null : setup;
}

function domestic(g: Game, faction: string, o: OfficerState, threat: number): void {
  const c = g.s.cities[o.city]!;
  const cb = cityBase(g, o.city);
  const b = base(g, o.id);
  const troopsHere = officersIn(g, o.city, faction).reduce((s, x) => s + x.troops, 0);
  const monthlyFood = (troopsHere / 1000) * FOOD_PER_1000;
  const defense = cityDefense(g, o.city);
  const tryAll = (...fns: (() => { ok: boolean })[]) => {
    for (const fn of fns) if (fn().ok && o.acted) return;
  };
  const wantTroops = o.troops < maxTroops(g, o.id) * 0.8 && b.leadership >= 55;
  const military = [
    () => (wantTroops && c.food > monthlyFood * 4 ? conscript(g, o.id) : { ok: false }),
    () => (o.troops > 0 && o.training < 85 ? train(g, o.id) : { ok: false }),
  ];
  const econ = [
    () => (c.agriculture < cb.maxAgriculture && (b.politics >= 50 || c.food < monthlyFood * 6) ? develop(g, o.id, 'agriculture') : { ok: false }),
    () => (c.commerce < cb.maxCommerce && b.politics >= 50 ? develop(g, o.id, 'commerce') : { ok: false }),
    () => (c.order < 70 ? develop(g, o.id, 'order') : { ok: false }),
    () => (c.support < 40 ? relief(g, o.id) : { ok: false }),
    () => (c.walls < cb.maxWalls * 0.7 ? develop(g, o.id, 'walls') : { ok: false }),
  ];
  if (c.food < monthlyFood * 3) return tryAll(econ[0]!, ...econ.slice(1));
  if (threat > defense * 0.8) return tryAll(...military, econ[4]!, ...econ);
  if (b.politics > b.leadership + 5) return tryAll(...econ, ...military);
  return tryAll(...military, ...econ);
}

function handleCaptives(g: Game, faction: string): void {
  const f = g.s.factions[faction]!;
  for (const cap of captivesOf(g, faction)) {
    const p = recruitChance(g, f.ruler, cap.id);
    if (p >= 15) {
      const r = handleCaptive(g, faction, cap.id, 'recruit');
      if (g.s.officers[cap.id]?.status !== 'captive' || !r.ok) continue;
    }
    // 오래 설득이 안 되면: 군주가 야심가면 처형, 아니면 석방
    if (g.rng.chance(25)) {
      const cruel = base(g, f.ruler).ambition >= 14 && base(g, f.ruler).loyaltyTrait <= 6;
      handleCaptive(g, faction, cap.id, cruel && g.rng.chance(40) ? 'execute' : 'release');
    }
  }
}

function diplomacy(g: Game, faction: string): void {
  const others = Object.values(g.s.factions).filter((x) => x.alive && x.id !== faction);
  if (!others.length) return;
  const me = factionTotals(g, faction);
  const envoy = citiesOf(g, faction)
    .flatMap((c) => officersIn(g, c.id, faction))
    .filter((o) => !o.acted)
    .sort((a, b) => base(g, b.id).charisma - base(g, a.id).charisma)[0];
  if (!envoy) return;
  // 가장 위협적인 이웃
  const neighborsF = new Set<string>();
  for (const c of citiesOf(g, faction)) for (const n of neighborsOf(g, c.id)) {
    const nf = g.s.cities[n.to]?.faction;
    if (nf && nf !== faction) neighborsF.add(nf);
  }
  const threats = [...neighborsF].map((id) => ({ id, t: factionTotals(g, id) })).sort((a, b) => b.t.power - a.t.power);
  const big = threats[0];
  if (big && big.t.power > me.power * 1.5) {
    const r = getRelation(g.s, faction, big.id);
    if (r.treaty === 'none') {
      if (big.id === g.s.playerFaction) {
        if (r.friendship >= 30 && g.rng.chance(40)) g.s.proposals.push({ from: faction, type: 'truce', envoy: envoy.id });
        else if (g.s.cities[envoy.city]!.gold > 800) diploGift(g, envoy.id, big.id, 300);
      } else if (aiAccepts(g, faction, big.id, 'truce', envoy.id)) {
        envoy.acted = true;
        setTreaty(g, faction, big.id, 'truce');
      } else if (g.s.cities[envoy.city]!.gold > 800) diploGift(g, envoy.id, big.id, 300);
      return;
    }
  }
  // 친한 세력과 동맹
  const friend = others
    .filter((o) => getRelation(g.s, faction, o.id).treaty === 'none' && getRelation(g.s, faction, o.id).friendship >= 65)
    .sort((a, b) => getRelation(g.s, faction, b.id).friendship - getRelation(g.s, faction, a.id).friendship)[0];
  if (friend) {
    if (friend.id === g.s.playerFaction) {
      if (!g.s.proposals.some((p) => p.from === faction)) g.s.proposals.push({ from: faction, type: 'alliance', envoy: envoy.id });
    } else if (aiAccepts(g, faction, friend.id, 'alliance', envoy.id)) {
      envoy.acted = true;
      setTreaty(g, faction, friend.id, 'alliance');
    }
    return;
  }
  // 공략 대상 도시에 유언비어
  const b = base(g, envoy.id);
  if (b.intelligence >= 75 && threats.length) {
    const target = threats[threats.length - 1]!;
    const tc = citiesOf(g, target.id)[0];
    if (tc) rumor(g, envoy.id, tc.id);
  }
}
