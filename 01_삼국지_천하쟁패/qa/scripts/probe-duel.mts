/**
 * 작전 자동 전투에서 일기토·주요 사건이 실제로 몇 번 일어나는지 센다 (읽기 전용 측정).
 * 전투개편_v2_전례기반_설계서.md 1장·12장의 수치를 다시 잴 때 쓴다.
 * 사용법: npx tsx qa/scripts/probe-duel.mts [최대 전투 수=400]
 * 2026-11-13 v0.2.1 첫 측정: 400전투 / 무력85+ 참전 299 / 일기토 0 / 평균 95틱(1배속 약 47초)
 */
const MAX = Number(process.argv[2] ?? 400);
const { newGame } = await import('./lib');
const B = await import('../../src/engine/battle/battle');
const A = await import('../../src/engine/battle/auto');
const world = await import('../../src/engine/world');

let battles = 0, duels = 0, ticks = 0, fire = 0, ambush = 0, logLines = 0, withStrong = 0, strongWithDuel = 0;
outer: for (let seed = 1; seed <= 200; seed++) {
  const g = newGame('s194', 'cao', seed);
  for (const c of Object.values<any>(g.s.cities)) {
    if (!c.faction) continue;
    const attackers = world.officersIn(g, c.id, c.faction).filter((o: any) => o.troops > 0).slice(0, 5);
    if (!attackers.length) continue;
    for (const n of world.neighborsOf(g, c.id)) {
      const t = g.s.cities[n.to];
      if (!t.faction || t.faction === c.faction) continue;
      if (!world.officersIn(g, t.id, t.faction).some((o: any) => o.troops > 0)) continue;
      const troops = attackers.reduce((s: number, o: any) => s + o.troops, 0);
      const setup = { id: `qa_${c.id}_${t.id}`, attacker: c.faction, defender: t.faction, from: c.id, city: t.id, units: attackers.map((o: any) => ({ officer: o.id, troops: o.troops })), food: Math.ceil(troops / 10) * 3 };
      const b = B.createBattle(g, setup, null);
      A.preparePlannedBattle(b, ['atk', 'def']);
      A.runPlannedBattle(b);
      battles++;
      duels += b.duels.length;
      ticks += b.tick;
      logLines += b.log.length;
      fire += b.log.filter((l: string) => l.includes('화계!')).length;
      ambush += b.log.filter((l: string) => l.includes('복병')).length;
      if (b.units.some((u: any) => u.war >= 85)) {
        withStrong++;
        if (b.duels.length) strongWithDuel++;
      }
      if (battles >= MAX) break outer;
    }
  }
}
const r = (x: number) => +x.toFixed(2);
console.log(JSON.stringify({
  battles,
  battlesWithWar85Officer: withStrong,
  duelRateInWar85Battles: withStrong ? r(strongWithDuel / withStrong) : 0,
  totalDuels: duels,
  avgTicks: Math.round(ticks / battles),
  avgSecondsAt1x: Math.round(ticks / battles / 2),
  avgLogLines: Math.round(logLines / battles),
  fireSuccessPerBattle: r(fire / battles),
  ambushPerBattle: r(ambush / battles),
}, null, 1));
