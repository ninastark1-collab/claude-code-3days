// 공통 유틸 + 헤더/푸터 렌더링
const BRAND = '몽글';
const LOGO = '<span class="paw" aria-hidden="true">🐾</span>몽글<i aria-hidden="true">♥</i>';
const ICON = {
  search: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>',
  bag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M5 8h14l-1.2 12.2a1 1 0 0 1-1 .8H7.2a1 1 0 0 1-1-.8L5 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2" stroke-linecap="round"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/></svg>',
  basket: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10h18l-1.6 8.4a2 2 0 0 1-2 1.6H6.6a2 2 0 0 1-2-1.6z"/><path d="M8 10l3-6M16 10l-3-6"/><path d="M12 17.2s-2.6-1.5-2.6-3.2a1.4 1.4 0 0 1 2.6-.7 1.4 1.4 0 0 1 2.6.7c0 1.7-2.6 3.2-2.6 3.2z"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
};

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function won(n) { return Number(n || 0).toLocaleString('ko-KR') + '원'; }
// 분양비처럼 큰 금액은 '160만원', '2만 5천원'처럼 읽기 쉽게
function feeText(n) {
  n = Math.round(Number(n || 0));
  const man = Math.floor(n / 10000), rest = n % 10000;
  if (man && !rest) return man.toLocaleString('ko-KR') + '만원';
  if (man && rest % 1000 === 0) return `${man.toLocaleString('ko-KR')}만 ${rest / 1000}천원`;
  if (!man && n && n % 1000 === 0) return (n / 1000) + '천원';
  return won(n);
}
function param(name) { return new URLSearchParams(location.search).get(name); }
function $(sel, root = document) { return root.querySelector(sel); }
function $$(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }
function fmtDate(iso) { return new Date(iso).toLocaleDateString('ko-KR'); }
function currentPage() { return location.pathname.split('/').pop() + location.search; }
function loginUrl() { return 'login.html?redirect=' + encodeURIComponent(currentPage() || 'index.html'); }

// 로그인 후 이동할 경로: 같은 사이트의 상대 경로만 허용
function safeRedirect(target) {
  if (!target || /^[a-z]+:|^\/\/|\\/i.test(target) || target.startsWith('/')) return 'index.html';
  return target;
}

function stars(rating) {
  const full = Math.round(rating);
  return '<span class="stars" aria-label="별점 ' + rating + '점">' + '★'.repeat(full) + '☆'.repeat(5 - full) + '</span>';
}

// 이미지: 판매자 업로드(data:image) 또는 Unsplash 무료 사진만 허용
function safeImage(src) {
  if (typeof src !== 'string') return '';
  if (/^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/i.test(src)) return src;
  if (/^https:\/\/images\.unsplash\.com\/photo-[\w-]+\?[\w=&.%-]*$/.test(src)) return src;
  return '';
}

// 입양 상태: waiting(가족을 기다려요) · pending(입양 상담 중) · adopted(새 가족을 만났어요)
let _pendIds = null, _pendAt = 0;
function adoptState(p) {
  if (!p || !p.live) return '';
  if (!p.soldOut) return 'waiting';
  if (!_pendIds || Date.now() - _pendAt > 1000) {
    _pendIds = new Set();
    _pendAt = Date.now();
    try {
      Store.get('orders', []).forEach(o => o.items.forEach(i => {
        if (i.live && ['결제완료', '배송준비중', '배송중'].includes(i.status)) _pendIds.add(i.id);
      }));
    } catch (e) { /* 무시 */ }
  }
  return _pendIds.has(p.id) ? 'pending' : 'adopted';
}
const ADOPT_LABEL = { pending: '💬 입양 상담 중', adopted: '💛 새 가족을 만났어요' };

function thumb(p, size = '') {
  const img = safeImage(p.image);
  const hex = c => (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c : null);
  const g = p.gradient && hex(p.gradient[0]) && hex(p.gradient[1]) ? p.gradient : ['#f1f5f9', '#e2e8f0'];
  return `<div class="thumb ${size}" style="background:linear-gradient(135deg, ${g[0]}, ${g[1]})">
    ${img ? `<img src="${img}" alt="${esc(p.name)}" loading="lazy">` : `<span class="emoji" role="img" aria-label="${esc(p.name)}">${esc(p.emoji || '📦')}</span>`}
    ${p.soldOut ? `<span class="soldout-cover ${adoptState(p) === 'pending' ? 'pend' : ''}">${p.live ? ADOPT_LABEL[adoptState(p)] : '일시품절'}</span>` : ''}</div>`;
}

