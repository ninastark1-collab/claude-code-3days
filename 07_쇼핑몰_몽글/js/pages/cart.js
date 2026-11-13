(function () {
  // 구매 불가 사유 (품절/판매중지/삭제)
  function unavailable(p) {
    if (!p) return '더 이상 볼 수 없는 준비물';
    if (p.status === 'hidden') return '잠시 쉬는 준비물';
    if (p.soldOut) return '일시품절';
    return '';
  }

  function lines() {
    // 재고보다 많이 담긴 수량은 자동 조정
    let adjusted = false;
    const items = Cart.items().map(i => {
      const p = getProduct(i.id);
      if (p && !p.soldOut && i.qty > p.stock) { adjusted = true; return { ...i, qty: p.stock }; }
      return i;
    });
    if (adjusted) { Cart.save(items); setTimeout(() => toast('남은 수량이 적은 준비물의 개수를 맞췄어요.'), 100); }
    return items.map(i => {
      const product = getProduct(i.id);
      return { ...i, product, reason: unavailable(product) };
    });
  }

  // 관심 친구: 찜한 반려동물 (입양 신청으로 연결)
  function petsHtml() {
    const pets = Wish.list().map(getProduct).filter(p => p && p.live && p.status !== 'hidden');
    const head = `<div class="section-head" style="margin-bottom:12px"><div><div class="eyebrow">My favorite friends</div><h2>💌 마음에 담아둔 친구</h2></div><a href="products.html?live=1">더 만나보기</a></div>`;
    if (!pets.length) {
      return `<section class="card prep-pets">${head}<p class="muted" style="margin:0">친구 페이지에서 🤍를 누르면 여기에 모여요. 천천히 고민하고 입양 신청해 주세요.</p></section>`;
    }
    return `<section class="card prep-pets">${head}
      <div class="pet-row">${pets.map(p => `<div class="pet-mini">
        <a href="product.html?id=${p.id}">${thumb(p, 'sm')}</a>
        <div><a href="product.html?id=${p.id}"><strong>${esc(p.name.split(' · ')[0])}</strong></a>
          <div class="muted" style="font-size:12px">${p.pet ? esc(p.pet.age) + ' · ' : ''}분양비 ${feeText(p.price)}</div>
          ${adoptState(p) === 'pending' ? '<span class="tag tag-pend">💬 입양 상담 중</span>' : p.soldOut ? '<span class="tag tag-home">💛 가족을 찾았어요</span>' : `<a class="btn btn-sm btn-primary" href="product.html?id=${p.id}">💌 입양 신청하기</a>`}</div>
      </div>`).join('')}</div></section>`;
  }
  // 함께 준비하면 좋은 용품
  function suggestHtml() {
    const inCart = Cart.items().map(i => i.id);
    const list = PRODUCTS.filter(p => !p.live && !p.soldOut && !inCart.includes(p.id)).slice(0, 4);
    return list.length ? `<section class="section" style="margin-top:36px"><div class="section-head"><div><div class="eyebrow">Welcome kit</div><h2>새 가족 맞이, 이것도 준비해요 🦴</h2></div><a href="products.html?cat=supplies">준비물 더 보기</a></div>
      <div class="grid">${list.map(p => productCard(p)).join('')}</div></section>` : '';
  }

  function render() {
    const all = lines();
    if (!all.length) {
      $('#app').innerHTML = `<h1 class="page-title">🧺 몽글바구니</h1>
        ${petsHtml()}
        <div class="empty card" style="margin-top:16px"><div class="ico">🦴</div><p>아직 담은 준비물이 없어요.<br>새 가족을 맞이할 사료·방석·장난감을 담아보세요.</p><a class="btn btn-primary" href="products.html?cat=supplies">준비물 보러 가기</a></div>
        ${suggestHtml()}`;
      return;
    }
    const buyable = all.filter(l => !l.reason);
    const checked = buyable.filter(l => l.checked);
    const t = calcTotals(checked);
    const allChecked = buyable.length > 0 && checked.length === buyable.length;
    const remain = FREE_SHIPPING_MIN - t.subtotal;
    const bad = all.filter(l => l.reason);

    $('#app').innerHTML = `
      <h1 class="page-title">🧺 몽글바구니</h1>
      ${petsHtml()}
      <h2 class="prep-title">🦴 새 가족 맞이 준비물 (${all.length})</h2>
      <div class="cart-layout">
        <section class="card">
          <div class="cart-head">
            <label class="check"><input type="checkbox" id="checkAll" ${allChecked ? 'checked' : ''} ${buyable.length ? '' : 'disabled'}> 전체선택 (${checked.length}/${buyable.length})</label>
            <div style="display:flex;gap:6px">
              ${bad.length ? `<button class="btn btn-sm" id="delBad">지금 못 담는 것 빼기 (${bad.length})</button>` : ''}
              <button class="btn btn-sm" id="delSelected" ${checked.length ? '' : 'disabled'}>선택삭제</button>
            </div>
          </div>
          ${all.map(l => {
            const p = l.product;
            if (!p) return `<div class="cart-item" data-key="${esc(l.key)}"><span></span><div class="thumb sm" style="background:var(--bg)"><span class="emoji">🚫</span></div>
              <div><strong class="muted">${l.reason}</strong><div class="opt">지금은 만날 수 없어요.</div></div><div class="right"><button class="link-btn del">삭제</button></div></div>`;
            return `
            <div class="cart-item ${l.reason ? 'is-soldout' : ''}" data-key="${esc(l.key)}">
              <input type="checkbox" class="row-check" ${l.checked && !l.reason ? 'checked' : ''} ${l.reason ? 'disabled' : ''} aria-label="선택" style="width:18px;height:18px;accent-color:var(--primary)">
              <a href="product.html?id=${p.id}">${thumb(p, 'sm')}</a>
              <div>
                <a href="product.html?id=${p.id}"><strong>${esc(p.name)}</strong></a>
                ${l.option ? `<div class="opt">옵션: ${esc(l.option)}</div>` : ''}
                ${l.reason ? `<div class="error-text">${l.reason} · 지금은 담을 수 없어요</div>` : `<div class="tags">${p.fast ? '<span class="tag tag-fast">🚀 내일도착</span>' : ''}${p.freeShip ? '<span class="tag tag-free">무료배송</span>' : ''}${p.stock <= 5 ? `<span class="tag tag-low">${p.stock}개 남음</span>` : ''}</div>`}
                <div class="muted" style="font-size:13px">${won(p.price)} · ${esc(p.seller)}</div>
              </div>
              <div class="right">
                ${l.reason ? '' : `<div class="qty"><button class="dec" aria-label="수량 감소">−</button><input class="q" value="${l.qty}" inputmode="numeric" aria-label="수량"><button class="inc" aria-label="수량 증가">+</button></div>`}
                <strong>${won(p.price * l.qty)}</strong>
                <button class="link-btn del">삭제</button>
              </div>
            </div>`;
          }).join('')}
        </section>
        <aside class="card summary">
          <h3>준비물 결제 예정</h3>
          <div class="sum-row"><span>준비물 금액</span><span>${won(t.originTotal)}</span></div>
          <div class="sum-row"><span>할인금액</span><span style="color:var(--danger)">-${won(t.saved)}</span></div>
          <div class="sum-row"><span>배송비</span><span>${t.shipping ? '+' + won(t.shipping) : '무료'}</span></div>
          ${t.shipping && remain > 0 ? `<div class="free-hint">${won(remain)} 더 담으면 <strong>무료배송</strong>!<div class="ship-progress"><div style="width:${Math.min(100, Math.round(t.subtotal / FREE_SHIPPING_MIN * 100))}%"></div></div></div>` : ''}
          ${checked.length && Auth.current() && CouponBox.usable().length ? `<div class="muted" style="font-size:13px">🎟️ 보유 쿠폰 ${CouponBox.usable().length}장 · 결제 단계에서 자동 적용돼요</div>` : ''}
          <div class="sum-row total"><span>총 결제금액</span><span>${won(t.total)}</span></div>
          <button class="btn btn-primary btn-lg btn-block" id="order" style="margin-top:14px" ${checked.length ? '' : 'disabled'}>
            ${checked.length ? `준비물 ${checked.length}개 받아보기` : '준비물을 선택하세요'}
          </button>
          <a class="btn btn-block" href="products.html?cat=supplies" style="margin-top:8px">준비물 더 둘러보기</a>
        </aside>
      </div>
      ${suggestHtml()}`;
    bind();
  }

  function bind() {
    $('#checkAll').addEventListener('change', e => {
      Cart.save(Cart.items().map(i => ({ ...i, checked: e.target.checked })));
      render();
    });
    const delBad = $('#delBad');
    if (delBad) delBad.addEventListener('click', () => {
      Cart.removeKeys(lines().filter(l => l.reason).map(l => l.key));
      toast('지금 담을 수 없는 준비물을 뺐어요.');
      render();
    });
    $('#delSelected').addEventListener('click', () => {
      const keys = lines().filter(l => l.checked && !l.reason).map(l => l.key);
      if (!keys.length) return;
      modal({
        title: '고른 준비물 빼기',
        body: `<p>선택한 준비물 ${keys.length}개를 몽글바구니에서 뺄까요?</p>`,
        okText: '삭제',
        onOk: () => { Cart.removeKeys(keys); render(); toast('삭제했어요.'); },
      });
    });
    $$('.cart-item').forEach(row => {
      const key = row.dataset.key;
      const item = Cart.items().find(i => i.key === key);
      const p = getProduct(item.id);
      const setQty = n => {
        const max = Math.min(99, p ? p.stock : 99);
        if (n > max) toast(`최대 ${max}개까지 담을 수 있어요.`);
        Cart.update(key, { qty: Math.min(max, Math.max(1, n || 1)) });
        render();
      };
      const chk = $('.row-check', row);
      if (chk) chk.addEventListener('change', e => { Cart.update(key, { checked: e.target.checked }); render(); });
      const dec = $('.dec', row);
      if (dec) {
        dec.addEventListener('click', () => setQty(item.qty - 1));
        $('.inc', row).addEventListener('click', () => setQty(item.qty + 1));
        $('.q', row).addEventListener('change', e => setQty(parseInt(e.target.value, 10)));
      }
      $('.del', row).addEventListener('click', () => { Cart.removeKeys([key]); render(); toast('몽글바구니에서 뺐어요.'); });
    });
    $('#order').addEventListener('click', () => {
      const items = lines().filter(l => l.checked && !l.reason).map(({ key, id, option, qty }) => ({ key, id, option, qty }));
      Store.set('checkout', { source: 'cart', items });
      location.href = Auth.current() ? 'checkout.html' : 'login.html?redirect=checkout.html';
    });
  }

  render();
})();
