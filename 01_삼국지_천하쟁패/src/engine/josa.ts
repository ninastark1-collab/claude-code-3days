/** 받침에 따라 조사를 고른다: josa('조조', '을/를') → '조조를' */
export function josa(word: string, pair: '을/를' | '이/가' | '은/는' | '과/와' | '으로/로' | '아/야'): string {
  const ch = word.charCodeAt(word.length - 1);
  if (ch < 0xac00 || ch > 0xd7a3) return word + pair.split('/')[1];
  const jong = (ch - 0xac00) % 28;
  const [a, b] = pair.split('/') as [string, string];
  // '으로'는 받침 ㄹ(8) 뒤에서 '로'
  if (pair === '으로/로') return word + (jong === 0 || jong === 8 ? b : a);
  return word + (jong ? a : b);
}
