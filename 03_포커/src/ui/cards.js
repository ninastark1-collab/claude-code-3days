// 카드 한 장을 그리는 DOM 도우미 (연습/온라인 공통)
import { SUIT_SYMBOL, RANK_LABEL } from '../game/deck.js';

export const isRed = (card) => card.suit === 'H' || card.suit === 'D';
export const rankText = (card) => RANK_LABEL[card.rank] ?? card.rank;
export const rankHtml = (card) => `<span class="r${card.rank === 10 ? ' ten' : ''}">${rankText(card)}</span>`;

// 무늬는 글꼴/기기마다 모양이 달라지지 않도록 SVG로 직접 그림 (♠ ♥ ♦ ♣ 4종)
const SUIT_PATHS = {
  S: '<path d="M50 4C36 24 6 39 6 61c0 13 10 22 23 22 8 0 14-4 18-9-1 10-5 17-13 22h32c-8-5-12-12-13-22 4 5 10 9 18 9 13 0 23-9 23-22C94 39 64 24 50 4z"/>',
  H: '<path d="M50 90C22 68 5 51 5 31 5 16 17 5 31 5c9 0 15 5 19 12 4-7 10-12 19-12 14 0 26 11 26 26 0 20-17 37-45 59z"/>',
  D: '<path d="M50 3 89 50 50 97 11 50z"/>',
  C: '<circle cx="50" cy="27" r="20"/><circle cx="26" cy="57" r="20"/><circle cx="74" cy="57" r="20"/><circle cx="50" cy="52" r="12"/><path d="M46 55c0 17-4 28-12 41h32c-8-13-12-24-12-41z"/>',
};
export const suitSvg = (suit) =>
  `<svg class="suit" viewBox="0 0 100 100" aria-label="${SUIT_SYMBOL[suit]}">${SUIT_PATHS[suit]}</svg>`;

// 아직 공개되지 않은 카드 자리용 (뒷면만 보이므로 앞면 내용은 의미 없음)
export const BLANK_CARD = { rank: 2, suit: 'S', blank: true };

export function cardEl(card, { faceDown = false } = {}) {
  const el = document.createElement('div');
  el.className = 'card' + (faceDown ? ' face-down' : '');
  if (card.blank) {
    el.innerHTML = '<div class="card-inner"><div class="face"></div><div class="back"><div class="emblem-mini">' + suitSvg('S') + '</div></div></div>';
    return el;
  }
  const court = card.rank >= 11 && card.rank <= 13;
  el.innerHTML = `
    <div class="card-inner">
      <div class="face ${isRed(card) ? 'red' : 'black'}${court ? ' court' : ''}">
        <div class="corner">${rankHtml(card)}${suitSvg(card.suit)}</div>
        <div class="pip">${suitSvg(card.suit)}</div>
      </div>
      <div class="back"><div class="emblem-mini">${suitSvg('S')}</div></div>
    </div>`;
  return el;
}

export function renderRow(container, cards, opts) {
  container.replaceChildren(...cards.map((c) => cardEl(c, opts)));
}

// 이미 그려진 카드들을 애니메이션으로 뒤집기
export function flipAll(container, faceDown) {
  [...container.children].forEach((el) => el.classList.toggle('face-down', faceDown));
}

export const sameCard = (a, b) => a && b && a.rank === b.rank && a.suit === b.suit;
