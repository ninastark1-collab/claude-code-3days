import { preparePlannedBattle, runPlannedBattle } from './battle/auto';
import { createBattle } from './battle/battle';
import type { BattleState } from './battle/types';
import { base, cname, fname, oname, type Game } from './ctx';
import { addLog, assignGovernor, refreshGovernors, type BattleSetup } from './state';
import { canAttack, citiesOf, clamp, neighborsOf, officersIn, officersOf } from './world';
import { attachAllies } from './joint';
import { getRelation } from './state';

/** 수비 병력이 없는 도시인지 (전투 없이 점령) */
export function isUndefended(g: Game, cityId: string): boolean {
  const c = g.s.cities[cityId]!;
  return !c.faction || officersIn(g, cityId, c.faction).every((o) => o.troops <= 0);
}

/** 대기 중이던 출진 정보를 현재 상태에 맞춘다 (그 사이 무장이 죽거나 잡혔을 수 있음) */
export function refreshSetup(g: Game, setup: BattleSetup): BattleSetup | null {
  setup.units = setup.units
    .filter((u) => {
      const o = g.s.officers[u.officer];
      return o?.status === 'serving' && o.faction === setup.attacker && o.city === setup.from && o.troops > 0;
    })
    .map((u) => ({ officer: u.officer, troops: g.s.officers[u.officer]!.troops }));
  setup.defender = g.s.cities[setup.city]!.faction;
  // 그 사이 주인이 바뀌어 동맹/정전 상대가 됐거나 출발 도시를 잃었으면 취소
  if (
    !setup.units.length ||
    setup.defender === setup.attacker ||
    !canAttack(g, setup.attacker, setup.defender) ||
    g.s.cities[setup.from]?.faction !== setup.attacker
  ) {
    if (g.s.cities[setup.from]?.faction === setup.attacker) g.s.cities[setup.from]!.food += setup.food;
    return null;
  }
  return setup;
}

/** 플레이어 출진: 빈 도시면 바로 점령하고 null, 아니면 전투 상태를 만든다 */
export function startBattle(g: Game, setup: BattleSetup, playerSide: 'atk' | 'def', kinds?: Record<string, import('./battle/types').UnitKind>): BattleState | null {
  if (isUndefended(g, setup.city)) {
    occupy(g, setup, setup.units.map((u) => ({ officer: u.officer, troops: u.troops })), setup.food);
    return null;
  }
  // 동맹 협공 약속이 있으면 원군이 합류한다
  if (playerSide === 'atk') attachAllies(g, setup);
  const b = createBattle(g, setup, playerSide, kinds);
  // 작전 자동 전투: 상대 쪽 작전은 AI가 정하고, 플레이어 쪽은 작전 회의에서 정한다
  preparePlannedBattle(b, [playerSide === 'atk' ? 'def' : 'atk']);
  return b;
}

/** AI 전투 등 플레이어가 조작하지 않는 공격을 끝까지 처리 */
export function resolveAttackAuto(g: Game, setup: BattleSetup): void {
  if (isUndefended(g, setup.city)) {
    occupy(g, setup, setup.units.map((u) => ({ officer: u.officer, troops: u.troops })), setup.food);
    return;
  }
  attachAllies(g, setup);
  const b = createBattle(g, setup, null);
  preparePlannedBattle(b, ['atk', 'def']);
  runPlannedBattle(b);
  applyBattleResult(g, b);
}

/** 수비군 없는 도시 점령 */
function occupy(g: Game, setup: BattleSetup, survivors: { officer: string; troops: number }[], foodLeft: number): void {
  const c = g.s.cities[setup.city]!;
  const prevOwner = c.faction;
  // 병력 없는 수비 무장은 도망 또는 포로
  if (prevOwner) for (const o of officersIn(g, setup.city, prevOwner)) fleeOrCapture(g, o.id, setup.attacker, setup.city);
  c.faction = setup.attacker;
  c.food += foodLeft;
  c.support = clamp(c.support - 10, 0, 100);
  c.order = clamp(c.order - 10, 0, 100);
  for (const s of survivors) {
    const o = g.s.officers[s.officer]!;
    o.city = setup.city;
    o.troops = s.troops;
  }
  c.governor = null;
  assignGovernor(g.s, setup.city);
  assignGovernor(g.s, setup.from);
  addLog(g.s, `${fname(g, setup.attacker)}이(가) ${cname(g, setup.city)} 점령${prevOwner ? ` (${fname(g, prevOwner)}로부터)` : ''}`);
  if (prevOwner === g.s.playerFaction || setup.attacker === g.s.playerFaction) {
    g.s.messages.push({
      title: '도시 함락',
      text: `${fname(g, setup.attacker)}이(가) ${cname(g, setup.city)}을(를) 점령했습니다.`,
      kind: 'war',
    });
  }
  if (prevOwner) checkFactionAlive(g, prevOwner, setup.attacker);
}

