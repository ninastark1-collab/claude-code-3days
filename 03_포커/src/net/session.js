// 이 폰의 닉네임(계속 기억)과 참가 정보(새로고침해도 같은 자리로 돌아오기 위해) 저장
// 참가 정보는 탭마다 따로(sessionStorage) → 같은 폰에서 탭을 여러 개 열어도 서로 안 섞임
const read = (store, k) => { try { return JSON.parse(store.getItem(k)); } catch { return null; } };
const write = (store, k, v) => { try { v == null ? store.removeItem(k) : store.setItem(k, JSON.stringify(v)); } catch {} };

export const getNickname = () => read(localStorage, 'mp.nickname') ?? '';
export const setNickname = (n) => write(localStorage, 'mp.nickname', n);

/** { code, room_id, player_id, secret } */
export const getSession = () => read(sessionStorage, 'mp.session');
export const setSession = (s) => write(sessionStorage, 'mp.session', s);
export const clearSession = () => write(sessionStorage, 'mp.session', null);
