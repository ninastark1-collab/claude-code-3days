(function () {
  if (!Auth.require()) return;
  const user = Auth.current();
  const co = Store.get('checkout', null);
  const lines = (co && co.items || []).map(i => ({ ...i, product: getProduct(i.id) })).filter(l => l.product);

  if (!lines.length) {
    $('#app').innerHTML = `<div class="empty card"><div class="ico">🧾</div><p>아직 신청하거나 받아볼 내용이 없어요.</p><a class="btn btn-primary" href="cart.html">몽글바구니로 가기</a></div>`;
    return;
  }

  const hasLive = lines.some(l => l.product.live);
  const liveOnly = lines.every(l => l.product.live);
  if (hasLive) document.title = '입양 신청서 | 몽글';
  const radios = (name, opts) => `<div class="choice-row">${opts.map(o => `<label><input type="radio" name="${name}" value="${o}"> ${o}</label>`).join('')}</div>`;
  const book = AddressBook.list();
  const addr = AddressBook.getDefault() || {};
  let coupon = '';
  let points = 0;
  const myPoints = user.points || 0;
  const pet = liveOnly ? lines[0].product : null;
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const lastDay = new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10);

  $('#app').innerHTML = `
    <h1 class="page-title">${hasLive ? '💌 입양 신청서' : '🧺 준비물 받아보기'}</h1>
    ${hasLive ? `<div class="adopt-steps-bar"><span class="on">① 신청서</span><span>② 만남</span><span>③ 승인 후 분양비 결제</span><span>④ 인계</span></div>
    <p class="muted" style="margin:0 0 20px">아이에게 꼭 맞는 가족을 찾기 위해 몇 가지만 여쭤볼게요. <b>지금은 결제하지 않아요.</b> 직접 만나보고 분양자가 승인한 뒤에 분양비를 결제해요.</p>` : ''}
    <div class="cart-layout">
      <div>
        <section class="card co-section">
          <h2>${hasLive ? '보호자 정보 · 주소' : '배송지'}</h2>
          ${book.length ? `<div class="addr-pick" role="group" aria-label="저장된 배송지">${book.map(a => `<button type="button" data-addr="${esc(a.id)}" class="${a.id === addr.id ? 'active' : ''}">${a.id === AddressBook.defaultId() ? '⭐ ' : ''}${esc(a.name)} · ${esc(a.addr1.slice(0, 14))}${a.addr1.length > 14 ? '…' : ''}</button>`).join('')}<button type="button" data-addr="">+ 새 배송지</button></div>` : ''}
          <div class="row">
            <div class="field"><label for="rName">${hasLive ? '보호자 이름' : '받는 분'}</label><input class="input" id="rName" value="${esc(addr.name || user.name)}"></div>
            <div class="field"><label for="rPhone">연락처</label><input class="input" id="rPhone" type="tel" value="${esc(addr.phone || user.phone)}"></div>
          </div>
          <div class="field"><label for="zip">주소</label>
            <div class="row" style="margin-bottom:8px"><input class="input" id="zip" placeholder="우편번호 (5자리)" maxlength="5" inputmode="numeric" value="${esc(addr.zip || '')}" style="flex:0 0 150px"><input class="input" id="addr1" placeholder="기본 주소 (예: 서울시 강남구 테헤란로 123)" value="${esc(addr.addr1 || '')}"></div>
            <input class="input" id="addr2" placeholder="상세 주소 (동/호수)" value="${esc(addr.addr2 || '')}">
          </div>
          <div class="field ${liveOnly ? 'hidden' : ''}"><label for="memo">배송 요청사항</label>
            <select class="select" id="memo">
              <option>문 앞에 놓아주세요</option><option>경비실에 맡겨주세요</option><option>택배함에 넣어주세요</option><option>배송 전 연락 바랍니다</option>
            </select>
          </div>
          <div style="display:flex;gap:18px;flex-wrap:wrap">
            <label class="check" style="font-size:14px"><input type="checkbox" id="saveAddr" checked> 배송지 목록에 저장</label>
            <label class="check" style="font-size:14px"><input type="checkbox" id="defAddr" ${book.length ? '' : 'checked'}> 기본 배송지로 설정</label>
          </div>
          <div class="error-text" id="addrErr"></div>
        </section>

        ${hasLive ? `<section class="card co-section adopt-form">
          <h2>🏡 우리 가족을 소개해 주세요</h2>
          <div class="q"><span class="q-title">가족 모두가 입양에 동의했나요? *</span>${radios('qFamily', ['네, 모두 동의했어요', '아직 상의 중이에요'])}</div>
          <div class="q"><span class="q-title">어떤 집에서 함께 살게 되나요? *</span>${radios('qHome', ['아파트', '빌라·연립', '단독주택', '원룸·오피스텔'])}</div>
          <div class="q"><span class="q-title">반려동물을 키워본 적이 있나요? *</span>${radios('qExp', ['처음이에요', '키워본 적 있어요', '지금도 함께 살고 있어요'])}</div>
          <div class="q"><span class="q-title">아이가 하루에 혼자 있는 시간은요? *</span>${radios('qAlone', ['4시간 이하', '4~8시간', '8시간 이상'])}</div>
          <div class="q"><label for="qWhy">이 친구를 가족으로 맞이하고 싶은 이유 *</label>
            <textarea class="input" id="qWhy" rows="4" maxlength="500" placeholder="아이와 어떻게 지내고 싶은지, 어떤 준비를 했는지 자유롭게 적어주세요. (20자 이상)"></textarea></div>
          <div class="error-text" id="appErr"></div>
        </section>

        <section class="card co-section adopt-form">
          <h2>👋 먼저 만나보세요</h2>
          <p class="muted" style="margin-top:-6px;font-size:14px">아이를 직접 만나 성격과 건강 상태를 확인한 뒤에 결정해요. 부모견·부모묘도 함께 볼 수 있어요.</p>
          <div class="q"><span class="q-title">만남 방법 *</span>${radios('qMeet', ['몽글 하우스 방문', '화상 만남'])}</div>
          <div class="row">
            <div class="field"><label for="qDate">희망 날짜 *</label><input class="input" type="date" id="qDate" min="${tomorrow}" max="${lastDay}"></div>
            <div class="field"><span class="q-title" style="display:block;font-weight:600;font-size:13px;margin-bottom:7px">시간대 *</span>${radios('qSlot', ['오전', '오후', '저녁'])}</div>
          </div>
          <div class="error-text" id="meetErr"></div>
        </section>

        ${pet && pet.pet && pet.pet.cost ? `<section class="card co-section">
          <h2>💸 함께하는 데 드는 비용</h2>
          <div class="cost-mini">한 달 약 <b>${feeText(pet.pet.cost.monthly)}</b> · ${pet.pet.adult ? '남은' : '평생'} 약 ${pet.pet.cost.years}년 동안 약 <b>${feeText(pet.pet.cost.lifetime)}</b></div>
          <label class="check" style="font-size:14px;margin-top:10px"><input type="checkbox" id="costAgree"> [필수] 사료·병원비·보험 등 예상 비용을 확인했고, 꾸준히 책임질 수 있어요.</label>
          <div class="error-text" id="costErr"></div>
        </section>` : ''}

        <section class="card co-section">
          <h2>🤝 인계 방법</h2>
          <div class="pay-methods" style="grid-template-columns:repeat(2,1fr)">
            <label><input type="radio" name="handover" value="매장 방문 수령" checked>🏠<br>매장 방문 수령<br><span class="muted" style="font-size:12px">무료 · 상담 후 인계</span></label>
            <label><input type="radio" name="handover" value="펫택시 직접 인계">🚕<br>펫택시 직접 인계<br><span class="muted" style="font-size:12px">무료 (데모) · 위 주소로</span></label>
          </div>
          <div class="live-note">생명은 동물보호법에 따라 <strong>택배로 보내지 않아요.</strong> 만남과 승인, 분양비 결제가 끝나면 직접 만나 아이를 안전하게 인계해요. (데모)</div>
        </section>

        <section class="card co-section">
          <div class="promise">
            <h3>🐾 입양 약속</h3>
            <ol>
              <li>아이의 평생을 책임지고, 어떤 이유로도 버리지 않을게요.</li>
              <li>아플 때는 병원에 데려가고, 매년 건강검진을 챙길게요.</li>
              <li>이사·결혼·출산 같은 변화가 있어도 함께할게요.</li>
              <li>사정이 생기면 혼자 결정하지 않고 몽글과 먼저 상의할게요. (🤝 돌아오기 약속)</li>
            </ol>
            <label class="check" style="font-size:14px"><input type="checkbox" id="liveAgree"> [필수] 위 약속을 지키고, 분양 계약서(15일 건강보증, 마음이 바뀌어도 돌려보내지 않기)를 확인했어요.</label>
          </div>
          <div class="error-text" id="liveErr"></div>
        </section>` : ''}

        <section class="card co-section">
          <h2>${liveOnly ? '입양을 신청하는 친구' : `준비물 (${lines.length}개)`}</h2>
          ${lines.map(l => `
            <div class="co-item">
              ${thumb(l.product, 'sm')}
              <div><div>${esc(l.product.name)}</div><div class="muted" style="font-size:13px">${l.product.live ? `${l.option ? esc(l.option) + ' · ' : ''}${l.product.pet ? esc(l.product.pet.age) : ''} · 분양비` : `${l.option ? esc(l.option) + ' · ' : ''}${l.qty}개${l.product.fast ? ' · <span style="color:var(--accent)">🚀 내일도착</span>' : ''}`}</div></div>
              <strong>${won(l.product.price * l.qty)}</strong>
            </div>`).join('')}
        </section>

        <section class="card co-section ${liveOnly ? 'hidden' : ''}">
          <h2>할인 쿠폰 <span class="muted" style="font-size:13px;font-weight:400">${hasLive ? '(용품에만 적용돼요)' : ''}</span></h2>
          <select class="select" id="couponSel" aria-label="쿠폰 선택"></select>
          <div id="couponMsg"></div>
          <div class="coupon-row" style="margin-top:10px"><input class="input" id="couponInput" placeholder="쿠폰 코드가 있다면 입력해 등록하세요"><button class="btn" id="couponBtn">등록</button></div>
          <div class="demo-note">쿠폰은 홈 화면 쿠폰존에서 받을 수 있어요. 데모 코드: <strong>WELCOME10</strong> · <strong>MONGLE5000</strong> · <strong>SALE15</strong></div>
        </section>

        <section class="card co-section ${liveOnly ? 'hidden' : ''}">
          <h2>적립금</h2>
          <div class="point-row"><input class="input" id="pointInput" type="number" min="0" step="100" placeholder="0" ${myPoints ? '' : 'disabled'}><button class="btn" id="pointAll" ${myPoints ? '' : 'disabled'}>전액 사용</button></div>
          <div class="muted" style="font-size:13px;margin-top:6px">보유 적립금 <strong>${won(myPoints)}</strong> · 잘 받았다고 확인하면 결제금액의 ${POINT_RATE * 100}%가 적립돼요.</div>
        </section>

        <section class="card co-section ${liveOnly ? 'hidden' : ''}">
          <h2>${hasLive ? '분양비 결제 수단' : '결제 수단'}</h2>
          <div class="pay-methods">
            <label><input type="radio" name="pay" value="신용/체크카드" checked>💳<br>신용/체크카드</label>
            <label><input type="radio" name="pay" value="간편결제">📱<br>간편결제</label>
            <label><input type="radio" name="pay" value="계좌이체">🏦<br>계좌이체</label>
            <label><input type="radio" name="pay" value="휴대폰 결제">📞<br>휴대폰 결제</label>
          </div>
          <div class="demo-note">🔒 데모 결제입니다. 카드번호 등 실제 결제 정보는 입력받지 않으며, 결제하기를 누르면 모의 승인 처리됩니다.</div>
        </section>
      </div>

      <aside class="card summary">
        <h3>${liveOnly ? '분양비 안내' : '결제 금액'}</h3>
        <div id="sum"></div>
        <label class="check" style="font-size:13px;margin-top:12px"><input type="checkbox" id="agree"> ${liveOnly ? '신청 내용이 사실임을 확인합니다 (필수)' : '준비물 내용을 확인했고 결제에 동의해요 (필수)'}</label>
        ${liveOnly ? '<p class="muted" style="font-size:12px;margin:8px 0 0">💡 지금은 결제하지 않아요. 만남 후 분양자가 승인하면 마이페이지에서 분양비를 결제해요.</p>' : ''}
        <label class="check" style="font-size:13px;margin-top:8px"><input type="checkbox" id="privacyAgree"> [필수] 개인정보 수집·이용에 동의해요 <a href="terms.html?tab=privacy" target="_blank" class="link-btn">내용 보기</a></label>
        <p class="muted" style="font-size:12px;margin:4px 0 0">${hasLive ? '이름·연락처·주소와 신청서 답변(가족·주거·반려 경험 등)을 입양 검토와 분양자 연락에만 써요.' : '이름·연락처·주소를 준비물 배송에만 써요.'}</p>
        <div class="error-text" id="agreeErr"></div>
        <button class="btn btn-primary btn-lg btn-block" id="payBtn" style="margin-top:12px"></button>
      </aside>
    </div>`;

  function renderSum() {
    const t = calcTotals(lines, coupon, points);
    $('#sum').innerHTML = `
      ${liveOnly
        ? `<div class="sum-row"><span>${pet && pet.fee && pet.fee.type === '책임비' ? '책임비 (평생 책임 약속)' : '분양비 (건강검진·돌봄 포함)'}</span><span>${won(t.subtotal)}</span></div>
           <div class="sum-row"><span>인계비</span><span>무료</span></div>`
        : `<div class="sum-row"><span>준비물 금액</span><span>${won(t.originTotal)}</span></div>
      <div class="sum-row"><span>준비물 할인</span><span style="color:var(--danger)">-${won(t.saved)}</span></div>
      <div class="sum-row"><span>쿠폰할인</span><span style="color:var(--danger)">-${won(t.couponDiscount)}</span></div>
      <div class="sum-row"><span>적립금 사용</span><span style="color:var(--danger)">-${won(t.pointsUsed)}</span></div>
      <div class="sum-row"><span>배송비</span><span>${t.shipping ? '+' + won(t.shipping) : '무료'}</span></div>`}
      <div class="sum-row total"><span>${liveOnly ? '승인 후 결제할 분양비' : '최종 결제금액'}</span><span>${liveOnly ? feeText(t.total) : won(t.total)}</span></div>
      ${liveOnly ? '' : `<div class="muted" style="font-size:13px;text-align:right">잘 받았다고 확인하면 ${won(Math.floor(lines.filter(l => !l.product.live).reduce((s, l) => s + l.product.price * l.qty, 0) * POINT_RATE))} 적립 예정</div>`}`;
    $('#payBtn').textContent = liveOnly ? '💌 입양 신청서 보내기' : hasLive ? `💌 입양 신청하기 · ${won(t.total)}` : `${won(t.total)} 결제하기`;
    return t;
  }
  renderSum();

  function applyPoints(v) {
    const max = calcTotals(lines, coupon).subtotal - calcTotals(lines, coupon).couponDiscount;
    let n = Math.max(0, Math.floor(Number(v) || 0));
    if (n > myPoints) { n = myPoints; toast(`보유 적립금은 ${won(myPoints)}이에요.`); }
    if (n > max) n = max;
    points = n;
    $('#pointInput').value = n || '';
    renderSum();
  }
  $('#pointInput').addEventListener('change', e => applyPoints(e.target.value));
  $('#pointAll').addEventListener('click', () => applyPoints(myPoints));

  $('#zip').addEventListener('input', e => { e.target.value = e.target.value.replace(/\D/g, ''); });

  // 쿠폰: 쿠폰함의 미사용 쿠폰 중 선택 (조건 미달은 비활성)
  const sub0 = calcTotals(lines).subtotal;
  function paintCoupons(selected) {
    const mine = CouponBox.usable();
    const ok = mine.filter(c => sub0 >= COUPONS[c.code].min);
    // 가장 할인이 큰 쿠폰을 기본 선택
    if (selected === undefined) {
      selected = ok.map(c => c.code).sort((a, b) => calcTotals(lines, b).couponDiscount - calcTotals(lines, a).couponDiscount)[0] || '';
    }
    $('#couponSel').innerHTML = `<option value="">${mine.length ? '쿠폰 사용 안 함' : '사용 가능한 쿠폰이 없어요'}</option>` + mine.map(c => {
      const def = COUPONS[c.code];
      const can = sub0 >= def.min;
      return `<option value="${c.code}" ${can ? '' : 'disabled'} ${c.code === selected ? 'selected' : ''}>${esc(def.label)}${can ? ` → -${won(calcTotals(lines, c.code).couponDiscount)}` : ` (${won(def.min)} 이상 담으면)`}</option>`;
    }).join('');
    setCoupon(selected);
  }
  function setCoupon(code) {
    coupon = code || '';
    const msg = $('#couponMsg');
    msg.className = coupon ? 'success-text' : '';
    msg.textContent = coupon ? `✓ ${COUPONS[coupon].label} 쿠폰이 적용되었어요.` : '';
    applyPoints(points);
  }
  $('#couponSel').addEventListener('change', e => setCoupon(e.target.value));
  $('#couponBtn').addEventListener('click', () => {
    const code = $('#couponInput').value.trim().toUpperCase();
    const msg = $('#couponMsg');
    const r = CouponBox.give(code);
    if (r === 'invalid') { msg.className = 'error-text'; msg.textContent = '존재하지 않는 쿠폰 코드예요.'; return; }
    if (r === 'dup' && !CouponBox.usable().some(c => c.code === code)) { msg.className = 'error-text'; msg.textContent = '이미 사용한 쿠폰이에요.'; return; }
    $('#couponInput').value = '';
    if (sub0 < COUPONS[code].min) {
      paintCoupons(coupon);
      msg.className = 'error-text';
      msg.textContent = `쿠폰함에 등록했어요. 이 쿠폰은 ${won(COUPONS[code].min)} 이상 담으면 쓸 수 있어요.`;
      return;
    }
    paintCoupons(code);
  });
  paintCoupons();

  // 저장된 배송지 선택
  $$('[data-addr]').forEach(b => b.addEventListener('click', () => {
    const a = AddressBook.list().find(x => x.id === b.dataset.addr) || { name: '', phone: '', zip: '', addr1: '', addr2: '' };
    $('#rName').value = a.name || (b.dataset.addr ? '' : user.name);
    $('#rPhone').value = a.phone || (b.dataset.addr ? '' : user.phone);
    $('#zip').value = a.zip; $('#addr1').value = a.addr1; $('#addr2').value = a.addr2;
    $$('[data-addr]').forEach(x => x.classList.toggle('active', x === b));
    if (!b.dataset.addr) $('#zip').focus();
  }));

  $('#payBtn').addEventListener('click', () => {
    const f = {
      name: $('#rName').value.trim(), phone: $('#rPhone').value.trim(), zip: $('#zip').value.trim(),
      addr1: $('#addr1').value.trim(), addr2: $('#addr2').value.trim(),
    };
    const addrErr = $('#addrErr');
    addrErr.textContent = '';
    $('#agreeErr').textContent = '';
    if (!f.name || !f.phone || !/^\d{5}$/.test(f.zip) || !f.addr1 || !f.addr2) {
      addrErr.textContent = '받는 분, 연락처, 우편번호(5자리), 주소를 모두 입력해 주세요.';
      addrErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    let application = null;
    if (hasLive) {
      const pick = n => ($(`input[name=${n}]:checked`) || {}).value || '';
      application = { family: pick('qFamily'), home: pick('qHome'), experience: pick('qExp'), alone: pick('qAlone'), why: $('#qWhy').value.trim() };
      const err = $('#appErr');
      err.textContent = '';
      if (!application.family || !application.home || !application.experience || !application.alone) err.textContent = '가족 소개 질문에 모두 답해 주세요.';
      else if (application.family !== '네, 모두 동의했어요') err.textContent = '가족 모두가 동의한 뒤에 신청해 주세요. 함께 사는 가족 모두의 동의가 가장 중요해요.';
      else if (application.why.length < 20) err.textContent = '입양하고 싶은 이유를 20자 이상 적어주세요.';
      if (err.textContent) { err.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    }
    let meeting = null;
    if (hasLive) {
      const pick = n => ($(`input[name=${n}]:checked`) || {}).value || '';
      meeting = { type: pick('qMeet'), date: $('#qDate').value, slot: pick('qSlot') };
      const me = $('#meetErr');
      me.textContent = '';
      if (!meeting.type || !meeting.date || !meeting.slot) me.textContent = '만남 방법과 희망 날짜, 시간대를 골라주세요.';
      else if (meeting.date < tomorrow || meeting.date > lastDay) me.textContent = '희망 날짜는 내일부터 3주 안에서 골라주세요.';
      if (me.textContent) { me.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
      if ($('#costAgree') && !$('#costAgree').checked) {
        $('#costErr').textContent = '예상 비용을 확인했다는 데 체크해 주세요.';
        $('#costErr').scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      if ($('#costErr')) $('#costErr').textContent = '';
    }
    if (hasLive && !$('#liveAgree').checked) {
      $('#liveErr').textContent = '입양 약속에 동의해 주세요.';
      $('#liveErr').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (!$('#privacyAgree').checked) {
      $('#agreeErr').textContent = '개인정보 수집·이용에 동의해 주세요.';
      return;
    }
    if (!$('#agree').checked) {
      $('#agreeErr').textContent = liveOnly ? '신청 내용 확인에 체크해 주세요.' : '결제 동의에 체크해 주세요.';
      return;
    }

    // 결제 직전 재검증: 이미 결제된 주문서 / 재고 / 판매상태
    const pending = Store.get('checkout', null);
    if (!pending || !pending.items || !pending.items.length) {
      toast('이미 접수된 내용이에요. 우리 아이 소식에서 확인해 주세요.', 'mypage.html', '소식 보기');
      return;
    }
    for (const l of lines) {
      const cur = getProduct(l.id);
      if (!cur || cur.status === 'hidden' || cur.stock < l.qty) {
        modal({
          title: '지금 담을 수 없는 준비물이 있어요',
          body: `<p><b>${esc(l.product.name)}</b><br>${!cur || cur.status === 'hidden' ? '판매가 중지되었어요.' : `남은 재고가 ${cur.stock}개예요.`}<br>몽글바구니에서 수량을 맞춰 주세요.</p>`,
          okText: '몽글바구니로', cancelText: '',
          onOk: () => { location.href = 'cart.html'; },
        });
        return;
      }
    }
    if (points > (Auth.current().points || 0)) { toast('적립금이 부족해요.'); applyPoints(0); return; }
    if (coupon && !CouponBox.usable().some(c => c.code === coupon)) { toast('이미 사용된 쿠폰이에요. 다른 쿠폰을 선택해 주세요.'); paintCoupons(''); return; }

    const t = renderSum();
    const btn = $('#payBtn');
    btn.disabled = true;
    btn.textContent = liveOnly ? '신청서를 보내는 중...' : '결제 승인 중...';

    setTimeout(() => {
      if ($('#saveAddr').checked || $('#defAddr').checked) {
        if (AddressBook.save(f, $('#defAddr').checked) === null) toast('배송지는 10개까지 저장할 수 있어요.');
      }
      const now = new Date();
      const no = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}` + '-' + String(Math.floor(Math.random() * 1e6)).padStart(6, '0');
      Orders.create({
        no,
        userEmail: user.email,
        date: now.toISOString(),
        items: lines.map(l => ({
          id: l.id, name: l.product.name, option: l.option, qty: l.qty, price: l.product.price,
          seller: l.product.seller, sellerEmail: l.product.sellerEmail, status: '결제완료', tracking: '', reviewed: false, live: !!l.product.live,
        })),
        pointsUsed: t.pointsUsed,
        address: f,
        memo: $('#memo').value,
        handover: hasLive ? $('input[name=handover]:checked').value : '',
        application,
        meeting,
        adoption: liveOnly,
        paid: !liveOnly,
        payMethod: liveOnly ? '승인 후 결제' : $('input[name=pay]:checked').value,
        coupon,
        totals: t,
      });
      if (coupon) CouponBox.use(coupon, no);
      lines.forEach(l => Catalog.adjustStock(l.id, -l.qty));
      if (t.pointsUsed) Auth.addPoints(user.email, -t.pointsUsed);
      if (co.source === 'cart') Cart.removeKeys(lines.map(l => l.key));
      Store.remove('checkout');
      location.replace('order-complete.html?new=1&no=' + encodeURIComponent(no));
    }, 1000);
  });
})();
