/**
 * 장기 진행 프로브: 헤드리스로 AI끼리 진행하며 매달 불변식·이벤트·수명·밸런스·템포를 잰다.
 * 사용법: npx tsx qa/scripts/probe-sim.ts [시나리오|all] [년수=20] [시드수=3]
 */
import { Report, SCENARIOS, invariants, newGame, pct, stepMonthAuto, timer } from './lib';
import type { Game } from '../../src/engine/ctx';

const [scArg = 'all', yearsArg = '20', seedsArg = '3'] = process.argv.slice(2);
const YEARS = Number(yearsArg); const SEEDS = Number(seedsArg);
const scenarios = scArg === 'all' ? SCENARIOS() : [scArg];
const r = new Report('probe-sim');

const world = await import('../../src/engine/world');
const maxTroops = 'maxTroops' in world ? (world.maxTroops as (g: Game, id: string) => number) : undefined;
const turn = await import('../../src/engine/turn');
const triage = 'triageMessages' in turn ? (turn.triageMessages as (g: Game) => void) : undefined;
const MAX_POPUPS = 'MAX_POPUPS' in turn ? Number(turn.MAX_POPUPS) : 3;
const citiesCount = (g: Game, f: string) => Object.values(g.s.cities).filter((c) => c.faction === f).length;
/** 한 판에 여러 번 나와도 되는 이벤트 제목 */
const REPEATABLE = [/^천리행/, /^칠종칠금/, /^군주 계승/];

const agg = { invViolations: 0, months: 0, maxAiMs: 0, sumAiMs: 0, firstMonthCaptures: [] as number[], unified: [] as number[], dupEvents: [] as string[], eventsOff: 0,
  aiVsAi: 0, aiVsPlayer: 0, popupOver: 0, orderIssues: [] as string[], lifespan: new Set<string>(), loyaltyDrop1: [] as number[], topShare: [] as string[], emptyFactions: new Set<string>() };

for (const sc of scenarios) {
  for (let seed = 1; seed <= SEEDS; seed++) {
    await r.check(`run ${sc}#${seed}`, async () => {
      const g = newGame(sc, undefined, seed);
      const total = Object.keys(g.s.cities).length;
      const eventCount = new Map<string, number>();
      const firstSeen: string[] = [];
      const viol = new Set<string>();
      const playerLoy0 = Object.values(g.s.officers).filter((o) => o.status === 'serving' && o.faction === g.s.playerFaction && g.s.factions[o.faction]!.ruler !== o.id);
      const loy0 = new Map(playerLoy0.map((o) => [o.id, o.loyalty]));
      g.s.messages = [];
      for (let m = 0; m < YEARS * 12 && !g.s.ending; m++) {
        const owners0 = Object.fromEntries(Object.values(g.s.cities).map((c) => [c.id, c.faction]));
        const logLen = g.s.log.length;
        const t = timer();
        // 플레이어 포함 전원 AI. 단, AI가 플레이어 세력을 노리는지 보려고 공격 대상은 로그로 센다
        const msgs = await stepMonthAuto(g);
        const ms = t();
        agg.months++; agg.sumAiMs += ms; agg.maxAiMs = Math.max(agg.maxAiMs, ms);
        const changed = Object.values(g.s.cities).filter((c) => c.faction !== owners0[c.id] && owners0[c.id] !== undefined).length;
        if (m === 0) agg.firstMonthCaptures.push(changed);
        for (const l of g.s.log.slice(logLen)) {
          if (/점령|방어 성공/.test(l.text)) { if (l.text.includes(g.s.factions[g.s.playerFaction]?.name ?? '§')) agg.aiVsPlayer++; else agg.aiVsAi++; }
        }
        // 이벤트 카운트
        for (const msg of msgs) {
          if (msg.kind !== 'event') continue;
          eventCount.set(msg.title, (eventCount.get(msg.title) ?? 0) + 1);
          if (eventCount.get(msg.title) === 1) firstSeen.push(`${g.s.year}.${g.s.month} ${msg.title}`);
        }
        // 메시지 순서: 결과(군주 포로/계승/멸망)가 원인(도시 함락)보다 먼저 나오는가
        const ti = msgs.map((x) => x.title);
        const fall = ti.findIndex((x) => x === '도시 함락' || x === '전투 결과'); const cap = ti.findIndex((x) => x === '군주 포로' || x === '군주 계승' || x === '세력 멸망');
        if (fall >= 0 && cap >= 0 && cap < fall) agg.orderIssues.push(`${sc}#${seed} ${g.s.year}.${g.s.month}: ${ti.join(' → ')}`);
        // 팝업 개수 (triage 적용 후)
        if (triage) {
          g.s.messages = msgs.slice(); triage(g);
          const pop = g.s.messages.filter((x) => ['war', 'ending', 'event'].includes(x.kind ?? 'info')).length;
          if (pop > MAX_POPUPS) agg.popupOver++;
          g.s.messages = []; if (g.s.notices) g.s.notices = [];
        }
        if (m === 0) for (const [id, l0] of loy0) { const o = g.s.officers[id]; if (o?.status === 'serving') agg.loyaltyDrop1.push(l0 - o.loyalty); }
        for (const v of invariants(g, maxTroops)) {
          if (v.includes('몰년')) agg.lifespan.add(`${sc}: ${v}`);
          else if (v.includes('생존인데 도시 0')) agg.emptyFactions.add(`${sc}#${seed} ${g.s.year}.${g.s.month} ${v}`);
          else if (!viol.has(v.replace(/\d+/g, '#'))) { viol.add(v.replace(/\d+/g, '#')); agg.invViolations++; r.fail(`불변식 ${sc}#${seed}`, 'S2', '개발', `${g.s.year}.${g.s.month} ${v}`); }
        }
        if (m % 60 === 59) {
          const alive = Object.values(g.s.factions).filter((f) => f.alive);
          const top = alive.map((f) => [f.name, citiesCount(g, f.id)] as const).sort((a, b) => b[1] - a[1])[0];
          if (top) agg.topShare.push(`${sc}#${seed} ${g.s.year}: 최대 ${top[0]} ${pct(top[1], total)}% · 생존 ${alive.length}`);
        }
        if (Object.values(g.s.factions).filter((f) => f.alive).length === 1) { agg.unified.push(Math.floor(m / 12)); agg.topShare.push(`${sc}#${seed} ${g.s.year}: 통일 (${Math.floor(m / 12)}년 걸림)`); break; }
      }
      for (const [title, n] of eventCount) if (n > 1 && !REPEATABLE.some((re) => re.test(title))) agg.dupEvents.push(`${sc}#${seed}: "${title}" ×${n}`);
      r.info(`이벤트 ${sc}#${seed}`, `발동 이벤트 ${firstSeen.length}종`, firstSeen.join('\n'));
    });
  }
  // 역사 이벤트 끄기
  await r.check(`D3-15 ${sc}`, async () => {
    const g = newGame(sc, undefined, 99, { historicalEvents: false });
    g.s.messages = [];
    let n = 0; const titles: string[] = [];
    for (let m = 0; m < 36; m++) for (const msg of await stepMonthAuto(g)) if (msg.kind === 'event' && !/군주 계승/.test(msg.title)) { n++; titles.push(msg.title); }
    agg.eventsOff += n;
    n ? r.fail(`D3-15 ${sc}`, 'S3', '개발', `역사 이벤트 끔 상태에서 이벤트 ${n}회`, titles.join(', ')) : r.pass(`D3-15 ${sc}`, '이벤트 끔 → 0회 (3년)');
  });
}

