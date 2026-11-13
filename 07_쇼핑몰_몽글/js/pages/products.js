(function () {
  const state = {
    q: (param('q') || '').trim(),
    cat: param('cat') || '',
    sort: param('sort') || 'recommend',
    fast: param('fast') === '1',
    live: param('live') === '1',
    care: param('care') === 'easy' ? '초보 추천' : '',
    traits: [],
    stage: param('stage') || '',
    budget: '',
    free: false,
  };
  const isSupplyView = () => state.cat === 'supplies';
  // 분양비·예산: 숫자 입력 대신 부드러운 구간 선택
  const PET_BUDGETS = [['', '상관없어요'], ['0-300000', '30만원 이하'], ['300000-1000000', '30~100만원'], ['1000000-', '100만원 이상']];
  const SUPPLY_BUDGETS = [['', '상관없어요'], ['0-20000', '2만원 이하'], ['20000-50000', '2~5만원'], ['50000-', '5만원 이상']];
  const inBudget = p => {
    if (!state.budget) return true;
    const [lo, hi] = state.budget.split('-').map(x => (x === '' ? null : Number(x)));
    return p.price >= (lo || 0) && (hi === null || p.price <= hi);
  };
  const ANIMAL_SORTS = ['recommend', 'new', 'reviews'];
  const isAnimalView = () => state.live || (state.cat && state.cat !== 'supplies');
  const SORTS = [
    ['recommend', '추천순'], ['new', '최신순'], ['discount', '할인율순'], ['low', '낮은가격순'], ['high', '높은가격순'], ['reviews', '리뷰많은순'], ['rating', '평점높은순'],
  ];

  const score = p => p.avgRating * Math.log(p.reviewCount + 2) + (p.sold || 0) * 0.05;
  // 페이지 나눔: 화면에 보이는 열 수에 맞춰 한 페이지에 3~4줄만 보여줘요
  let page = Math.max(1, parseInt(param('page'), 10) || 1);
  function perPage() {
    const w = window.innerWidth;
    const cols = w <= 640 ? 2 : w <= 1024 ? 3 : 4;
    return cols * (cols === 2 ? 4 : 3); // 휴대폰 8 · 태블릿 9 · PC 12
  }
  function pageNums(cur, last) {
    // 1 … 4 5 6 … 20 처럼 현재 페이지 주변만 보여줘요
    const set = new Set([1, last, cur - 1, cur, cur + 1].filter(n => n >= 1 && n <= last));
    if (cur <= 3) [2, 3, 4].forEach(n => n <= last && set.add(n));
    if (cur >= last - 2) [last - 1, last - 2, last - 3].forEach(n => n >= 1 && set.add(n));
    const nums = [...set].sort((a, b) => a - b), out = [];
    nums.forEach((n, i) => { if (i && n - nums[i - 1] > 1) out.push('…'); out.push(n); });
    return out;
  }
  function pager(cur, last) {
    if (last <= 1) return '';
    return `<nav class="pager" aria-label="페이지">
      <button type="button" class="pg pg-nav" data-page="${cur - 1}" ${cur === 1 ? 'disabled' : ''} aria-label="이전 페이지">‹ 이전</button>
      ${pageNums(cur, last).map(n => n === '…' ? '<span class="pg-gap">…</span>'
        : `<button type="button" class="pg ${n === cur ? 'on' : ''}" data-page="${n}" ${n === cur ? 'aria-current="page"' : ''}>${n}</button>`).join('')}
      <button type="button" class="pg pg-nav" data-page="${cur + 1}" ${cur === last ? 'disabled' : ''} aria-label="다음 페이지">다음 ›</button>
    </nav>`;
  }

  function filtered() {
    const q = state.q.toLowerCase();
    let list = PRODUCTS.filter(p => {
      if (state.cat && p.category !== state.cat) return false;
      if (q && !q.split(/\s+/).every(w => (p.name + ' ' + getCategory(p.category).name + ' ' + p.seller).toLowerCase().includes(w))) return false;
      if (state.fast && !p.fast) return false;
      if (state.live && !p.live) return false;
      if (state.care && !(p.pet && p.pet.care === state.care)) return false;
      if (state.stage && !(p.pet && (state.stage === 'adult' ? p.pet.adult : !p.pet.adult))) return false;
      if (state.traits.length && !(p.pet && state.traits.every(t => (p.pet.traits || []).includes(t)))) return false;
      if (state.free && !p.freeShip) return false;
      if (!inBudget(p)) return false;
      return true;
    });
    const sorters = {
      recommend: (a, b) => score(b) - score(a),
      new: (a, b) => new Date(b.createdAt) - new Date(a.createdAt) || b.id - a.id,
      discount: (a, b) => b.discount - a.discount,
      low: (a, b) => a.price - b.price,
      high: (a, b) => b.price - a.price,
      reviews: (a, b) => b.reviewCount - a.reviewCount,
      rating: (a, b) => b.avgRating - a.avgRating || b.reviewCount - a.reviewCount,
    };
    // 품절 상품은 항상 뒤로
    return list.sort((a, b) => (a.soldOut - b.soldOut) || (sorters[state.sort] || sorters.recommend)(a, b));
  }

  function title() {
    if (state.q) return `'${esc(state.q)}' 검색 결과`;
    if (state.cat) return getCategory(state.cat)?.name || '모든 친구와 준비물';
    if (state.care === '초보 추천') return '🌱 처음 함께하기 좋은 친구들';
    if (state.stage === 'adult') return '🧓 의젓한 어른 친구들';
    if (state.live) return '🏡 가족을 기다리는 친구들';
    if (state.sort === 'discount') return '🔥 오늘의 특가';
    return '모든 친구와 준비물';
  }

  function syncUrl() {
    const sp = new URLSearchParams();
    if (state.q) sp.set('q', state.q);
    if (state.cat) sp.set('cat', state.cat);
    if (state.sort !== 'recommend') sp.set('sort', state.sort);
    if (state.fast) sp.set('fast', '1');
    if (state.live) sp.set('live', '1');
    if (state.care === '초보 추천') sp.set('care', 'easy');
    if (state.stage) sp.set('stage', state.stage);
    if (page > 1) sp.set('page', page);
    history.replaceState(null, '', 'products.html' + (sp.toString() ? '?' + sp : ''));
  }

  function catLink(id, name) {
    const sp = new URLSearchParams();
    if (id) sp.set('cat', id);
    if (state.q) sp.set('q', state.q);
    return `<a class="cat ${state.cat === id ? 'active' : ''}" href="products.html${sp.toString() ? '?' + sp : ''}" data-cat="${id}">${name}</a>`;
  }

  $('#app').innerHTML = `
    <div class="list-layout">
      <details class="card filters" ${matchMedia('(max-width: 860px)').matches ? '' : 'open'}>
        <summary>🐾 ${isSupplyView() ? '준비물 찾기' : '나에게 맞는 친구 찾기'}</summary>
        <div id="sideBody"></div>
      </details>
      <section>
        <h1 class="page-title" id="title"></h1>
        <div id="supplyPerks"></div>
        <div class="toolbar">
          <div class="muted" id="count"></div>
          <div class="sort-tabs">${SORTS.map(([k, v]) => `<button data-sort="${k}">${v}</button>`).join('')}</div>
        </div>
        <div id="results"></div>
      </section>
    </div>`;

  const chip = (group, value, label, on) => `<button type="button" class="f-chip ${on ? 'on' : ''}" data-g="${group}" data-v="${value}" aria-pressed="${on}">${label}</button>`;
  function renderSide() {
    const budgets = isSupplyView() ? SUPPLY_BUDGETS : PET_BUDGETS;
    $('#sideBody').innerHTML = isSupplyView() ? `
      <div class="group"><h3>배송</h3><div class="chip-wrap">
        ${chip('fast', '1', '🚀 내일도착', state.fast)}${chip('free', '1', '📦 무료배송', state.free)}</div></div>
      <div class="group"><h3>예산</h3><div class="chip-wrap">${budgets.map(([v, l]) => chip('budget', v, l, state.budget === v)).join('')}</div></div>
      <div class="group side-tip"><h3>🧺 새 가족 맞이 필수 준비물</h3>
        <ul><li>평소 먹던 사료 (갑자기 바꾸지 않기)</li><li>편히 숨을 수 있는 집·방석</li><li>물그릇·밥그릇</li><li>배변 패드·모래 / 사육장</li><li>아이에게 맞는 장난감</li></ul></div>` : `
      <div class="group side-quiz"><button type="button" class="btn btn-primary btn-block" data-quiz>🧩 나와 맞는 친구 퀴즈</button></div>
      <div class="group"><h3>보기</h3><div class="chip-wrap">${chip('live', '1', '🏡 가족을 기다리는 친구만', state.live)}</div></div>
      <div class="group"><h3>나이</h3><div class="chip-wrap">
        ${[['', '전체'], ['baby', '🍼 아기 친구'], ['adult', '🧓 어른 친구']].map(([v, l]) => chip('stage', v, l, state.stage === v)).join('')}</div></div>
      <div class="group"><h3>키우기 난이도</h3><div class="chip-wrap">
        ${[['', '전체'], ['초보 추천', '🌱 처음이에요'], ['보통', '🌿 조금 키워봤어요'], ['경험자 추천', '🌳 경험이 많아요']].map(([v, l]) => chip('care', v, l, state.care === v)).join('')}</div></div>
      <div class="group"><h3>우리 집과 잘 맞는 친구</h3><div class="chip-wrap">
        ${Object.entries(TRAIT_LABELS).map(([k, l]) => chip('trait', k, l, state.traits.includes(k))).join('')}</div></div>
      <div class="group"><h3>분양비</h3><div class="chip-wrap">${budgets.map(([v, l]) => chip('budget', v, l, state.budget === v)).join('')}</div>
        <p class="muted" style="font-size:12px;margin:8px 0 0">분양비는 건강검진·접종·돌봄에 쓰여요.</p></div>
      <div class="group side-tip"><h3>💛 입양 도우미</h3>
        <p>처음이라 고민된다면 입양 전 체크리스트부터 확인해 보세요.</p>
        <a class="btn btn-sm btn-block btn-outline" href="help.html">입양 전 체크리스트</a>
        <p class="muted" style="font-size:12px;margin:10px 0 0">📞 분양 상담 1588-0000 (평일 9~18시)<br>🐕 보호소 유기동물 입양도 함께 응원해요.</p></div>`;
    $$('.f-chip', $('#sideBody')).forEach(b => b.addEventListener('click', () => {
      const g = b.dataset.g, v = b.dataset.v;
      if (g === 'live') state.live = !state.live;
      else if (g === 'fast') state.fast = !state.fast;
      else if (g === 'free') state.free = !state.free;
      else if (g === 'care') { state.care = v; if (v) state.live = true; }
      else if (g === 'budget') state.budget = v;
      else if (g === 'stage') { state.stage = v; if (v) state.live = true; }
      else if (g === 'trait') state.traits = state.traits.includes(v) ? state.traits.filter(x => x !== v) : [...state.traits, v];
      if (g === 'trait' && state.traits.length) state.live = true;
      reset(); render();
    }));
  }

  function paintPerks() {
    const box = $('#supplyPerks');
    if (!isSupplyView()) { box.innerHTML = ''; return; }
    const u = Auth.current();
    box.innerHTML = `<div class="perk-strip"><span>🎟️ 준비물 쿠폰</span>${Object.entries(COUPONS).map(([code, c]) => {
      const owned = u && CouponBox.has(code);
      return `<button type="button" class="perk" data-perk="${code}" ${owned ? 'disabled' : ''}><b>${c.short}</b> ${esc(c.label.replace(/ \(.*\)/, ''))}${owned ? ' ✓' : ''}</button>`;
    }).join('')}<span class="muted" style="font-size:12px">${won(FREE_SHIPPING_MIN)} 이상 무료배송</span></div>`;
    $$('[data-perk]', box).forEach(b => b.addEventListener('click', () => {
      const r = CouponBox.give(b.dataset.perk);
      if (r === 'login') { toast('로그인하고 쿠폰을 받아보세요.', loginUrl(), '로그인'); return; }
      toast(r === 'ok' ? '쿠폰을 받았어요! 준비물 결제 때 쓸 수 있어요.' : '이미 받은 쿠폰이에요.', 'mypage.html?tab=coupons', '쿠폰함');
      paintPerks();
    }));
  }

  function render() {
    renderSide();
    paintPerks();
    const list = filtered();
    $('#title').innerHTML = title();
    $('#count').textContent = `총 ${list.length}${list.every(p => p.live) && list.length ? '마리' : '개'}`;
    // 동물 목록에서는 가격·할인 정렬 대신 추천·최신·후기순만
    if (isAnimalView() && !ANIMAL_SORTS.includes(state.sort)) state.sort = 'recommend';
    $$('[data-sort]').forEach(b => {
      b.classList.toggle('active', b.dataset.sort === state.sort);
      b.classList.toggle('hidden', isAnimalView() && !ANIMAL_SORTS.includes(b.dataset.sort));
      if (b.dataset.sort === 'reviews') b.textContent = isAnimalView() ? '입양후기순' : '리뷰많은순';
    });
    const size = perPage(), last = Math.max(1, Math.ceil(list.length / size));
    page = Math.min(Math.max(1, page), last);
    const from = (page - 1) * size;
    $('#results').innerHTML = list.length
      ? `<div class="grid">${list.slice(from, from + size).map(productCard).join('')}</div>
         ${pager(page, last)}
         ${last > 1 ? `<p class="pg-info muted">${from + 1}~${Math.min(from + size, list.length)}번째 · 전체 ${list.length}${list.every(p => p.live) ? '마리' : '개'}</p>` : ''}`
      : `<div class="empty card"><div class="ico">🐾</div><p>조건에 꼭 맞는 친구가 아직 없어요.<br>조건을 조금 풀어보거나, 다음 분양 알림을 받아보세요.</p><a class="btn btn-outline" href="products.html?live=1">모든 친구 만나보기</a></div>`;
    syncUrl();
    $$('.pager [data-page]').forEach(b => b.addEventListener('click', () => {
      page = Number(b.dataset.page);
      render();
      const top = $('.toolbar').getBoundingClientRect().top + window.scrollY - 90;
      window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }));
  }
  const reset = () => { page = 1; };
  // 화면 크기가 바뀌면 지금 보던 첫 친구가 들어 있는 페이지로 다시 나눠요
  let lastSize = perPage(), rt;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      const size = perPage();
      if (size === lastSize) return;
      page = Math.floor(((page - 1) * lastSize) / size) + 1;
      lastSize = size;
      render();
    }, 200);
  });

  $$('[data-sort]').forEach(b => b.addEventListener('click', () => { state.sort = b.dataset.sort; reset(); render(); }));
  render();
})();
