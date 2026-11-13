// public/icon.svg 를 바탕으로 폰 설치용 PNG 아이콘 생성
//  - icon-192.png, icon-512.png       : 일반 아이콘 (둥근 모서리 포함)
//  - icon-maskable-512.png            : 안드로이드가 원/물방울 모양으로 잘라 쓰는 아이콘 (가장자리까지 배경)
//  - apple-touch-icon.png (180)       : 아이폰 홈 화면 (아이폰이 알아서 모서리를 둥글게 깎음)
import sharp from 'sharp';
import { readFileSync } from 'node:fs';

const spade = 'M50 4C36 24 6 39 6 61c0 13 10 22 23 22 8 0 14-4 18-9-1 10-5 17-13 22h32c-8-5-12-12-13-22 4 5 10 9 18 9 13 0 23-9 23-22C94 39 64 24 50 4z';
const defs = `<defs>
  <radialGradient id="bg" cx="40%" cy="30%" r="80%"><stop offset="0" stop-color="#1d2a26"/><stop offset="1" stop-color="#050607"/></radialGradient>
  <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7a5c18"/><stop offset=".3" stop-color="#f7e3a3"/><stop offset=".55" stop-color="#d4af37"/><stop offset=".7" stop-color="#fff4cc"/><stop offset="1" stop-color="#8a6a1f"/></linearGradient>
</defs>`;
// 꽉 찬 사각형 배경 + 가운데 작은 스페이드 (안전 영역 안)
const fullBleed = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${defs}
  <rect width="512" height="512" fill="url(#bg)"/>
  <circle cx="256" cy="256" r="170" fill="none" stroke="url(#gold)" stroke-width="8" opacity=".85"/>
  <path transform="translate(151 140) scale(2.1)" fill="url(#gold)" d="${spade}"/>
</svg>`;

const rounded = readFileSync(new URL('../public/icon.svg', import.meta.url));
const out = (name) => new URL(`../public/${name}`, import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');

await sharp(rounded, { density: 384 }).resize(192, 192).png().toFile(decodeURIComponent(out('icon-192.png')));
await sharp(rounded, { density: 384 }).resize(512, 512).png().toFile(decodeURIComponent(out('icon-512.png')));
await sharp(Buffer.from(fullBleed), { density: 384 }).resize(512, 512).png().toFile(decodeURIComponent(out('icon-maskable-512.png')));
await sharp(Buffer.from(fullBleed), { density: 384 }).resize(180, 180).png().toFile(decodeURIComponent(out('apple-touch-icon.png')));
console.log('icons done');
