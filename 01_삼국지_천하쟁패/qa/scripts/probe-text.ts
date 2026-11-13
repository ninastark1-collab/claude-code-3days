/**
 * 문장 프로브: 조사 병기·조사 오류, 영문 id 노출, 깨진 문자, 용어 통일.
 * 소스 문자열(정적) + 실제 진행 로그·메시지(동적) 둘 다 본다.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Report, engine, newGame, stepMonthAuto } from './lib';

const r = new Report('probe-text');
const { data } = engine();

function walk(dir: string, out: string[] = []) {
  for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p, out); else if (/\.(ts|tsx|json)$/.test(f)) out.push(p); }
  return out;
}
const files = [...walk('src'), ...walk('data')];

await r.check('C5-01 조사 병기 (소스)', () => {
  const re = /이\(가\)|을\(를\)|은\(는\)|와\(과\)|과\(와\)|\(으\)로|\(이\)|로\(으로\)/g;
  const hits: string[] = []; let total = 0;
  for (const f of files) readFileSync(f, 'utf8').split('\n').forEach((l, i) => { const m = l.match(re); if (m) { total += m.length; hits.push(`${f}:${i + 1}: ${l.trim().slice(0, 110)}`); } });
  total ? r.fail('C5-01', 'S3', '개발', `조사 병기 ${total}곳 (${hits.length}줄) — 받침에 따라 조사를 고르는 함수 필요, 문장은 시나리오 참조`, hits.slice(0, 60).join('\n')) : r.pass('C5-01', '조사 병기 없음');
});

// 받침 판별
const jong = (ch: string) => { const c = ch.charCodeAt(0) - 0xac00; return c < 0 || c > 11171 ? -1 : c % 28; };
const names = new Set<string>([...data.officers.map((o) => o.name), ...data.cities.map((c) => c.name), ...data.scenarios.flatMap((s) => s.factions.map((f) => f.name))]);
// 한 글자 이름(오·완·계·초·업)은 일반 단어와 섞여 오탐이 많아 제외
const sortedNames = [...names].filter((n) => n.length >= 2).sort((a, b) => b.length - a.length);
function josaErrors(text: string): string[] {
  const out: string[] = [];
  for (const n of sortedNames) {
    let idx = text.indexOf(n);
    while (idx >= 0) {
      const after = text.slice(idx + n.length, idx + n.length + 4);
      const last = n[n.length - 1]!; const j = jong(last);
      if (j >= 0) {
        const has = j !== 0; const isL = j === 8;
        const bad =
          (has && /^(가|를|는|와|랑)[\s.,!?"']/.test(after)) ||
          (!has && /^(이|을|은|과)[\s.,!?"']/.test(after) && !/^이\(/.test(after)) ||
          (has && !isL && /^로(부터|서|써)?[\s.,!?"']/.test(after)) ||
          ((!has || isL) && /^으로/.test(after));
        if (bad) out.push(`${n}${after.trim().slice(0, 3)}`);
      }
      idx = text.indexOf(n, idx + n.length);
    }
  }
  return out;
}

await r.check('C5-01/C5-04 실행 문장', async () => {
  const texts: string[] = [];
  for (const sc of ['s184', 's194', 's208']) {
    const g = newGame(sc, undefined, 21);
    texts.push(...g.s.messages.map((m) => `${m.title} ${m.text}`));
    for (let m = 0; m < 48; m++) for (const msg of await stepMonthAuto(g)) texts.push(`${msg.title} ${msg.text}`);
    texts.push(...g.s.log.map((l) => l.text));
  }
  const josa = new Map<string, number>();
  for (const t of texts) for (const e of josaErrors(t)) josa.set(e, (josa.get(e) ?? 0) + 1);
  josa.size ? r.fail('C5-01', 'S3', '개발', `받침과 안 맞는 조사 ${josa.size}종 (예: ${[...josa.keys()].slice(0, 5).join(', ')})`, [...josa].sort((a, b) => b[1] - a[1]).slice(0, 50).map(([k, v]) => `${k} ×${v}`).join('\n')) : r.pass('C5-01', `실행 문장 ${texts.length}개 조사 오류 없음`);
  const ids = new Set<string>(); for (const t of texts) for (const m of t.match(/\b[a-z]+(?:_[a-z0-9]+)+\b/g) ?? []) ids.add(m);
  ids.size ? r.fail('C5-04', 'S3', '개발', `화면 문장에 영문 id 노출 ${ids.size}종`, [...ids].slice(0, 40).join(', ')) : r.pass('C5-04', '영문 id 노출 없음');
  const broken = texts.filter((t) => /�|undefined|NaN|\[object Object\]|null/.test(t));
  broken.length ? r.fail('C5-04', 'S2', '개발', `깨진 문자/undefined/NaN 포함 문장 ${broken.length}개`, broken.slice(0, 15).join('\n')) : r.pass('C5-04', '깨진 값 없음');
});

await r.check('C5-03 용어 통일', () => {
  const pairs: [string, string][] = [['군량', '병량'], ['무장', '장수'], ['계략', '계책'], ['병력', '병사 수'], ['태수', '도독']];
  const ui = walk('src/ui');
  const count = (w: string) => ui.reduce((s, f) => s + (readFileSync(f, 'utf8').split(w).length - 1), 0);
  const out = pairs.map(([a, b]) => `${a} ${count(a)} / ${b} ${count(b)}`);
  const mixed = pairs.filter(([a, b]) => count(a) > 0 && count(b) > 0);
  mixed.length ? r.warn('C5-03', '시나리오', `혼용 용어 ${mixed.map((p) => p.join('/')).join(', ')} — 하나로 통일할지 결정`, out.join('\n')) : r.pass('C5-03', '용어 혼용 없음');
});

r.write();
