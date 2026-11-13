/**
 * 역사 전투 시나리오 초안 검증 + 전장 지도 미리보기 생성 (읽기 전용 검사, 미리보기 md만 씀)
 * 사용법: node 전투시나리오/validate-scenarios.cjs
 * 검사: 장수 id 존재, 생몰·등장 연도, 좌표 범위, 칸 겹침, 배치 칸 지형, 매복 칸, 병력 비율, 도시 id, 일기토 장수 id
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const list = (x) => (Array.isArray(x) ? x : x.officers || Object.values(x));

const data = read('전투시나리오/battle-scenarios.draft.json');
const officers = new Map([...list(read('data/officers.json')), ...list(read('data/officers-ext.json'))].map((o) => [o.id, o]));
const cities = new Set(read('data/cities.json').map((c) => c.id));
const W = 24, H = 16;

const CH = { plain: '.', forest: '%', mountain: '^', river: '~', water: 'W', bridge: '=', wall: '#', gate: 'G', town: ':', keep: 'K', camp: 'C', stockade: 'X', depot: 'D', dam: 'H', ford: ',', beacon: 'B' };
const errors = [], warns = [];
const err = (s, m) => errors.push(`[${s}] ${m}`);
const warn = (s, m) => warns.push(`[${s}] ${m}`);

function paint(sc) {
  const g = Array.from({ length: H }, () => Array(W).fill('plain'));
  const set = (x, y, t) => { if (x >= 0 && y >= 0 && x < W && y < H) g[y][x] = t; else err(sc.id, `칠하기 범위 밖 (${x},${y}) ${t}`); };
  for (const op of sc.map.paint) {
    if (op.p) { set(op.p[0], op.p[1], op.t); continue; }
    const [x1, y1, x2, y2] = op.r;
    if (x1 > x2 || y1 > y2) err(sc.id, `사각형 좌표 순서 오류 ${JSON.stringify(op.r)}`);
    for (let y = y1; y <= y2; y++)
      for (let x = x1; x <= x2; x++) {
        if (op.t === 'wallring') set(x, y, x === x1 || x === x2 || y === y1 || y === y2 ? 'wall' : 'town');
        else set(x, y, op.t);
      }
  }
  return g;
}

const md = ['# 전장 지도 미리보기', '', '> `validate-scenarios.cjs`가 `battle-scenarios.draft.json`에서 자동으로 그린 지도다. 데이터를 고치면 다시 실행해서 갱신한다.', '', '**지형**: `.` 평지 `%` 숲 `^` 산·고지 `~` 강 `W` 깊은 물 `=` 다리 `,` 여울 `#` 성벽 `G` 성문 `:` 성내·마을 `K` 본성 `C` 영채 `X` 녹각·목책 `D` 군량고·미끼 `H` 둑 `B` 봉화대', '', '**부대**: 숫자 `1~9,0` = 공격 측 / 소문자 `a~k` = 방어 측 / 표 아래 목록 참고. `*`는 연의 모드 전용 부대', ''];

for (const sc of data.scenarios) {
  const g = paint(sc);
  // 트리거 도시
  const t = sc.trigger || {};
  for (const k of ['city', 'fromCity', 'toCity']) if (t[k] && !cities.has(t[k])) err(sc.id, `도시 id 없음: ${k}=${t[k]}`);
  for (const c of t.cityAny || []) if (!cities.has(c)) err(sc.id, `도시 id 없음: ${c}`);
  const [y0, y1] = sc.year;
  const overlay = g.map((row) => row.map((t) => CH[t] ?? '?'));
  const seen = new Map();
  const legend = [];
  for (const side of ['atk', 'def']) {
    const units = sc.deploy[side] || [];
    let sum = 0, sumBoth = 0;
    units.forEach((u, i) => {
      const mark = side === 'atk' ? '1234567890'[i] : 'abcdefghijk'[i];
      sum += u.troopsShare;
      if ((u.mode ?? 'both') === 'both') sumBoth += u.troopsShare;
      if (u.officer !== 'auto_garrison') {
        const o = officers.get(u.officer);
        if (!o) err(sc.id, `장수 id 없음: ${u.officer}`);
        else {
          if (o.debutYear > y1) (u.optional ? warn : err)(sc.id, `${o.name}(${u.officer}) 등장 ${o.debutYear} > 전투 ${y1}`);
          if (o.deathYear < y0) (u.dataConflict ? warn : err)(sc.id, `${o.name}(${u.officer}) 사망 ${o.deathYear} < 전투 ${y0}${u.dataConflict ? ' — 문서화된 데이터 충돌' : ''}`);
          if (o.birthYear + 14 > y1) warn(sc.id, `${o.name} 나이 ${y1 - o.birthYear}세`);
        }
      }
      const { x, y } = u;
      if (x < 0 || y < 0 || x >= W || y >= H) { err(sc.id, `${u.officer} 좌표 범위 밖 (${x},${y})`); return; }
      const key = `${x},${y}`;
      if (seen.has(key)) err(sc.id, `칸 겹침 (${key}): ${seen.get(key)} / ${u.officer}`);
      seen.set(key, u.officer);
      const tt = g[y][x];
      if ((tt === 'water' || tt === 'river') && u.kind !== 'navy') err(sc.id, `${u.officer}: 물 칸(${tt})인데 수군이 아님 (${key})`);
      if (tt === 'wall') err(sc.id, `${u.officer}: 성벽 칸 위 배치 (${key})`);
      if (u.kind === 'navy' && !['water', 'river'].includes(tt)) warn(sc.id, `${u.officer}: 수군이 육지(${tt})에서 시작 (${key})`);
      if (u.hidden && !['forest', 'mountain'].includes(tt)) err(sc.id, `${u.officer}: 매복인데 숲·산이 아님 (${tt}, ${key})`);
      overlay[y][x] = mark;
      const o = officers.get(u.officer);
      legend.push(`${mark}${u.mode === 'yanyi' ? '*' : ' '} ${o ? o.name : '(자동 배치)'} · ${u.role} · ${u.kind} · ${Math.round(u.troopsShare * 100)}%${u.optional ? ' · 조건부' : ''}`);
    });
    if (Math.abs(sumBoth - 1) > 0.12 && Math.abs(sum - 1) > 0.12) warn(sc.id, `${side} 병력 비율 합: 공통 ${sumBoth.toFixed(2)} / 전체 ${sum.toFixed(2)}`);
  }
  for (const r of sc.deploy.reinforcement || []) if (!officers.has(r.officer)) err(sc.id, `원군 장수 id 없음: ${r.officer}`);
  for (const o of sc.map.objects || []) if (o.x !== undefined && (o.x < 0 || o.x >= W || o.y < 0 || o.y >= H)) err(sc.id, `객체 좌표 범위 밖 ${o.name}`);
  md.push(`## ${sc.name} \`${sc.id}\` (${y0}${y1 !== y0 ? '~' + y1 : ''})`, '', '```', '   ' + Array.from({ length: W }, (_, i) => String(i % 10)).join(''), ...overlay.map((row, y) => String(y).padStart(2) + ' ' + row.join('')), '```', '', ...legend.map((l) => `- ${l}`), '');
}
for (const d of data.duelMatchups) for (const k of ['a', 'b']) if (!officers.has(d[k])) err('duel', `장수 id 없음: ${d[k]}`);

fs.writeFileSync(path.join(__dirname, '전장지도_미리보기.md'), md.join('\n'), 'utf8');
console.log(`시나리오 ${data.scenarios.length}개, 일기토 매치업 ${data.duelMatchups.length}개`);
console.log(`오류 ${errors.length}개`);
errors.forEach((e) => console.log('  ✗ ' + e));
console.log(`경고 ${warns.length}개`);
warns.forEach((w) => console.log('  △ ' + w));
process.exitCode = errors.length ? 1 : 0;
