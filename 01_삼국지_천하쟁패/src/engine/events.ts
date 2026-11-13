import { base, cname, fname, oname, type Game } from './ctx';
import { absorbFaction, joinFaction } from './commands';
import { addLog, assignGovernor, getRelation } from './state';
import { citiesOf, officersOf } from './world';

/**
 * 『삼국지연의』 기반 역사 이벤트. 매달 말 checkEvents가 호출된다.
 * 각 이벤트는 flags에 기록해 한 번만 일어난다.
 */

const serving = (g: Game, id: string) => g.s.officers[id]?.status === 'serving';
const rulerOf = (g: Game, id: string) => {
  const o = g.s.officers[id];
  return o?.status === 'serving' && o.faction && g.s.factions[o.faction]?.ruler === id ? o.faction : null;
};

interface StoryEvent {
  id: string;
  check: (g: Game) => boolean;
  run: (g: Game) => void;
}

const EVENTS: StoryEvent[] = [
  {
    id: 'peach_garden',
    check: (g) => g.s.scenarioId === 's184' && serving(g, 'liu_bei') && serving(g, 'guan_yu') && serving(g, 'zhang_fei'),
    run: (g) =>
      g.s.messages.push({
        title: '도원결의',
        speaker: '유비',
        text: '복숭아꽃 만발한 동산에서 세 사람이 하늘에 맹세했다. "한날한시에 태어나지는 못했으나 한날한시에 죽기를 원하노라." 유비·관우·장비가 의형제를 맺었다.',
        kind: 'event',
      }),
  },
  {
    id: 'sun_ce_independence',
    check: (g) => {
      if (g.s.year < 195 || !serving(g, 'sun_ce')) return false;
      const f = g.s.officers.sun_ce!.faction!;
      const ruler = g.s.factions[f]!.ruler;
      return ruler === 'yuan_shu' && g.s.cities[g.s.officers.sun_ce!.city]?.faction === f && citiesOf(g, f).length > 1;
    },
    run: (g) => {
      const sc = g.s.officers.sun_ce!;
      const old = sc.faction!;
      const fid = g.s.factions.sun_ce ? `sun_ce_${g.s.year}` : 'sun_ce';
      g.s.factions[fid] = {
        id: fid,
        name: '손책군',
        ruler: 'sun_ce',
        color: '#c0392b',
        capital: sc.city,
        personality: 'aggressive',
        alive: true,
      };
      const city = g.s.cities[sc.city]!;
      city.faction = fid;
      const followers = ['sun_ce', 'cheng_pu', 'huang_gai', 'han_dang', 'zhu_zhi', 'sun_ben'];
      for (const id of followers) {
        const o = g.s.officers[id];
        if (o?.status === 'serving' && o.faction === old) {
          o.faction = fid;
          o.loyalty = id === 'sun_ce' ? 100 : 95;
          if (id !== 'sun_ce' && o.city !== sc.city && g.s.cities[o.city]?.faction === old) o.city = sc.city;
        }
      }
      // 원래 세력의 거점이 이 도시였다면 남은 도시로 거점을 옮기고, 같은 도시의 다른 무장(원술 쪽)은 그리로 돌아간다
      const oldF = g.s.factions[old]!;
      if (oldF.capital === sc.city) oldF.capital = citiesOf(g, old)[0]!.id;
      for (const o of officersOf(g, old)) if (o.city === sc.city) o.city = oldF.capital;
      assignGovernor(g.s, oldF.capital);
      for (const id of ['zhou_yu', 'zhang_zhao', 'zhang_hong', 'lu_su']) {
        const o = g.s.officers[id];
        if (o?.status === 'free') joinFaction(g, id, fid, sc.city);
      }
      assignGovernor(g.s, sc.city);
      getRelation(g.s, fid, old).friendship = 30;
      addLog(g.s, '손책 독립');
      g.s.messages.push({
        title: '소패왕 독립',
        speaker: '손책',
        text: `"아버님의 원수를 갚고 강동을 평정하리라!" 손책이 옥새를 맡기고 받은 병사로 ${cname(g, sc.city)}에서 독립했다. 죽마고우 주유도 그를 따랐다.`,
        kind: 'event',
      });
    },
  },
  {
    id: 'emperor',
    // 낙양이나 허창을 가진 세력이 있을 때만 발생 (없으면 생길 때까지 대기)
    check: (g) => (g.s.year > 196 || (g.s.year === 196 && g.s.month >= 8)) && !!(g.s.cities.luoyang?.faction ?? g.s.cities.xuchang?.faction),
    run: (g) => {
      const holder = (g.s.cities.luoyang?.faction ?? g.s.cities.xuchang?.faction)!;
      g.s.factions[holder]!.emperor = true;
      addLog(g.s, `${fname(g, holder)} 천자 옹립`);
      g.s.messages.push({
        title: '천자 옹립',
        text: `장안을 탈출한 헌제를 ${fname(g, holder)}이(가) 맞아들였다. 천자를 끼고 제후를 호령할 대의명분을 얻었다. (등용 성공률 상승)`,
        kind: 'event',
      });
    },
  },
  {
    id: 'three_visits',
    check: (g) => g.s.year >= 207 && g.s.officers.zhuge_liang?.status === 'free' && !!rulerOf(g, 'liu_bei'),
    run: (g) => {
      const f = rulerOf(g, 'liu_bei')!;
      joinFaction(g, 'zhuge_liang', f, g.s.officers.liu_bei!.city);
      g.s.officers.zhuge_liang!.loyalty = 100;
      g.s.messages.push({
        title: '삼고초려',
        speaker: '제갈량',
        text: '유비가 눈보라를 뚫고 세 번이나 융중의 초가를 찾았다. 제갈량은 천하삼분지계를 펼쳐 보이고, 마침내 출사를 결심했다. "물고기가 물을 만났다."',
        kind: 'event',
      });
    },
  },
  {
    id: 'southeast_wind',
    check: (g) => g.s.year === 208 && g.s.month >= 9 && (serving(g, 'zhuge_liang') || serving(g, 'zhou_yu')),
    run: (g) => {
      g.s.flags.southeastWind = 208;
      g.s.messages.push({
        title: '동남풍',
        speaker: '제갈량',
        text: '칠성단에 올라 바람을 비니, 겨울 장강에 때아닌 동남풍이 불기 시작했다. (208년 10~12월, 강가 전투에서 화계가 크게 강해짐)',
        kind: 'event',
      });
    },
  },
  {
    id: 'enter_shu',
    check: (g) => {
      if (g.s.year < 211 || !rulerOf(g, 'liu_bei') || !rulerOf(g, 'liu_zhang')) return false;
      const zs = g.s.officers.zhang_song;
      return zs?.status === 'serving' && zs.faction === rulerOf(g, 'liu_zhang');
    },
    run: (g) => {
      const f = rulerOf(g, 'liu_bei')!;
      const city = g.s.officers.liu_bei!.city;
      const joined: string[] = [];
      for (const id of ['zhang_song', 'fa_zheng', 'meng_da']) {
        const o = g.s.officers[id];
        if (o?.status === 'serving' && o.faction === rulerOf(g, 'liu_zhang')) {
          joinFaction(g, id, f, city);
          joined.push(oname(g, id));
        }
      }
      g.s.messages.push({
        title: '서촉 지형도',
        speaker: '장송',
        text: `"유장은 어리석어 익주를 지킬 그릇이 못 됩니다." 장송이 서촉의 지형도를 바치고 ${joined.join('·')}이(가) 유비에게 몸을 맡겼다.`,
        kind: 'event',
      });
    },
  },
  {
    id: 'gaoping_coup',
    check: (g) => {
      if (g.s.year < 249 || !serving(g, 'sima_yi')) return false;
      const f = g.s.officers.sima_yi!.faction!;
      const ruler = g.s.factions[f]!.ruler;
      return ruler !== 'sima_yi' && base(g, ruler).father !== 'sima_yi' && g.ix.officer.get(ruler)!.name.startsWith('조');
    },
    run: (g) => {
      const f = g.s.officers.sima_yi!.faction!;
      const old = g.s.factions[f]!.ruler;
      g.s.factions[f]!.ruler = 'sima_yi';
      g.s.officers.sima_yi!.loyalty = 100;
      const oldO = g.s.officers[old]!;
      oldO.loyalty = 40;
      g.s.factions[f]!.name = g.s.factions[f]!.name.replace(/^조\S*군$/, '사마의군');
      addLog(g.s, `고평릉 정변: 사마의가 ${oname(g, old)}을(를) 몰아냄`);
      g.s.messages.push({
        title: '고평릉 정변',
        speaker: '사마의',
        text: `오랫동안 병을 핑계로 몸을 낮추던 사마의가 황제의 능 참배 틈을 타 군사를 일으켰다. ${oname(g, old)}은(는) 실권을 잃고, 세력의 실권은 사마씨에게 넘어갔다.`,
        kind: 'event',
      });
    },
  },
  {
    id: 'proclaim_emperor',
    check: (g) => {
      const total = Object.keys(g.s.cities).length;
      return Object.values(g.s.factions).some((f) => f.alive && citiesOf(g, f.id).length >= Math.ceil(total / 3));
    },
    run: (g) => {
      const total = Object.keys(g.s.cities).length;
      const f = Object.values(g.s.factions).find((x) => x.alive && citiesOf(g, x.id).length >= Math.ceil(total / 3))!;
      for (const o of officersOf(g, f.id)) o.loyalty = Math.min(100, o.loyalty + 10);
      g.s.messages.push({
        title: '칭제',
        speaker: oname(g, f.ruler),
        text: `천하의 3분의 1을 차지한 ${oname(g, f.ruler)}이(가) 스스로 황제에 올랐다. 휘하 무장들의 충성이 높아졌다.`,
        kind: 'event',
      });
    },
  },
];

