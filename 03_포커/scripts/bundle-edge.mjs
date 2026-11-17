// Edge Function(index.ts + game/*.js)을 파일 1개로 합침 — Supabase 대시보드 편집기에 한 번에 붙여넣기용.
// 사용: node scripts/bundle-edge.mjs   → supabase/deploy/poker-single-file.ts
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const dir = 'supabase/functions/poker/';
const order = ['handEvaluator', 'deck', 'autoPick', 'bestPick', 'dramaDeal', 'match'];
const strip = (src) =>
  src
    .split('\n')
    .filter((l) => !/^import .* from '\.\/.*';\s*$/.test(l))
    .map((l) => l.replace(/^export (const|let|function|class) /, '$1 '))
    .join('\n');

const NL = String.fromCharCode(10);
const section = (n) =>
  (n === 'dramaDeal' ? 'const H = HAND_RANK; // dramaDeal.js 의 HAND_RANK as H' + NL : '') +
  '// ===== game/' + n + '.js =====' + NL +
  strip(readFileSync(dir + 'game/' + n + '.js', 'utf8'));
const game = order.map(section).join(NL);

const idx = readFileSync(`${dir}index.ts`, 'utf8').split('\n');
const importEnd = idx.findLastIndex((l) => /^import /.test(l));
const head = idx.slice(0, importEnd + 1).filter((l) => !/\.\/game\//.test(l));
const body = idx.slice(importEnd + 1);

mkdirSync('supabase/deploy', { recursive: true });
writeFileSync(
  'supabase/deploy/poker-single-file.ts',
  ['// @ts-nocheck', '// 자동 생성: node scripts/bundle-edge.mjs (직접 수정하지 말 것)', ...head, '', game, '', ...body].join('\n'),
);
console.log('ok');
