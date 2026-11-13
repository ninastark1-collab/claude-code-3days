import { runAiFaction } from './ai';
import { joinFaction, setTreaty } from './commands';
import { base, cname, fname, oname, type Game } from './ctx';
import { checkEvents, swornReunion } from './events';
import { DIFFICULTY_MOD, addLog, assignGovernor, getRelation, refreshGovernors, type GameMessage } from './state';
import { isUndefended, killOfficer, resolveAttackAuto } from './war';
import {
  citiesOf,
  clamp,
  valuesDistance,
  FOOD_PER_1000,
  harvestFood,
  monthlyGold,
  neighborsOf,
  officersIn,
  SALARY,
} from './world';
import { cityBase } from './ctx';

/**
 * 플레이어가 "턴 종료"를 누르면 호출.
 * AI 세력들이 행동하고, 플레이어 도시를 노리는 공격은 pendingBattles에 쌓인다.
 * pendingBattles가 비면 UI가 finishMonth를 호출한다.
 */
export function runAiPhase(g: Game): void {
  const order = g.rng.shuffle(Object.values(g.s.factions).filter((f) => f.alive && f.id !== g.s.playerFaction));
  for (const f of order) {
    if (!f.alive) continue;
    const attacks = runAiFaction(g, f.id);
    refreshGovernors(g.s);
    for (const a of attacks) {
      const target = g.s.cities[a.city]!;
      // 다른 공격으로 이미 상황이 바뀌었으면 출진 취소
      if (target.faction === a.attacker || g.s.cities[a.from]?.faction !== a.attacker) {
        if (g.s.cities[a.from]?.faction === a.attacker) g.s.cities[a.from]!.food += a.food;
        continue;
      }
      a.defender = target.faction;
      if (target.faction === g.s.playerFaction && !isUndefended(g, a.city)) {
        g.s.pendingBattles.push(a);
      } else {
        resolveAttackAuto(g, a);
      }
    }
  }
}

/** 월말 처리: 수입·소비·인물 변화·이벤트, 다음 달로 */
export function finishMonth(g: Game): void {
  const s = g.s;
  economy(g);
  officersMonthly(g);
  swornReunion(g);
  diplomacyTick(g);
  checkEvents(g);
  refreshGovernors(s);

  for (const o of Object.values(s.officers)) o.acted = false;
  s.month++;
  if (s.month > 12) {
    s.month = 1;
    s.year++;
  }
  checkEnding(g);
}

function economy(g: Game): void {
  const s = g.s;
  for (const c of Object.values(s.cities)) {
    const cb = cityBase(g, c.id);
    // 인구 증가 / 민심·치안 변동
    const growth = Math.round(c.population * 0.003 * (c.support / 60) * (c.order / 60));
    c.population = Math.min(cb.maxPopulation, c.population + growth);
    if (!c.faction) continue;
    const here = officersIn(g, c.id, c.faction);
    const incomeMod = c.faction === s.playerFaction ? 1 : DIFFICULTY_MOD[s.difficulty ?? 'normal'].income;
    c.gold += Math.round(monthlyGold(c) * incomeMod);
    c.gold -= here.length * SALARY;
    const troops = here.reduce((t, o) => t + o.troops, 0);
    c.food -= Math.round((troops / 1000) * FOOD_PER_1000);
    if (s.month === 9) {
      const h = Math.round(harvestFood(c) * incomeMod);
      c.food += h;
      if (c.faction === s.playerFaction && c.id === s.factions[c.faction]!.capital) {
        s.messages.push({ title: '가을 수확', text: `수확의 계절. 각 도시에 군량이 들어왔습니다. (${cname(g, c.id)} +${h.toLocaleString()})`, kind: 'info' });
      }
    }
    if (c.gold < 0) {
      // 녹봉을 못 주면 충성 하락
      for (const o of here) o.loyalty = clamp(o.loyalty - 3, 0, 100);
      c.gold = 0;
    }
    if (c.food < 0) {
      // 군량 부족 → 탈영
      for (const o of here) o.troops = Math.floor(o.troops * 0.85);
      c.food = 0;
      if (c.faction === s.playerFaction) s.messages.push({ title: '군량 부족', text: `${cname(g, c.id)}에 군량이 떨어져 병사들이 탈영하고 있습니다!`, kind: 'notice' });
    }
    // 치안은 태수의 무력/통솔에 따라 서서히 변함
    const gov = c.governor ? base(g, c.governor) : null;
    if (!gov || gov.leadership + gov.war < 110) c.order = clamp(c.order - (g.rng.chance(40) ? 1 : 0), 0, 100);
    if (c.order < 30) c.support = clamp(c.support - 1, 0, 100);
    // 재해
    if (g.rng.chance(0.8)) disaster(g, c.id);
  }
}

