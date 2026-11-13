// 회원가입 / 로그인 (데모: 브라우저 localStorage에 저장)
const Auth = {
  users() { return Store.get('users', {}); },

  current() {
    const s = Store.get('session', null);
    if (!s) return null;
    return this.users()[s.email] || null;
  },

  async hash(text) {
    if (window.crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('moa::' + text));
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    // 보안 컨텍스트가 아닐 때의 단순 대체 해시 (데모용)
    let h = 0;
    for (const ch of 'moa::' + text) h = (h * 31 + ch.charCodeAt(0)) | 0;
    return 'x' + (h >>> 0).toString(16);
  },

  async signup({ name, email, password, phone, marketing }) {
    email = email.trim().toLowerCase();
    const users = this.users();
    if (users[email]) throw new Error('이미 가입된 이메일입니다.');
    users[email] = {
      name: name.trim(), email, phone: phone.trim(), marketing: !!marketing,
      hash: await this.hash(password), createdAt: new Date().toISOString(), address: null,
      points: 2000, // 신규가입 적립금
      seller: null, // 판매자 등록 시 { storeName, bizNo, phone, createdAt }
    };
    Store.set('users', users);
    Store.set('session', { email });
    return users[email];
  },

  async login(email, password) {
    email = email.trim().toLowerCase();
    const user = this.users()[email];
    if (!user || user.hash !== (await this.hash(password))) {
      throw new Error('이메일 또는 비밀번호가 일치하지 않습니다.');
    }
    Store.set('session', { email });
    return user;
  },

  logout() { Store.remove('session'); },

  updateUser(email, patch) {
    const users = this.users();
    if (!users[email]) return;
    users[email] = { ...users[email], ...patch };
    Store.set('users', users);
  },

  updateCurrent(patch) {
    const u = this.current();
    if (u) this.updateUser(u.email, patch);
  },

  addPoints(email, n) {
    const u = this.users()[email];
    if (u) this.updateUser(email, { points: Math.max(0, (u.points || 0) + n) });
  },

  async changePassword(oldPw, newPw) {
    const u = this.current();
    if (!u || u.hash !== (await this.hash(oldPw))) throw new Error('현재 비밀번호가 일치하지 않습니다.');
    this.updateCurrent({ hash: await this.hash(newPw) });
  },

  // 로그인 필요 페이지에서 호출: 비로그인 시 로그인 페이지로 이동
  require() {
    if (this.current()) return true;
    const here = location.pathname.split('/').pop() + location.search;
    location.replace('login.html?redirect=' + encodeURIComponent(here || 'index.html'));
    return false;
  },
};
