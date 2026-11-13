// 글꼴 세 벌(OFL)을 node_modules/@fontsource 에서 assets/fonts 로 복사하고
// src/ui/fonts.css (@font-face, unicode-range 분할) 를 만든다. 게임 실행 중 인터넷에서 받지 않는다.
// 사용법: node scripts/copy-fonts.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SETS = [
  { pkg: 'song-myung', css: '400.css' }, // 제목·대사
  { pkg: 'noto-serif-kr', css: '900.css' }, // 한자·낙관
  { pkg: 'noto-serif-kr', css: '600.css' }, // 한자 보조(디자인 문서의 600 굵기)
  { pkg: 'ibm-plex-sans-kr', css: '400.css' }, // UI·숫자
  { pkg: 'ibm-plex-sans-kr', css: '500.css' },
  { pkg: 'ibm-plex-sans-kr', css: '600.css' },
];

const outDir = path.join(ROOT, 'assets', 'fonts');
fs.mkdirSync(outDir, { recursive: true });
let css = '/* 자동 생성: scripts/copy-fonts.mjs — 직접 고치지 말 것. 글꼴 라이선스: assets/fonts/LICENSE-*.txt (SIL OFL 1.1) */\n';
let files = 0;
let bytes = 0;
for (const set of SETS) {
  const pkgDir = path.join(ROOT, 'node_modules', '@fontsource', set.pkg);
  const src = fs.readFileSync(path.join(pkgDir, set.css), 'utf8');
  fs.mkdirSync(path.join(outDir, set.pkg), { recursive: true });
  fs.copyFileSync(path.join(pkgDir, 'LICENSE'), path.join(outDir, `LICENSE-${set.pkg}.txt`));
  // woff2만 남기고(모든 대상 브라우저가 지원) woff 대체 경로는 뺀다
  const out = src.replace(/src:\s*url\(\.\/files\/([^)]+\.woff2)\)\s*format\('woff2'\)(,\s*url\([^)]+\)\s*format\('woff'\))?/g, (_m, file) => {
    const from = path.join(pkgDir, 'files', file);
    const to = path.join(outDir, set.pkg, file);
    if (!fs.existsSync(to)) {
      fs.copyFileSync(from, to);
      files++;
      bytes += fs.statSync(to).size;
    }
    return `src: url('../../assets/fonts/${set.pkg}/${file}') format('woff2')`;
  });
  css += `\n/* ${set.pkg} ${set.css} */\n` + out;
}
fs.writeFileSync(path.join(ROOT, 'src', 'ui', 'fonts.css'), css);
console.log(`복사한 글꼴 파일 ${files}개, ${(bytes / 1024 / 1024).toFixed(1)}MB → assets/fonts`);