function disaster(g: Game, cityId: string): void {
  const c = g.s.cities[cityId]!;
  const r = g.rng.int(0, 2);
  let text = '';
  if (r === 0) {
    c.agriculture = Math.round(c.agriculture * 0.85);
    text = '메뚜기 떼가 논밭을 휩쓸었습니다.';
  } else if (r === 1) {
    c.walls = Math.round(c.walls * 0.85);
    c.agriculture = Math.round(c.agriculture * 0.9);
    text = '홍수로 성벽과 논밭이 무너졌습니다.';
  } else {
    c.population = Math.round(c.population * 0.93);
    c.support = clamp(c.support - 5, 0, 100);
    text = '역병이 돌아 백성들이 쓰러졌습니다.';
  }
  addLog(g.s, `${cname(g, cityId)} 재해: ${text}`);
  if (c.faction === g.s.playerFaction) g.s.messages.push({ title: '재해', text: `${cname(g, cityId)}: ${text}`, kind: 'info' });
}

function officersMonthly(g: Game): void {
  const s = g.s;
  for (const o of Object.values(s.officers)) {
    const b = base(g, o.id);
    // 등장
    if (o.status === 'unborn') {
      if (b.deathYear < s.year) {
        o.status = 'dead';
        continue;
      }
      if (b.debutYear > s.year) continue;
      debut(g, o.id);
      continue;
    }
    if (o.status === 'dead') continue;

    // 수명
    if (s.year > b.deathYear || (s.year === b.deathYear && g.rng.chance(100 / (13 - s.month)))) {
      const healer =
        o.status === 'serving' &&
        Object.values(s.officers).some((x) => x.status === 'serving' && x.faction === o.faction && base(g, x.id).skills.includes('medicine'));
      if (healer && !s.flags[`ext_${o.id}`] && g.rng.chance(50)) {
        s.flags[`ext_${o.id}`] = s.year + 2;
      }
      const ext = Number(s.flags[`ext_${o.id}`] ?? 0);
      if (!ext || s.year >= ext) {
        killOfficer(g, o.id, '병사');
        continue;
      }
    }

    if (o.status === 'free') {
      // 재야 무장은 가끔 다른 도시로 떠돈다
      if (g.rng.chance(5)) {
        const n = neighborsOf(g, o.city);
        if (n.length) {
          o.city = g.rng.pick(n).to;
          o.found = false;
        }
      }
      continue;
    }

    if (o.status === 'serving' && o.faction) {
      const f = s.factions[o.faction]!;
      if (f.ruler === o.id) {
        o.loyalty = 100;
        continue;
      }
      // 상성에 따른 충성 변화
      const cd = valuesDistance(base(g, f.ruler).values, b.values);
      if (cd <= 10 && g.rng.chance(30)) o.loyalty = clamp(o.loyalty + 1, 0, 100);
      if (cd >= 40 && g.rng.chance(20 + b.ambition)) o.loyalty = clamp(o.loyalty - 1, 0, 100);
      // 출분
      if (o.loyalty < 35 && g.rng.chance((35 - o.loyalty) / 2 + b.ambition)) {
        const from = o.faction;
        const city = o.city;
        o.status = 'free';
        o.faction = null;
        o.troops = 0;
        o.found = false;
        assignGovernor(s, city);
        addLog(s, `${b.name}이(가) ${fname(g, from)}을(를) 떠남`);
        if (from === s.playerFaction) s.messages.push({ title: '출분', text: `${b.name}이(가) 불만을 품고 떠났습니다.`, kind: 'notice' });
      }
    }
  }
}

function debut(g: Game, id: string): void {
  const s = g.s;
  const o = s.officers[id]!;
  const b = base(g, id);
  // 아버지가 어느 세력에서 일하고 있으면 그 세력으로
  const father = b.father ? s.officers[b.father] : undefined;
  if (father?.status === 'serving' && father.faction && s.cities[father.city]?.faction === father.faction) {
    o.status = 'free';
    joinFaction(g, id, father.faction, father.city);
    s.officers[id]!.loyalty = 95;
    if (father.faction === s.playerFaction) {
      s.messages.push({ title: '성인', text: `${oname(g, b.father!)}의 자식 ${b.name}이(가) 성인이 되어 출사했습니다.`, kind: 'info' });
    }
    return;
  }
  o.status = 'free';
  o.faction = null;
  o.city = b.homeCity ?? o.city ?? Object.keys(s.cities)[0]!;
  o.found = false;
}