// ───── 종합 판정 ─────
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
agg.dupEvents.length ? r.fail('D1-06', 'S2', '개발', `역사 이벤트 중복 발동 ${agg.dupEvents.length}건`, agg.dupEvents.join('\n')) : r.pass('D1-06', '이벤트 중복 발동 없음');
agg.invViolations ? null : r.pass('불변식', `${agg.months}개월 동안 상태 불변식 위반 없음`);
agg.lifespan.size ? r.fail('D3-11', 'S2', '개발', `몰년+3년 넘긴 생존 무장 ${agg.lifespan.size}건`, [...agg.lifespan].slice(0, 40).join('\n')) : r.pass('D3-11', '수명 처리 정상');
agg.emptyFactions.size ? r.fail('D1-05', 'S2', '개발', `도시 0인데 생존 세력 ${agg.emptyFactions.size}건`, [...agg.emptyFactions].slice(0, 20).join('\n')) : r.pass('D1-05', '도시 0 세력 잔존 없음');
const fm = avg(agg.firstMonthCaptures);
fm > 3 ? r.fail('D5-01', 'S2', '개발', `첫 달 평균 도시 주인 변경 ${fm.toFixed(1)}개 (목표 ≤ 3)`, agg.firstMonthCaptures.join(', ')) : r.pass('D5-01', `첫 달 평균 ${fm.toFixed(1)}개 변경`);
const aiMs = agg.sumAiMs / Math.max(1, agg.months);
agg.maxAiMs > 5000 ? r.fail('D2-09', 'S3', '개발', `AI 턴 최대 ${(agg.maxAiMs / 1000).toFixed(2)}s (목표 5s)`) : r.pass('D2-09', `AI+월말 처리 평균 ${aiMs.toFixed(0)}ms · 최대 ${agg.maxAiMs.toFixed(0)}ms (헤드리스, UI 제외)`);
r.info('D2-03', `전투 기록 중 플레이어 관련 ${agg.aiVsPlayer} / AI끼리 ${agg.aiVsAi} (플레이어도 AI 조종이라 참고치)`);
agg.orderIssues.length ? r.fail('D2-08', 'S3', '개발', `결과 팝업이 원인보다 먼저 ${agg.orderIssues.length}회 (예: 군주 포로 → 도시 함락)`, agg.orderIssues.slice(0, 10).join('\n')) : r.pass('D2-08', '팝업 원인→결과 순서');
triage ? (agg.popupOver ? r.fail('D2-08', 'S3', '개발', `한 달 팝업 ${MAX_POPUPS}개 초과 ${agg.popupOver}회`) : r.pass('D2-08', `팝업 ≤ ${MAX_POPUPS}`)) : r.skip('D2-08', 'triageMessages 없음');
const ld = avg(agg.loyaltyDrop1);
ld > 3 ? r.fail('D5-07', 'S3', '개발', `플레이어 무장 첫 달 평균 충성 하락 ${ld.toFixed(1)} (목표 ≤ 3), 최대 ${Math.max(...agg.loyaltyDrop1)}`) : r.pass('D5-07', `첫 달 평균 충성 변화 -${ld.toFixed(1)}`);
r.info('D5-04', `통일 도달 ${agg.unified.length}판 / ${scenarios.length * SEEDS}판 (${YEARS}년 한도)`, agg.topShare.join('\n'));

r.write();
