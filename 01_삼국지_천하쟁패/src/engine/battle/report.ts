/**
 * 전투 결과 보고서 (설계서 12장, 1단계: 승패·피해·적 방침 공개 + 짧은 군사 총평)
 */
import { josa } from '../josa';
import { matchupSymbol, matchupValue, POLICIES, sideExecFactor } from './plan';
import type { BattleState, BUnit, Side } from './types';

export interface ReportUnitLine {
  name: string;
  officer: string;
  faction: string | null;
  troops: number;
  startTroops: number;
  status: BUnit['status'];
  dealt: number;
}

export interface BattleReport {
  viewer: Side;
  win: boolean;
  reason: string;
  myPolicy: string | null;
  enemyPolicy: string | null;
  /** 내 쪽 관점 상성 기호 (▲ = 내가 유리) */
  matchup: string;
  matchupText: string;
  myExec: { value: number; req: number; note: string } | null;
  enemyExec: { value: number; req: number; note: string } | null;
  myLoss: number;
  enemyLoss: number;
  captured: string[];
  lostCaptured: string[];
  killed: string[];
  lostKilled: string[];
  units: ReportUnitLine[];
  enemyUnits: ReportUnitLine[];
  mvp: string | null;
  advice: string;
  /** 일기토 카드 (설계서 9-3·10-4): b.duels 순서대로 */
  duels: { index: number; a: string; b: string; winner: string | null; outcome: string; mineWon: boolean | null; day?: number }[];
}

const lossOf = (us: BUnit[]) => us.reduce((s, u) => s + (u.startTroops - (u.status === 'dead' || u.status === 'captured' ? 0 : u.troops)), 0);
const line = (u: BUnit): ReportUnitLine => ({
  name: u.name,
  officer: u.officer,
  faction: u.faction,
  troops: u.status === 'dead' || u.status === 'captured' ? 0 : u.troops,
  startTroops: u.startTroops,
  status: u.status,
  dealt: Math.round(u.dealt ?? 0),
});

function execNote(b: BattleState, side: Side) {
  const p = b.plans?.[side];
  if (!p) return null;
  const f = sideExecFactor(b, side);
  const note = f >= 1 ? '작전대로 움직였다' : f > 0 ? '작전이 다소 엉성했다' : '부대들이 따로 놀았다';
  return { value: p.execution, req: POLICIES[p.policy].reqExec, note };
}

export function battleReport(b: BattleState, viewer: Side): BattleReport {
  const r = b.result!;
  const enemy: Side = viewer === 'atk' ? 'def' : 'atk';
  const mine = b.units.filter((u) => u.side === viewer);
  const theirs = b.units.filter((u) => u.side === enemy);
  const mv = matchupValue(b) * (viewer === 'atk' ? 1 : -1);
  const sym = matchupSymbol(mv);
  const myP = b.plans?.[viewer]?.policy;
  const enP = b.plans?.[enemy]?.policy;
  const matchupText = !myP || !enP ? '' : mv > 0 ? '우리 방침이 상성에서 유리했다' : mv < 0 ? '적 방침이 상성에서 유리했다' : '방침 상성은 대등했다 (능력치 승부)';
  const win = r.winner === viewer;
  const myExec = execNote(b, viewer);
  const best = [...mine].sort((a, c) => (c.dealt ?? 0) - (a.dealt ?? 0))[0];
  let advice: string;
  if (myExec && myExec.value < myExec.req) advice = `실행도가 모자랐습니다(${myExec.value}/${myExec.req}). 통솔 높은 총대장이나 지력 높은 군사를 데려가거나, 더 단순한 방침을 쓰시지요.`;
  else if (!win && mv < 0 && enP) advice = `적은 ${josa(POLICIES[enP].name, '으로/로')} 나왔습니다. 이 방침에는 ${POLICIES[enP].weak} 쪽이 잘 통합니다.`;
  else if (!win) advice = '상성은 나쁘지 않았으나 병력이나 장수의 힘에서 밀렸습니다. 병력을 더 모아 다시 치시지요.';
  else if (mv > 0) advice = '방침이 적의 허를 찔렀습니다. 같은 상대에게 또 통할지는 장담할 수 없습니다.';
  else advice = '힘으로 이겼습니다. 상성이 맞았다면 피해를 더 줄일 수 있었을 것입니다.';
  return {
    viewer,
    win,
    reason: r.reason,
    myPolicy: myP ? POLICIES[myP].name : null,
    enemyPolicy: enP ? POLICIES[enP].name : null,
    matchup: myP && enP ? sym : '',
    matchupText,
    myExec,
    enemyExec: execNote(b, enemy),
    myLoss: lossOf(mine),
    enemyLoss: lossOf(theirs),
    captured: theirs.filter((u) => u.status === 'captured').map((u) => u.name),
    lostCaptured: mine.filter((u) => u.status === 'captured').map((u) => u.name),
    killed: theirs.filter((u) => u.status === 'dead').map((u) => u.name),
    lostKilled: mine.filter((u) => u.status === 'dead').map((u) => u.name),
    units: mine.map(line),
    enemyUnits: theirs.map(line),
    mvp: best && (best.dealt ?? 0) > 0 ? best.name : null,
    advice,
    duels: b.duels.map((d, index) => {
      const winSide = !d.winner ? null : d.winner === d.a ? d.aSide : d.aSide === 'atk' ? 'def' : d.aSide === 'def' ? 'atk' : undefined;
      return { index, a: d.a, b: d.b, winner: d.winner, outcome: d.outcome, mineWon: winSide == null ? null : winSide === viewer, day: d.day };
    }),
  };
}