function diplomacyTick(g: Game): void {
  for (const [k, r] of Object.entries(g.s.relations)) {
    if (r.treaty !== 'none') {
      r.treatyMonths--;
      if (r.treatyMonths <= 0) {
        const [a, b] = k.split('|') as [string, string];
        if (g.s.factions[a]?.alive && g.s.factions[b]?.alive) {
          addLog(g.s, `${fname(g, a)}-${fname(g, b)} ${r.treaty === 'alliance' ? '동맹' : '정전'} 만료`);
          if (a === g.s.playerFaction || b === g.s.playerFaction)
            g.s.messages.push({ title: '조약 만료', text: `${fname(g, a === g.s.playerFaction ? b : a)}과(와)의 ${r.treaty === 'alliance' ? '동맹' : '정전'}이 만료되었습니다.`, kind: 'notice' });
        }
        r.treaty = 'none';
        r.treatyMonths = 0;
      }
    }
    // 우호도는 서서히 50으로 수렴
    if (g.rng.chance(20)) r.friendship += r.friendship > 50 ? -1 : r.friendship < 50 ? 1 : 0;
  }
}

export function checkEnding(g: Game): void {
  const s = g.s;
  if (s.ending) return;
  const me = s.factions[s.playerFaction]!;
  if (!me.alive) {
    s.ending = { type: 'defeat', text: `${me.name}은(는) 역사 속으로 사라졌다...` };
    s.messages.push({ title: '멸망', text: s.ending.text, kind: 'ending' });
    return;
  }
  const rivals = Object.values(s.factions).filter((f) => f.alive && f.id !== s.playerFaction);
  if (rivals.length === 0) {
    s.ending = {
      type: 'victory',
      text: `${s.year}년, ${oname(g, me.ruler)}이(가) 마침내 천하를 통일했다! 오랜 난세가 끝나고 새 시대가 열렸다.`,
    };
    s.messages.push({ title: '천하통일', text: s.ending.text, kind: 'ending' });
  }
}

/** 한 번에 띄우는 팝업 최대 개수 (B6) */
export const MAX_POPUPS = 3;

/**
 * 알림 우선순위 정리 (설계노트 17-3, B6).
 * - 정보(info)는 기록만, 중요(notice·death)는 상단 알림, 긴급(war·ending)과 역사 이벤트(event)만 팝업
 * - 팝업이 3개를 넘으면 앞의 2개만 남기고 나머지는 "그 외 알림" 한 개로 묶는다
 */
export function triageMessages(g: Game): void {
  const s = g.s;
  const popups: GameMessage[] = [];
  s.notices ??= [];
  for (const m of s.messages) {
    const k = m.kind ?? 'info';
    if (k === 'war' || k === 'ending' || k === 'event') popups.push(m);
    else {
      addLog(s, `[${m.title}] ${m.text}`);
      if (k === 'notice' || k === 'death') s.notices.push(`${m.title}: ${m.text}`);
    }
  }
  // 엔딩 → 긴급 → 역사 이벤트 순
  const rank = (m: GameMessage) => (m.kind === 'ending' ? 0 : m.kind === 'war' ? 1 : 2);
  popups.sort((a, b) => rank(a) - rank(b));
  if (popups.length > MAX_POPUPS) {
    const shown = popups.slice(0, MAX_POPUPS - 1);
    const rest = popups.slice(MAX_POPUPS - 1);
    for (const m of rest) addLog(s, `[${m.title}] ${m.text}`);
    shown.push({
      title: `그 외 알림 ${rest.length}건`,
      text: rest.map((m) => `· ${m.title}: ${m.text}`).join('\n') + '\n\n(전체 내용은 기록에서 볼 수 있습니다)',
      kind: 'war',
    });
    s.messages = shown;
  } else s.messages = popups;
}

/** AI의 외교 제안에 대한 플레이어 응답 */
export function answerProposal(g: Game, index: number, accept: boolean): string {
  const p = g.s.proposals[index];
  if (!p) return '';
  g.s.proposals.splice(index, 1);
  const r = getRelation(g.s, p.from, g.s.playerFaction);
  if (!g.s.factions[p.from]?.alive) return '';
  if (accept) {
    setTreaty(g, p.from, g.s.playerFaction, p.type === 'alliance' ? 'alliance' : 'truce');
    r.friendship = clamp(r.friendship + 5, 0, 100);
    return `${fname(g, p.from)}과(와) ${p.type === 'alliance' ? '동맹' : '정전'}을 맺었습니다.`;
  }
  r.friendship = clamp(r.friendship - 8, 0, 100);
  return `${fname(g, p.from)}의 제안을 거절했습니다.`;
}

/** 플레이어 세력 요약 (상단바) */
export function playerSummary(g: Game) {
  const cs = citiesOf(g, g.s.playerFaction);
  return {
    cities: cs.length,
    gold: cs.reduce((a, c) => a + c.gold, 0),
    food: cs.reduce((a, c) => a + c.food, 0),
  };
}