function priceBlock(p) {
  return `${p.discount ? `<div><span class="origin">${won(p.originalPrice)}</span></div>` : '<div class="origin-space"></div>'}
    <div class="price-line">${p.discount ? `<span class="discount">${p.discount}%</span>` : ''}<span class="price">${won(p.price)}</span></div>`;
}

// 진행 단계 이름: 반려동물은 입양 절차로 표시
const ADOPT_STEPS = { 결제완료: '입양 신청 접수', 배송준비중: '분양자 검토·승인', 배송중: '인계 준비', 배송완료: '새 가족 품으로', 구매확정: '입양 완료', 주문취소: '신청 취소', 반품요청: '건강보증 접수', 반품완료: '건강보증 처리 완료' };
// 준비물(용품)도 다정한 말로
const SUPPLY_STEPS = { 결제완료: '준비물 접수', 배송준비중: '포장하고 있어요', 배송중: '배송 중', 배송완료: '도착했어요', 구매확정: '잘 받았어요', 주문취소: '취소됨', 반품요청: '교환·환불 접수', 반품완료: '환불 완료' };
function statusLabel(status, live) { return (live ? ADOPT_STEPS : SUPPLY_STEPS)[status] || status; }

function petCard(p) {
  const wished = Wish.has(p.id);
  return `<div class="pcard ${p.soldOut ? 'is-soldout' : ''}">
    <button class="wish-btn" data-wish="${p.id}" aria-label="관심 친구로 저장" aria-pressed="${wished}">${wished ? '❤️' : '🤍'}</button>
    <a href="product.html?id=${p.id}">
      <div class="thumb-wrap">${thumb(p)}</div>
      <div class="info">
        <div class="name">${esc(p.name)}</div>
        ${p.pet ? `<div class="pet-meta">${esc(p.pet.age)}${p.pet.sex && !/확인|검사|여러/.test(p.pet.sex) ? ' · ' + esc(p.pet.sex) : ''} · ${esc(p.pet.care)}</div>` : ''}
        ${p.pet && p.pet.note ? `<div class="pet-note">“${esc(p.pet.note)}”</div>` : ''}
        <div class="adopt-fee"><span>${p.fee && p.fee.type === '책임비' ? '책임비' : '분양비'}</span> ${feeText(p.price)}</div>
        <div class="tags">
          ${p.isNew && !p.soldOut ? '<span class="tag tag-new">🍼 새로 왔어요</span>' : ''}
          ${p.pet && p.pet.adult && !p.soldOut ? '<span class="tag tag-adult">🧓 의젓한 어른 친구</span>' : ''}
          ${adoptState(p) === 'pending' ? '<span class="tag tag-pend">💬 입양 상담 중</span>' : p.soldOut ? '<span class="tag tag-home">💛 가족을 찾았어요</span>' : '<span class="tag tag-wait">🏡 가족을 기다려요</span>'}
          <span class="tag tag-free">🩺 15일 건강보증</span>
        </div>
        ${p.sellerEmail ? `<div class="seller-name">분양자 · ${esc(p.seller)}</div>` : ''}
      </div>
    </a>
  </div>`;
}

function productCard(p, i, opts) {
  if (p.live) return petCard(p);
  const rank = opts && opts.rank ? i + 1 : 0;
  const wished = Wish.has(p.id);
  return `<div class="pcard ${p.soldOut ? 'is-soldout' : ''}">
    ${rank ? `<span class="rank ${rank <= 3 ? 'top' : ''}">${rank}</span>` : ''}
    <button class="wish-btn" data-wish="${p.id}" aria-label="찜하기" aria-pressed="${wished}">${wished ? '❤️' : '🤍'}</button>
    <a href="product.html?id=${p.id}">
      <div class="thumb-wrap">${thumb(p)}${p.discount >= 20 && !p.soldOut ? `<span class="sale-badge">-${p.discount}%</span>` : ''}</div>
      <div class="info">
        <div class="name">${esc(p.name)}</div>
        ${priceBlock(p)}
        <div class="rating">${p.reviewCount ? `${stars(p.avgRating)} (${p.reviewCount.toLocaleString()})` : '<span class="muted">NEW</span>'}</div>
        ${p.live && p.pet ? `<div class="pet-meta">${esc(p.pet.age)} · ${esc(p.pet.care)}</div>` : ''}
        <div class="tags">
          ${p.live ? '<span class="tag tag-fast">🩺 건강보증 15일</span><span class="tag tag-free">직접 인계</span>' : ''}
          ${!p.live && p.fast ? '<span class="tag tag-fast">🚀 내일도착</span>' : ''}
          ${!p.live && p.freeShip ? '<span class="tag tag-free">무료배송</span>' : ''}
          ${!p.soldOut && p.stock <= (p.live ? 1 : 5) ? `<span class="tag tag-low">${p.live ? '마지막 1마리' : p.stock + '개 남음'}</span>` : ''}
        </div>
        ${p.sellerEmail ? `<div class="seller-name">${esc(p.seller)}</div>` : ''}
      </div>
    </a>
  </div>`;
}