/** 패배한 수비 무장: 인접 아군 도시로 도주하거나 포로 */
function fleeOrCapture(g: Game, officerId: string, captor: string, cityId: string): void {
  const o = g.s.officers[officerId]!;
  const escape = neighborsOf(g, cityId).filter((n) => g.s.cities[n.to]?.faction === o.faction);
  const b = base(g, officerId);
  if (escape.length && g.rng.chance(45 + b.war / 3)) {
    o.city = g.rng.pick(escape).to;
    assignGovernor(g.s, o.city);
  } else capture(g, officerId, captor, cityId);
}

function capture(g: Game, officerId: string, captor: string, cityId: string): void {
  const o = g.s.officers[officerId]!;
  o.status = 'captive';
  o.captor = captor;
  o.city = cityId;
  o.troops = 0;
  o.acted = false;
  addLog(g.s, `${oname(g, officerId)}이(가) ${fname(g, captor)}에게 사로잡힘`);
  if (o.faction && g.s.factions[o.faction]?.ruler === officerId) {
    g.s.messages.push({ title: '군주 포로', text: `${fname(g, o.faction)}의 군주 ${oname(g, officerId)}이(가) 사로잡혔습니다!`, kind: 'war' });
    succession(g, o.faction);
  }
}

/** 전투 결과를 게임 상태에 반영 */
export function applyBattleResult(g: Game, b: BattleState): void {
  const r = b.result;
  if (!r) throw new Error('전투가 끝나지 않았습니다.');
  const setup = b.setup;
  const defFaction = g.s.cities[setup.city]!.faction;
  const winnerFaction = r.winner === 'atk' ? setup.attacker : defFaction;
  // 수비 도시 군량 소비 반영
  g.s.cities[setup.city]!.food = Math.max(0, Math.round(b.defFood));
  const rescued: string[] = [];

  for (const u of r.units) {
    const o = g.s.officers[u.officer]!;
    if (o.status !== 'serving') continue;
    o.troops = u.status === 'dead' || u.status === 'captured' ? 0 : u.troops;
    // 경험: 살아남은 부대 훈련도 소폭 상승
    if (u.status === 'active' || u.status === 'retreated') o.training = Math.min(100, o.training + 3);
    if (u.status === 'dead') {
      killOfficer(g, u.officer, '전사');
    } else if (u.status === 'captured' && r.winner === u.side) {
      // 사로잡혔지만 자기 편이 이겼으면 구출됨 (병력 없이 패주 처리)
      o.troops = 0;
      if (u.side === 'atk' && !setup.allies?.some((a) => a.officer === u.officer)) rescued.push(u.officer);
    } else if (u.status === 'captured') {
      const captor = u.side === 'atk' ? defFaction : setup.attacker;
      if (captor) capture(g, u.officer, captor, u.side === 'atk' ? setup.city : setup.from);
      else {
        o.status = 'free';
        o.faction = null;
      }
    }
  }

  // 동맹 원군은 이기든 지든 자기 도시로 돌아간다 (점령 도시에 들어가지 않는다)
  const allyOf = new Map((setup.allies ?? []).map((a) => [a.officer, a]));
  for (const [id, a] of allyOf) {
    const o = g.s.officers[id];
    if (!o || o.status !== 'serving') continue;
    if (g.s.cities[a.from]?.faction === o.faction) o.city = a.from;
    else {
      const own = o.faction ? citiesOf(g, o.faction) : [];
      if (own.length) o.city = own[0]!.id;
    }
    assignGovernor(g.s, o.city);
  }
  if (allyOf.size && r.winner === 'atk') {
    const ally = setup.allies![0]!.faction;
    if (g.s.factions[ally]?.alive) {
      const rel = getRelation(g.s, setup.attacker, ally);
      rel.friendship = clamp(rel.friendship + 5, 0, 100);
    }
  }
  const atkSurvivors = r.units.filter((u) => u.side === 'atk' && !allyOf.has(u.officer) && (u.status === 'active' || u.status === 'retreated' || u.status === 'routed'));
  const atkAlive = (id: string) => g.s.officers[id]?.status === 'serving';

  if (r.winner === 'atk') {
    // 끝까지 싸운 부대만 입성, 패주·도중 퇴각·구출된 부대는 원래 도시로
    const entering = atkSurvivors.filter((u) => u.status === 'active' && atkAlive(u.officer));
    for (const u of atkSurvivors.filter((u) => u.status !== 'active' && atkAlive(u.officer))) returnHome(g, u.officer, setup);
    for (const id of rescued) if (atkAlive(id)) returnHome(g, id, setup);
    occupy(g, setup, entering.map((u) => ({ officer: u.officer, troops: g.s.officers[u.officer]!.troops })), r.atkFoodLeft);
  } else {
    for (const u of atkSurvivors) if (atkAlive(u.officer)) returnHome(g, u.officer, setup);
    if (g.s.cities[setup.from]?.faction === setup.attacker) g.s.cities[setup.from]!.food += r.atkFoodLeft;
    addLog(g.s, `${cname(g, setup.city)} 방어 성공 (${fname(g, defFaction)})`);
    if (setup.attacker === g.s.playerFaction || defFaction === g.s.playerFaction) {
      g.s.messages.push({
        title: '전투 결과',
        text: `${fname(g, defFaction)}이(가) ${cname(g, setup.city)}을(를) 지켜냈습니다. (${r.reason})`,
        kind: 'war',
      });
    }
  }
  if (winnerFaction) for (const f of Object.keys(g.s.factions)) if (f !== winnerFaction) checkFactionAlive(g, f, winnerFaction);
  refreshGovernors(g.s);
}