export function checkEvents(g: Game): void {
  if (!g.s.historicalEvents) return;
  for (const e of EVENTS) {
    if (g.s.flags[`ev_${e.id}`]) continue;
    if (!e.check(g)) continue;
    g.s.flags[`ev_${e.id}`] = true;
    e.run(g);
  }
}

/** 의형제 재회: 다른 세력에 있는 의형제가 군주인 형제에게 돌아간다 (관우 천리행) */
export function swornReunion(g: Game): void {
  if (!g.s.historicalEvents) return;
  for (const o of Object.values(g.s.officers)) {
    if (o.status !== 'serving' || !o.faction) continue;
    const b = base(g, o.id);
    if (!b.sworn) continue;
    const myRuler = g.s.factions[o.faction]!.ruler;
    if (base(g, myRuler).sworn === b.sworn) continue;
    const target = Object.values(g.s.factions).find((f) => f.alive && f.id !== o.faction && base(g, f.ruler).sworn === b.sworn);
    if (!target || !g.rng.chance(15)) continue;
    const from = o.faction;
    joinFaction(g, o.id, target.id, target.capital);
    g.s.officers[o.id]!.loyalty = 100;
    g.s.messages.push({
      title: '천리행',
      speaker: b.name,
      text: `"형님이 계신 곳이라면 천 리 길도 멀지 않다!" ${b.name}이(가) ${fname(g, from)}을(를) 떠나 ${oname(g, target.ruler)}에게 돌아갔다.`,
      kind: 'event',
    });
  }
}