// 상품 카드의 찜 버튼 (이벤트 위임)
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-wish]');
  if (!btn) return;
  e.preventDefault();
  const on = Wish.toggle(Number(btn.dataset.wish));
  if (on === null) {
    toast('로그인 후 찜할 수 있어요.', loginUrl(), '로그인');
    return;
  }
  btn.textContent = on ? '❤️' : '🤍';
  btn.setAttribute('aria-pressed', on);
  toast(on ? '관심 목록에 담았어요. 💛' : '관심 목록에서 뺐어요.', on ? 'mypage.html?tab=wish' : '', '관심 목록');
});

let toastTimer;
function toast(msg, link, linkText) {
  let el = $('.toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.innerHTML = esc(msg) + (link ? ` <a href="${esc(link)}">${esc(linkText || '보기')}</a>` : '');
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

// 간단한 모달 (confirm/prompt 대체)
function modal({ title, body, okText = '확인', cancelText = '취소', onOk }) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <h3>${esc(title)}</h3><div class="modal-body">${body}</div>
    <div class="modal-actions">${cancelText ? `<button class="btn" data-x>${esc(cancelText)}</button>` : ''}<button class="btn btn-primary" data-ok>${esc(okText)}</button></div>
  </div>`;
  document.body.appendChild(wrap);
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); };
  // 다른 모달이 열려 있으면 먼저 닫기
  $$('.modal-wrap').forEach(m => { if (m !== wrap) m.remove(); });
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('click', e => { if (e.target === wrap || e.target.closest('[data-x]')) close(); });
  let busy = false; // 중복 클릭 방지
  $('[data-ok]', wrap).addEventListener('click', async () => {
    if (busy || !wrap.isConnected) return;
    busy = true;
    let r;
    try {
      r = onOk ? onOk(wrap) : undefined;
      if (r && typeof r.then === 'function') r = await r;
    } finally {
      busy = false;
    }
    if (r === false) return;
    close();
  });
  const first = $('input, textarea, select', wrap) || $('[data-ok]', wrap);
  first.focus();
  return wrap;
}

function updateCartBadge() {
  const el = $('#cartCount');
  if (!el) return;
  const n = Cart.count();
  el.textContent = n > 99 ? '99+' : n;
  el.classList.toggle('hidden', n === 0);
}

function renderHeader() {
  const user = Auth.current();
  const page = location.pathname.split('/').pop() || 'index.html';
  const cat = param('cat');
  const q = page === 'products.html' ? param('q') || '' : '';
  const sort = param('sort');
  // 다시 그릴 수 있도록 고정 컨테이너 사용 (display:contents 로 sticky 유지)
  let host = $('#siteHeader');
  if (!host) {
    host = document.createElement('div');
    host.id = 'siteHeader';
    host.style.display = 'contents';
    $('#header').replaceWith(host);
  }
  host.innerHTML = `
  <a class="skip" href="#app">본문 바로가기</a>
  <div class="topbar"><div class="container">
    ${user
      ? `<span><strong>${esc(user.name)}</strong>님 · <strong>${Number(user.points || 0).toLocaleString()}P</strong></span><button id="logoutBtn">로그아웃</button>`
      : `<a href="${loginUrl()}">로그인</a><a href="signup.html">회원가입</a>`}
    <a href="mypage.html">💌 입양 소식</a>
    <a href="help.html">고객센터</a>
    <a href="seller.html" class="seller-link">분양자·셀러센터 ↗</a>
  </div></div>
  <header class="header">
    <div class="container header-main">
      <a href="index.html" class="logo" aria-label="몽글 홈">${LOGO}</a>
      <form class="search" action="products.html" role="search" id="searchForm" autocomplete="off">
        <input name="q" id="searchInput" type="search" placeholder="어떤 친구를 찾고 있나요? 🐾" value="${esc(q)}" aria-label="친구 찾기" maxlength="50">
        <button type="submit" aria-label="검색">${ICON.search}</button>
        <div class="suggest hidden" id="suggest"></div>
      </form>
      <nav class="header-icons">
        ${user ? `<div class="noti-wrap"><button type="button" class="icon-btn" id="notiBtn" aria-label="알림" aria-expanded="false">${ICON.bell}<span class="label">알림</span><span id="notiCount" class="badge-count hidden">0</span></button><div class="noti-panel hidden" id="notiPanel"></div></div>` : ''}
        <a href="mypage.html?tab=wish" aria-label="관심 친구">${ICON.heart}<span class="label">관심</span></a>
        <a href="mypage.html" aria-label="마이페이지">${ICON.user}<span class="label">MY</span></a>
        <a href="cart.html" aria-label="몽글바구니">${ICON.basket}<span class="label">몽글바구니</span><span id="cartCount" class="badge-count hidden">0</span></a>
      </nav>
    </div>
    <nav class="catnav"><div class="container">
      <a href="#" class="quiz-nav" data-quiz>🧩 나와 맞는 친구</a>
      <a href="products.html" class="${page === 'products.html' && !cat && !q && sort !== 'discount' ? 'active' : ''}">전체</a>
      ${CATEGORIES.map(c => `<a href="products.html?cat=${c.id}" class="${cat === c.id ? 'active' : ''}">${c.name}</a>`).join('')}
      <a href="products.html?sort=new" class="${sort === 'new' && !cat && !q ? 'active' : ''}">신상</a>
    </div></nav>
  </header>`;
  const logout = $('#logoutBtn');
  if (logout) logout.addEventListener('click', () => {
    Auth.logout();
    location.href = 'index.html';
  });
  setupSearch();
  setupNoti();
  updateCartBadge();
}

// 알림함 (재입고·발송·답변·반품 알림)
function setupNoti() {
  const btn = $('#notiBtn');
  if (!btn) return;
  const panel = $('#notiPanel');
  const count = $('#notiCount');
  const paint = () => {
    const n = Notify.unread();
    count.textContent = n > 99 ? '99+' : n;
    count.classList.toggle('hidden', !n);
  };
  const ago = iso => {
    const m = Math.floor((Date.now() - new Date(iso)) / 60000);
    return m < 1 ? '방금 전' : m < 60 ? m + '분 전' : m < 1440 ? Math.floor(m / 60) + '시간 전' : fmtDate(iso);
  };
  btn.addEventListener('click', e => {
    e.stopPropagation();
    const open = panel.classList.toggle('hidden') === false;
    btn.setAttribute('aria-expanded', open);
    if (!open) return;
    const list = Notify.list();
    panel.innerHTML = `<div class="n-head"><span>알림</span>${list.length ? '<button class="link-btn" type="button" id="notiClear">모두 지우기</button>' : ''}</div>` +
      (list.length ? list.map(n => `<a class="noti-item ${n.read ? '' : 'unread'}" href="${esc(safeRedirect(n.link || 'mypage.html'))}">${esc(n.text)}<div class="muted">${ago(n.date)}</div></a>`).join('')
        : '<div class="noti-item muted">새 알림이 없어요.<br>재입고·발송·문의답변 소식을 여기서 알려드려요.</div>');
    Notify.readAll();
    paint();
    const clear = $('#notiClear');
    if (clear) clear.addEventListener('click', ev => {
      ev.stopPropagation();
      Store.set('noti_' + Auth.current().email, []);
      panel.innerHTML = '<div class="noti-item muted">새 알림이 없어요.</div>';
    });
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('.noti-wrap')) { panel.classList.add('hidden'); btn.setAttribute('aria-expanded', 'false'); }
  });
  paint();
}

// 검색창: 최근 검색어 + 자동완성
function setupSearch() {
  const form = $('#searchForm');
  const input = $('#searchInput');
  const box = $('#suggest');
  let active = -1;

  function show() {
    const q = input.value.trim().toLowerCase();
    let html = '';
    if (!q) {
      const recent = RecentSearch.list();
      if (recent.length) {
        html = `<div class="suggest-head"><span>최근 검색어</span><button type="button" data-clear>전체삭제</button></div>` +
          recent.map(r => `<div class="suggest-item" data-q="${esc(r)}"><span>🕘 ${esc(r)}</span><button type="button" data-del="${esc(r)}" aria-label="삭제">✕</button></div>`).join('');
      }
    } else {
      const hits = PRODUCTS.filter(p => p.name.toLowerCase().includes(q)).slice(0, 7);
      html = hits.map(p => {
        const i = p.name.toLowerCase().indexOf(q);
        const name = esc(p.name.slice(0, i)) + '<b>' + esc(p.name.slice(i, i + q.length)) + '</b>' + esc(p.name.slice(i + q.length));
        return `<a class="suggest-item" href="product.html?id=${p.id}"><span>🔍 ${name}</span><span class="muted">${won(p.price)}</span></a>`;
      }).join('');
    }
    box.innerHTML = html;
    box.classList.toggle('hidden', !html);
    active = -1;
  }

  input.addEventListener('focus', show);
  input.addEventListener('input', show);
  input.addEventListener('keydown', e => {
    const items = $$('.suggest-item', box);
    if (!items.length || box.classList.contains('hidden')) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items.forEach((el, i) => el.classList.toggle('active', i === active));
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      items[active].click();
    } else if (e.key === 'Escape') {
      box.classList.add('hidden');
    }
  });
  box.addEventListener('mousedown', e => e.preventDefault()); // 클릭 전에 blur로 닫히지 않게
  box.addEventListener('click', e => {
    const del = e.target.closest('[data-del]');
    if (del) { RecentSearch.remove(del.dataset.del); show(); return; }
    if (e.target.closest('[data-clear]')) { RecentSearch.clear(); show(); return; }
    const item = e.target.closest('[data-q]');
    if (item) { input.value = item.dataset.q; form.requestSubmit(); }
  });
  input.addEventListener('blur', () => box.classList.add('hidden'));
  form.addEventListener('submit', e => {
    const v = input.value.trim();
    if (!v) { e.preventDefault(); input.focus(); toast('검색어를 입력해 주세요.'); return; }
    input.value = v;
    RecentSearch.add(v);
  });
}

function renderFooter() {
  $('#footer').outerHTML = `
  <footer class="footer" id="footer"><div class="container">
    <div class="footer-cols">
      <div><strong>${LOGO}</strong>몽글몽글, 평생 가족.<br>정성껏 키워주실 분께, 정성껏 보내드려요.</div>
      <div><strong>고객센터</strong>1588-0000<br>평일 09:00–18:00<br><a href="help.html">자주 묻는 질문 · 공지 →</a></div>
      <div><strong>책임 분양</strong>입양 신청서 검토 후 분양 · 15일 건강보증<br>생명은 택배 없이 직접 인계 · 동물판매업 등록 (데모)</div>
      <div><strong>분양자·브리더</strong><a href="seller.html">책임 분양 함께하기 →</a><br>용품 ${won(FREE_SHIPPING_MIN)} 이상 무료배송</div>
    </div>
    <div class="notice">⚠️ 학습용 데모 사이트입니다. 실제 결제·배송이 이루어지지 않으며, 회원·입양·준비물 정보는 이 브라우저(localStorage)에만 저장됩니다. 실제 분양이 아니며, 사진은 Unsplash 무료 라이선스 이미지입니다. 실제 사용하는 비밀번호를 입력하지 마세요.</div>
    <div class="biz-info">몽글 (데모) · 대표 몽글이 · 사업자등록번호 000-00-00000 · 통신판매업 신고 제2026-데모-0000호 · 동물판매업 등록번호 제0000-000호 (데모 값)</div>
    <div class="footer-bottom"><span>© 2026 mongle. All rights reserved. · <a href="terms.html">이용약관</a> · <a href="terms.html?tab=privacy"><b>개인정보처리방침</b></a> · <a href="terms.html?tab=contract">분양 계약 안내</a></span><button class="link-btn" id="toTop" type="button">맨 위로 ↑</button></div>
    <div class="wordmark" aria-hidden="true">mongle<i>♥</i></div>
  </div></footer>`;
  $('#toTop').addEventListener('click', () => scrollTo({ top: 0, behavior: 'smooth' }));
}

// ---------- 나와 꼭 맞는 친구 찾기 퀴즈 (10문항) ----------
const QUIZ = [
  ['who', '👨‍👩‍👧 누구와 함께 살고 있나요?', ['혼자 살아요', '둘이 살아요', '어린아이가 있어요', '어르신이 계세요']],
  ['home', '🏠 어떤 집에서 살아요?', ['원룸·오피스텔', '아파트·빌라', '마당 있는 주택']],
  ['alone', '🕰️ 아이가 하루에 혼자 있을 시간은요?', ['4시간 이하', '4~8시간', '8시간 이상']],
  ['exp', '🌱 반려동물을 키워본 적이 있나요?', ['처음이에요', '조금 키워봤어요', '경험이 많아요']],
  ['walk', '🦮 하루에 산책·놀이에 쓸 수 있는 시간은요?', ['30분 이하', '1시간 정도', '2시간 이상']],
  ['touch', '🤗 어떤 교감을 꿈꾸나요?', ['안고 쓰다듬고 싶어요', '곁에 있어 주면 좋아요', '바라보며 힐링하고 싶어요']],
  ['noise', '🔇 소리에 민감한 환경인가요? (이웃·층간소음)', ['조용해야 해요', '조금은 괜찮아요', '상관없어요']],
  ['shed', '🧹 털이나 알레르기가 걱정되나요?', ['알레르기가 있어요', '털 날림이 조금 걱정돼요', '괜찮아요']],
  ['budget', '💸 한 달 돌봄 예산은 어느 정도인가요?', ['5만원 이하', '5~15만원', '15만원 이상']],
  ['years', '🗓️ 앞으로 얼마나 오래 함께할 수 있나요?', ['5년 정도', '10년 정도', '20년도 괜찮아요']],
];
const CUDDLY = ['dog', 'cat', 'small'];
const WATCHY = ['fish', 'reptile', 'insect'];

function quizMatch(a) {
  return Catalog.visible().filter(p => p.live && !p.soldOut && p.pet).map(p => {
    const t = p.pet.traits || [];
    const cat = p.category;
    const cost = p.pet.cost || { monthly: 0, years: 10 };
    let score = 0;
    const good = [], warn = [];
    const care = p.pet.care;
    // 경험
    if (a.exp === '처음이에요') { if (care === '초보 추천') { score += 2; good.push('처음 키우기 좋아요'); } else if (care === '보통') score -= 1; else { score -= 4; warn.push('경험이 있는 분께 더 잘 맞아요'); } }
    if (a.exp === '조금 키워봤어요' && care === '경험자 추천') { score -= 1; warn.push('조금 더 공부가 필요해요'); }
    // 집
    if (a.home !== '마당 있는 주택') { if (t.includes('apt')) { score += 1; good.push('아파트에서도 좋아요'); } else { score -= 2; warn.push('넓은 공간이 필요해요'); } }
    // 혼자 있는 시간
    if (a.alone !== '4시간 이하') { if (t.includes('alone')) { score += 2; good.push('혼자서도 잘 지내요'); } else { score -= a.alone === '8시간 이상' ? 4 : 2; warn.push('혼자 있는 시간이 길면 외로워해요'); } }
    // 가족
    if (a.who === '어린아이가 있어요') { if (t.includes('kids')) { score += 2; good.push('아이와 함께해도 좋아요'); } else { score -= 2; warn.push('어린아이와는 조심스러워요'); } }
    if (a.who === '어르신이 계세요') { if (care === '초보 추천' && t.includes('quiet')) { score += 2; good.push('차분해서 어르신과 잘 맞아요'); } if (/대형|중대형/.test(p.pet.size)) score -= 2; }
    // 산책·활동
    if (cat === 'dog') {
      const big = /대형|중형|운동량|활동량/.test(p.pet.size);
      if (a.walk === '30분 이하') { score -= big ? 5 : 2; warn.push('매일 산책이 꼭 필요해요'); }
      if (a.walk === '2시간 이상') { score += big ? 3 : 1; good.push('활동적인 가족과 잘 맞아요'); }
      if (a.home === '마당 있는 주택' && big) score += 1;
    } else if (a.walk === '2시간 이상' && WATCHY.includes(cat)) score -= 1;
    // 교감 방식
    // 교감 방식은 가장 중요한 바람이라 크게 반영 (안고 싶은데 물고기·곤충을 추천하지 않도록)
    if (a.touch === '안고 쓰다듬고 싶어요') { if (CUDDLY.includes(cat)) { score += 3; good.push('품에 안고 교감할 수 있어요'); } else if (cat === 'bird') score -= 1; else { score -= 10; } }
    if (a.touch === '곁에 있어 주면 좋아요') { if (['cat', 'dog', 'bird'].includes(cat)) { score += 1; good.push('곁을 잘 지켜줘요'); } }
    if (a.touch === '바라보며 힐링하고 싶어요') { if (WATCHY.includes(cat)) { score += 4; good.push('바라보는 것만으로 힐링돼요'); } else if (cat === 'dog') score -= 2; }
    // 소리
    if (a.noise === '조용해야 해요') { if (t.includes('quiet')) { score += 2; good.push('조용한 편이에요'); } else { score -= cat === 'bird' || cat === 'dog' ? 3 : 1; warn.push('소리를 낼 수 있어요'); } }
    if (a.noise === '조금은 괜찮아요' && !t.includes('quiet') && (cat === 'bird' || cat === 'dog')) score -= 1;
    // 털·알레르기
    // 알레르기: 개·고양이 비듬은 흔한 알레르기 원인이라 털 날림이 적은 아이만 추천
    if (a.shed === '알레르기가 있어요') { if (t.includes('lowshed')) { score += 3; good.push('털 날림이 적어요'); } else { score -= cat === 'dog' || cat === 'cat' ? 9 : CUDDLY.includes(cat) || cat === 'bird' ? 4 : 1; warn.push('털·비듬 알레르기에 주의해요'); } }
    if (a.shed === '털 날림이 조금 걱정돼요') { if (t.includes('lowshed')) { score += 1; good.push('털 날림이 적어요'); } else if (CUDDLY.includes(cat)) score -= 1; }
    // 예산
    const m = cost.monthly;
    if (a.budget === '5만원 이하') { if (m <= 50000) { score += 2; good.push(`한 달 약 ${feeText(m)}이면 충분해요`); } else { score -= m > 120000 ? 5 : 3; warn.push(`한 달 약 ${feeText(m)}이 들어요`); } }
    if (a.budget === '5~15만원') { if (m <= 150000) score += 1; else { score -= 3; warn.push(`한 달 약 ${feeText(m)}이 들어요`); } }
    // 함께할 기간
    const yrs = cost.years;
    if (a.years === '5년 정도') { if (yrs <= 6) { score += 2; good.push(`약 ${yrs}년을 함께해요`); } else { score -= yrs > 12 ? 4 : 2; warn.push(`약 ${yrs}년을 함께해야 해요`); } }
    if (a.years === '10년 정도' && yrs > 16) { score -= 2; warn.push(`약 ${yrs}년을 함께해야 해요`); }
    if (a.years === '20년도 괜찮아요' && yrs >= 12) score += 1;
    const pct = Math.max(35, Math.min(98, Math.round(62 + score * 4)));
    return { p, score, pct, good: good.slice(0, 3), warn: warn.slice(0, 2) };
  }).sort((x, y) => y.score - x.score || x.p.price - y.p.price)
    // 같은 분류는 최대 2마리까지만 → 다양한 친구를 추천
    .filter(function (r) { this[r.p.category] = (this[r.p.category] || 0) + 1; return this[r.p.category] <= 2; }, {})
    .slice(0, 6);
}

function openQuiz() {
  $$('.modal-wrap').forEach(m => m.remove());
  // 지난번 답을 기억해 두었다면 미리 채워 두기
  let answers = {};
  try { answers = JSON.parse(localStorage.getItem('pet_quizAnswers') || '{}') || {}; } catch (e) { answers = {}; }
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap';
  wrap.innerHTML = `<div class="modal quiz-modal" role="dialog" aria-modal="true" aria-label="나와 맞는 친구 찾기"><button class="quiz-close" type="button" aria-label="닫기">✕</button><div class="quiz-body"></div></div>`;
  document.body.appendChild(wrap);
  const body = $('.quiz-body', wrap);
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('click', e => { if (e.target === wrap || e.target.closest('.quiz-close')) close(); });

  const done = () => QUIZ.filter(([k]) => answers[k]).length;
  function paintProgress() {
    const n = done();
    $('.quiz-count', body).textContent = `${n} / ${QUIZ.length} 답했어요`;
    $('.quiz-progress i', body).style.width = Math.round(n / QUIZ.length * 100) + '%';
  }

  // 한 화면에 모든 질문을 보여주고, 원하는 순서대로 고르기
  function paintForm() {
    body.innerHTML = `
      <div class="quiz-top"><span>🧩 나와 꼭 맞는 친구 찾기</span><span class="quiz-count"></span></div>
      <div class="quiz-progress"><i></i></div>
      <p class="muted" style="margin:-6px 0 12px;font-size:13px">질문을 한눈에 보고 편한 순서대로 골라 주세요. 솔직하게 답할수록 잘 맞는 친구를 찾아요.</p>
      <div class="quiz-form">${QUIZ.map(([k, q, opts]) => `
        <div class="quiz-q" data-k="${k}">
          <div class="quiz-q-label">${q}</div>
          <div class="quiz-chips">${opts.map(o => `<button type="button" class="quiz-chip ${answers[k] === o ? 'on' : ''}" data-v="${esc(o)}" aria-pressed="${answers[k] === o}">${esc(o)}</button>`).join('')}</div>
        </div>`).join('')}</div>
      <div class="error-text" id="qzErr"></div>
      <div class="quiz-nav-row"><button type="button" class="link-btn" data-reset>처음부터 다시 고르기</button><button type="button" class="btn btn-primary" data-submit>💛 추천 받기</button></div>`;
    paintProgress();
    $$('.quiz-q', body).forEach(row => {
      const k = row.dataset.k;
      $$('.quiz-chip', row).forEach(b => b.addEventListener('click', () => {
        answers[k] = b.dataset.v;
        $$('.quiz-chip', row).forEach(x => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-pressed', on); });
        row.classList.remove('missing');
        $('#qzErr', body).textContent = '';
        paintProgress();
      }));
    });
    $('[data-reset]', body).addEventListener('click', () => { answers = {}; paintForm(); });
    $('[data-submit]', body).addEventListener('click', () => {
      const missing = QUIZ.filter(([k]) => !answers[k]).map(([k]) => k);
      $$('.quiz-q', body).forEach(r => r.classList.toggle('missing', missing.includes(r.dataset.k)));
      if (missing.length) {
        $('#qzErr', body).textContent = `아직 고르지 않은 질문이 ${missing.length}개 있어요.`;
        $(`.quiz-q[data-k="${missing[0]}"]`, body).scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      paintResult();
    });
  }

  function paintResult() {
    const res = quizMatch(answers);
    const cats = [...new Set(res.slice(0, 4).map(r => getCategory(r.p.category).name))];
    try { localStorage.setItem('pet_quizAnswers', JSON.stringify(answers)); } catch (e) { /* 무시 */ }
    body.innerHTML = `
      <div class="quiz-top"><span>💛 결과가 나왔어요</span><span>${QUIZ.length} / ${QUIZ.length}</span></div>
      <div class="quiz-progress"><i style="width:100%"></i></div>
      <h3 class="quiz-q-title" style="margin-bottom:4px">우리 집엔 <mark>${esc(cats.join(' · '))}</mark> 친구가 잘 맞아요</h3>
      <p class="muted" style="margin:0 0 12px;font-size:13px">생활 패턴과 잘 맞는 순서예요. 꼭 직접 만나보고 상담한 뒤 결정해 주세요.</p>
      <div class="quiz-results">${res.map(({ p, pct, good, warn }) => `
        <a class="quiz-pick" href="product.html?id=${p.id}">${thumb(p, 'sm')}<div style="flex:1;min-width:0">
          <div style="display:flex;justify-content:space-between;gap:8px"><strong>${esc(p.name)}</strong><span class="match">${pct}% 잘 맞아요</span></div>
          <div class="muted" style="font-size:12px">${esc(p.pet.age)} · ${esc(p.pet.care)} · 한 달 약 ${feeText(p.pet.cost.monthly)}</div>
          ${good.length ? `<div class="q-good">✓ ${good.map(esc).join(' · ')}</div>` : ''}
          ${warn.length ? `<div class="q-warn">! ${warn.map(esc).join(' · ')}</div>` : ''}
        </div></a>`).join('')}</div>
      <div class="quiz-nav-row"><button type="button" class="btn btn-sm" data-edit>← 답 고치기</button><a class="btn btn-sm btn-primary" href="products.html?live=1">모든 친구 둘러보기</a></div>`;
    $('[data-edit]', body).addEventListener('click', paintForm);
  }
  paintForm();
  return wrap;
}

// 화면 구석의 퀴즈 버튼 (누른 사람에게만 퀴즈가 열려요)
function setupQuizInvite() {
  if ($('.quiz-fab')) return;
  // 신청서·결제·정책·로그인 화면에서는 띄우지 않아요
  const page = location.pathname.split('/').pop() || 'index.html';
  if (['checkout.html', 'order-complete.html', 'login.html', 'signup.html', 'seller.html', 'terms.html'].includes(page)) return;
  document.body.classList.add('has-fab');
  const fab = document.createElement('button');
  fab.type = 'button';
  fab.className = 'quiz-fab';
  fab.setAttribute('data-quiz', '');
  fab.innerHTML = '<span class="fab-ico">🧩</span><span class="fab-text">나와 맞는 친구 찾기</span>';
  document.body.appendChild(fab);
}

document.addEventListener('click', e => {
  if (e.target.closest('[data-quiz]')) { e.preventDefault(); setTimeout(openQuiz, 0); }
});

try { CarePlan.check(); } catch (e) { /* 저장소 접근 불가 시 무시 */ }
renderHeader();
renderFooter();
setupQuizInvite();
