// @ts-nocheck — 개발용 측정 스크립트
/** 개발용 측정: 실제 시나리오 전투의 길이·끝난 사유·공격 승률 (probe-duel과 같은 전투 표본). 사용: npx tsx scripts/battle-length.mts [전투 수] */
const { newGame } = await import('../qa/scripts/lib');
const B = await import('../src/engine/battle/battle');
const A = await import('../src/engine/battle/auto');
const world = await import('../src/engine/world');
const D = await import('../src/engine/battle/duel');
// 관전 1배속 = 초당 0.65틱 (Battle.tsx TPS[1]) + 일기토 장면 (이동 0.5 + 도입 2.8 + 합×1.0 + 결정타 1.0 + 결과 2.4초)
const TPS1 = 0.65;
const sceneSec = (d) => 0.5 + 2.8 + D.duelHighlights(d.rounds).length * 1.0 + 1.0 + 2.4;
let realSum = 0; const reals = [];
const MAX = Number(process.argv[2] ?? 200);
let n=0; const reasons = new Map<string,number>(); const ticks:number[]=[]; let atkWin=0; let firstContact=0; let ratioSum=0;
outer: for (let seed=1; seed<=200; seed++){ const g=newGame('s194','cao',seed);
 for (const c of Object.values<any>(g.s.cities)) { if(!c.faction) continue; const attackers=world.officersIn(g,c.id,c.faction).filter((o:any)=>o.troops>0).slice(0,5); if(!attackers.length) continue;
  for (const nb of world.neighborsOf(g,c.id)) { const t=g.s.cities[nb.to]; if(!t.faction||t.faction===c.faction) continue; if(!world.officersIn(g,t.id,t.faction).some((o:any)=>o.troops>0)) continue;
   const troops=attackers.reduce((s:number,o:any)=>s+o.troops,0);
   const setup={id:'x',attacker:c.faction,defender:t.faction,from:c.id,city:t.id,units:attackers.map((o:any)=>({officer:o.id,troops:o.troops})),food:Math.ceil(troops/10)*3};
   const b=B.createBattle(g,setup,null); A.preparePlannedBattle(b,['atk','def']); A.startPlannedBattle(b);
   const def=b.units.filter((u:any)=>u.side==='def').reduce((s:number,u:any)=>s+u.troops,0); ratioSum+=troops/Math.max(1,def);
   let contact=-1; while(!b.result && b.tick<2400){ A.planAi(b); B.stepBattle(b); if(contact<0 && b.units.some((u:any)=>u.side==='atk'&&u.troops<u.startTroops)) contact=b.tick; }
   n++; ticks.push(b.tick); { const r = b.tick / TPS1 + b.duels.reduce((a, d) => a + sceneSec(d), 0); realSum += r; reals.push(r); } firstContact+=contact; if(b.result.winner==='atk') atkWin++; const r=b.result.reason; reasons.set(r,(reasons.get(r)??0)+1);
   if(n>=MAX) break outer; } } }
ticks.sort((a,b)=>a-b);
reals.sort((a,b)=>a-b);
console.log({ real1x: { avgSec: Math.round(realSum / n), p25: Math.round(reals[Math.floor(n*.25)]), med: Math.round(reals[n>>1]), p75: Math.round(reals[Math.floor(n*.75)]) } });
console.log({n, avg:Math.round(ticks.reduce((a,b)=>a+b,0)/n), p10:ticks[Math.floor(n*.1)], med:ticks[n>>1], p90:ticks[Math.floor(n*.9)], firstContact:Math.round(firstContact/n), atkWin:atkWin/n, ratio:(ratioSum/n).toFixed(2), reasons:Object.fromEntries(reasons)});