/** 포로 석방 훅: 칠종칠금. true면 일반 석방 처리 대신 이벤트로 처리됨 */
export function onRelease(g: Game, captiveId: string, captor: string): boolean {
  if (captiveId !== 'meng_huo' || !g.s.historicalEvents) return false;
  const hasZhuge = g.s.officers.zhuge_liang?.status === 'serving' && g.s.officers.zhuge_liang.faction === captor;
  if (!hasZhuge) return false;
  // 38장 안전핀: 같은 달에 잡았다 풀었다를 반복하는 파밍 방지 (최소 1개월 간격)
  const now = g.s.year * 12 + g.s.month;
  if (Number(g.s.flags.menghuoLast ?? -99) >= now) return false;
  g.s.flags.menghuoLast = now;
  const n = Number(g.s.flags.menghuo ?? 0) + 1;
  g.s.flags.menghuo = n;
  if (n < 7) {
    g.s.messages.push({ title: `칠종칠금 (${n}/7)`, speaker: '맹획', text: '"이번엔 방심했을 뿐이다! 다시 싸우자!" 맹획이 풀려나 돌아갔다.', kind: 'event' });
    return false;
  }
  const mh = g.s.officers.meng_huo!;
  const mhFaction = mh.faction;
  joinFaction(g, 'meng_huo', captor, g.s.factions[captor]!.capital);
  g.s.officers.meng_huo!.loyalty = 100;
  // 맹획이 잡힌 동안 세력은 다른 이(축융 등)가 이어받았을 수 있으므로 군주와 상관없이 남만 세력 전체가 귀순
  if (mhFaction && mhFaction !== captor && g.s.factions[mhFaction]?.alive) absorbFaction(g, mhFaction, captor);
  g.s.messages.push({
    title: '칠종칠금',
    speaker: '맹획',
    text: '일곱 번 사로잡혔다가 일곱 번 풀려난 맹획이 마침내 무릎을 꿇었다. "승상의 하늘 같은 위엄, 남만은 다시는 배반하지 않겠습니다."',
    kind: 'event',
  });
  return true;
}