function returnHome(g: Game, officerId: string, setup: BattleSetup): void {
  const o = g.s.officers[officerId]!;
  if (g.s.cities[setup.from]?.faction === o.faction) o.city = setup.from;
  else {
    const own = o.faction ? citiesOf(g, o.faction) : [];
    if (own.length) o.city = own[0]!.id;
  }
  assignGovernor(g.s, o.city);
}

export function killOfficer(g: Game, officerId: string, cause: string): void {
  const o = g.s.officers[officerId]!;
  // 이미 멸망한 세력의 (포로였던) 군주가 죽으면 승계를 다시 돌리지 않는다
  const wasRulerOf = o.faction && g.s.factions[o.faction]?.alive && g.s.factions[o.faction]!.ruler === officerId ? o.faction : null;
  const prevStatus = o.status;
  o.status = 'dead';
  o.troops = 0;
  o.captor = undefined;
  addLog(g.s, `${oname(g, officerId)} ${cause}`);
  if (prevStatus === 'serving' || wasRulerOf) {
    if (o.faction === g.s.playerFaction || wasRulerOf) {
      g.s.messages.push({ title: cause, text: `${oname(g, officerId)}이(가) ${cause}했습니다.`, kind: 'death' });
    }
  }
  if (o.city) assignGovernor(g.s, o.city);
  if (wasRulerOf) succession(g, wasRulerOf);
}

/** 군주 승계. 후계자가 없으면 세력 멸망 */
export function succession(g: Game, faction: string): void {
  const f = g.s.factions[faction]!;
  const old = f.ruler;
  const oldB = base(g, old);
  const cands = officersOf(g, faction).filter((o) => o.id !== old);
  if (!cands.length || citiesOf(g, faction).length === 0) {
    destroyFaction(g, faction, null);
    return;
  }
  const score = (id: string) => {
    const b = base(g, id);
    let s = b.charisma + b.leadership / 2 + b.politics / 3;
    if (b.father === old) s += 200;
    if (b.sworn && b.sworn === oldB.sworn) s += 120;
    return s;
  };
  const heir = cands.reduce((a, c) => (score(c.id) > score(a.id) ? c : a));
  f.ruler = heir.id;
  heir.loyalty = 100;
  if (g.s.cities[f.capital]?.faction !== faction) f.capital = heir.city;
  assignGovernor(g.s, heir.city);
  // 군주 교체로 충성 동요
  for (const o of cands) if (o.id !== heir.id) o.loyalty = clamp(o.loyalty - g.rng.int(0, 10), 0, 100);
  addLog(g.s, `${fname(g, faction)}: ${oname(g, heir.id)}이(가) 뒤를 이음`);
  g.s.messages.push({ title: '군주 계승', text: `${fname(g, faction)}의 새 군주로 ${oname(g, heir.id)}이(가) 즉위했습니다.`, kind: 'event' });
}

/** 도시가 하나도 없으면 멸망 처리 */
export function checkFactionAlive(g: Game, faction: string, by: string | null): void {
  const f = g.s.factions[faction];
  if (!f?.alive) return;
  if (citiesOf(g, faction).length > 0) {
    if (g.s.cities[f.capital]?.faction !== faction) f.capital = citiesOf(g, faction)[0]!.id;
    return;
  }
  destroyFaction(g, faction, by);
}

export function destroyFaction(g: Game, faction: string, by: string | null): void {
  const f = g.s.factions[faction]!;
  f.alive = false;
  for (const c of citiesOf(g, faction)) {
    c.faction = null;
    c.governor = null;
  }
  for (const o of Object.values(g.s.officers)) {
    if (o.status === 'serving' && o.faction === faction) {
      if (by && g.rng.chance(40)) {
        o.status = 'captive';
        o.captor = by;
      } else {
        o.status = 'free';
        o.found = false;
      }
      o.faction = o.status === 'captive' ? faction : null;
      o.troops = 0;
    }
    if (o.status === 'captive' && o.captor === faction) {
      o.captor = undefined;
      o.status = 'free';
      o.faction = null;
      o.found = false;
    }
  }
  addLog(g.s, `${f.name} 멸망`);
  g.s.messages.push({ title: '세력 멸망', text: `${f.name}이(가) 멸망했습니다.`, kind: 'war' });
}
