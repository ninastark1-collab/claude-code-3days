(function () {
  if (!Auth.require()) return;
  const TABS = [['orders', '💌 우리 아이 소식'], ['care', '🩺 건강 캘린더'], ['coupons', '쿠폰함'], ['wish', '관심 친구·용품'], ['recent', '최근 만난 친구'], ['address', '배송지 관리'], ['qna', '내 문의'], ['profile', '회원정보']];
  let tab = TABS.some(t => t[0] === param('tab')) ? param('tab') : 'orders';
  let orderFilter = '전체';

  function ordersHtml() {
    const all = Orders.mine();
    const filters = ['전체', '배송중', '배송완료', '구매확정', '취소/반품'];
    const match = (o, f) => {
      const s = Orders.status(o);
      if (f === '전체') return true;
      if (f === '배송중') return ['결제완료', '배송준비중', '배송중'].includes(s);
      if (f === '취소/반품') return o.items.some(i => ['주문취소', '반품요청', '반품완료'].includes(i.status));
      return s === f;
    };
    const orders = all.filter(o => match(o, orderFilter));
    const head = `<div class="sort-tabs" style="margin-bottom:14px">${filters.map(f => `<button data-filter="${f}" class="${f === orderFilter ? 'active' : ''}">${({ 배송중: '진행 중', 배송완료: '도착·인계', 구매확정: '완료', '취소/반품': '취소·환불·보증' })[f] || f} (${all.filter(o => match(o, f)).length})</button>`).join('')}</div>`;
    if (!all.length) return `<div class="empty"><div class="ico">📦</div><p>아직 소식이 없어요. 새 가족을 만나러 가볼까요?</p><a class="btn btn-primary" href="index.html">친구들 만나러 가기</a></div>`;
    if (!orders.length) return head + `<div class="empty"><p>해당하는 소식이 없어요.</p></div>`;
    return head + orders.map(o => {
      const st = Orders.status(o);
      return `
      <div class="order">
        <div class="order-head">
          <div><strong>${fmtDate(o.date)} ${o.items.some(i => i.live) ? '입양 신청' : '준비물'}</strong> <span class="muted" style="font-size:13px">· ${esc(o.no)}</span></div>
          <span class="status s-${st}">${statusLabel(st, o.items.some(i => i.live))}</span>
        </div>
        ${o.items.map((i, idx) => {
          const p = getProduct(i.id);
          return `<div class="co-item">${p ? `<a href="product.html?id=${p.id}">${thumb(p, 'sm')}</a>` : '<div class="thumb sm" style="background:var(--bg)"><span class="emoji">📦</span></div>'}
            <div><div>${esc(i.name)}</div><div class="muted" style="font-size:13px">${i.live ? `${i.option ? esc(i.option) + ' · ' : ''}분양비 ${feeText(i.price)}${o.adoption ? (o.paid ? ' · 결제 완료' : ' · 승인 후 결제') : ''}` : `${i.option ? esc(i.option) + ' · ' : ''}${i.qty}개 · ${won(i.price * i.qty)}`}</div>
              ${i.live && o.meeting && ['결제완료', '배송준비중'].includes(i.status) ? `<div class="muted" style="font-size:12px">👋 만남: ${esc(o.meeting.type)} · ${esc(o.meeting.date)} ${esc(o.meeting.slot)}</div>` : ''}
              ${i.declined ? `<div class="decline-msg">🌷 ${esc(i.declineMsg || '이번에는 함께하지 못하게 되었어요. 다른 친구와의 좋은 인연을 응원할게요.')}</div>` : ''}
              ${i.rehome ? `<div class="muted" style="font-size:12px">🤝 재입양 상담 접수됨 (${fmtDate(i.rehome.at)}) · 몽글 상담 선생님이 연락드려요</div>` : ''}
              ${i.tracking && i.status !== '주문취소' ? `<div class="muted" style="font-size:12px">🚚 송장 ${esc(i.tracking)}</div>` : ''}
              ${i.status === '반품요청' ? `<div class="muted" style="font-size:12px">${i.live ? '🩺 건강보증' : '💌 교환·환불'} 사유: ${esc(i.returnReason)} · ${i.sellerEmail ? '판매자 확인 중' : '곧 자동 승인돼요 (데모)'}</div>` : ''}
              ${i.refund ? `<div class="muted" style="font-size:12px">💸 환불 ${won(i.refund.cash)}${i.refund.points ? ` + ${i.refund.points.toLocaleString()}P` : ''}${i.refund.fee ? ` (왕복 배송비 ${won(i.refund.fee)} 차감)` : ''}</div>` : ''}</div>
            <div style="text-align:right"><span class="status s-${i.status}">${statusLabel(i.status, i.live)}</span>
              <div class="item-actions">
                ${i.status === '배송완료' ? `<button class="btn btn-sm btn-primary" data-confirm="${esc(o.no)}" data-idx="${idx}" data-live="${i.live ? 1 : ''}">${i.live ? '입양 완료' : '잘 받았어요'}</button><button class="btn btn-sm" data-return="${esc(o.no)}" data-idx="${idx}">${i.live ? '건강보증 신청' : '교환·환불'}</button>` : ''}
                ${['배송완료', '구매확정'].includes(i.status) && !i.reviewed && p ? `<button class="btn btn-sm btn-outline" data-review="${esc(o.no)}" data-idx="${idx}">${i.live ? '💌 근황 남기기' : '리뷰쓰기'}</button>` : ''}
                ${i.reviewed ? '<span class="muted" style="font-size:12px">리뷰 작성완료</span>' : ''}
                ${i.live && ['배송완료', '구매확정'].includes(i.status) && !i.rehome ? `<button class="btn btn-sm" data-rehome="${esc(o.no)}" data-idx="${idx}">함께하기 어려워졌어요</button>` : ''}
                ${!i.live && ['배송완료', '구매확정'].includes(i.status) && p && p.status !== 'hidden' && !p.soldOut ? `<button class="btn btn-sm" data-rebuy="${i.id}" data-opt="${esc(i.option)}">다시 담기</button>` : ''}
              </div>
            </div></div>`;
        }).join('')}
        <div class="order-head" style="margin:10px 0 0">
          <span>${o.adoption ? (o.paid ? `분양비 <strong>${feeText(o.totals.total)}</strong> <span class="muted" style="font-size:13px">(${esc(o.payMethod)})</span>` : Orders.status(o) === '주문취소' ? '<span class="muted">결제 없이 마무리되었어요</span>' : `분양비 <strong>${feeText(o.totals.total)}</strong> <span class="muted" style="font-size:13px">· ${Orders.canPayAdoption(o) ? '승인 완료! 결제를 기다려요' : '만남·승인 후 결제'}</span>`) : `결제금액 <strong>${won(o.totals.total)}</strong> <span class="muted" style="font-size:13px">(${esc(o.payMethod)})</span>`}</span>
          <span style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">
            ${Orders.canPayAdoption(o) ? `<button class="btn btn-sm btn-primary" data-payadopt="${esc(o.no)}">💳 분양비 결제하기</button>` : ''}
            <a class="btn btn-sm" href="order-complete.html?no=${encodeURIComponent(o.no)}">${o.adoption ? '신청 상세' : '자세히 보기'}</a>
            ${Orders.canCancel(o) ? `<button class="btn btn-sm" data-cancel="${esc(o.no)}">${o.adoption ? '신청 취소' : '취소하기'}</button>` : ''}
          </span>
        </div>
      </div>`;
    }).join('');
  }

  function gridOrEmpty(ids, emptyMsg, extra = '') {
    const list = ids.map(getProduct).filter(p => p && p.status !== 'hidden');
    return list.length ? extra + `<div class="grid">${list.map(productCard).join('')}</div>` : `<div class="empty"><div class="ico">🛍️</div><p>${emptyMsg}</p><a class="btn btn-primary" href="index.html">친구들 만나보기</a></div>`;
  }

  function couponsHtml() {
    const mine = CouponBox.list();
    const notOwned = Object.keys(COUPONS).filter(c => !CouponBox.has(c));
    return `${notOwned.length ? `<div class="free-hint">받을 수 있는 쿠폰이 ${notOwned.length}장 더 있어요! <a href="index.html" style="font-weight:700;text-decoration:underline">홈 쿠폰존 가기 →</a></div>` : ''}
      <div class="coupon-list">${mine.map(c => {
        const d = COUPONS[c.code];
        return `<div class="coupon ${c.used ? 'used' : ''}"><div class="c-val">${d.short}</div><div class="c-body"><strong>${esc(d.label)}</strong>
          <span class="muted">코드 ${esc(c.code)} · ${fmtDate(c.at)} 받음</span>
          <span style="font-weight:700;color:${c.used ? 'var(--muted)' : 'var(--forest)'}">${c.used ? '사용 완료' : '사용 가능'}</span></div></div>`;
      }).join('') || '<p class="muted">쿠폰이 없어요.</p>'}</div>
      <div class="coupon-row" style="margin-top:18px;max-width:420px"><input class="input" id="regCode" placeholder="쿠폰 코드 입력"><button class="btn" id="regBtn">등록</button></div>
      <p class="muted" style="font-size:13px">쿠폰은 한 번에 1장 쓸 수 있고, 취소하면 다시 돌려받아요.</p>`;
  }

  function addressHtml() {
    const list = AddressBook.list();
    const def = AddressBook.defaultId();
    return `${list.length ? list.map(a => `<div class="addr-card ${a.id === def ? 'default' : ''}">
        <div><strong>${esc(a.name)}</strong> ${a.id === def ? '<span class="chip on">기본 배송지</span>' : ''}<div class="muted" style="font-size:13px">${esc(a.phone)}</div>
          <div style="font-size:14px;margin-top:4px">[${esc(a.zip)}] ${esc(a.addr1)} ${esc(a.addr2)}</div></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">
          ${a.id === def ? '' : `<button class="btn btn-sm" data-defaddr="${esc(a.id)}">기본으로</button>`}
          <button class="btn btn-sm" data-editaddr="${esc(a.id)}">수정</button>
          <button class="btn btn-sm" data-deladdr="${esc(a.id)}">삭제</button>
        </div></div>`).join('') : '<div class="empty"><div class="ico">🏠</div><p>저장된 배송지가 없어요.</p></div>'}
      <button class="btn btn-primary" id="addAddr" ${list.length >= 10 ? 'disabled' : ''}>+ 배송지 추가 (${list.length}/10)</button>`;
  }

  function openAddress(a) {
    const v = a || { name: Auth.current().name, phone: Auth.current().phone, zip: '', addr1: '', addr2: '' };
    modal({
      title: a ? '배송지 수정' : '배송지 추가',
      body: `<div class="row"><div class="field"><label for="aName">받는 분</label><input class="input" id="aName" value="${esc(v.name)}"></div>
          <div class="field"><label for="aPhone">연락처</label><input class="input" id="aPhone" type="tel" value="${esc(v.phone)}"></div></div>
        <div class="field"><label for="aZip">우편번호</label><input class="input" id="aZip" maxlength="5" inputmode="numeric" value="${esc(v.zip)}"></div>
        <div class="field"><label for="aAddr1">기본 주소</label><input class="input" id="aAddr1" value="${esc(v.addr1)}"></div>
        <div class="field"><label for="aAddr2">상세 주소</label><input class="input" id="aAddr2" value="${esc(v.addr2)}"></div>
        <label class="check" style="font-size:14px"><input type="checkbox" id="aDef" ${a && a.id === AddressBook.defaultId() ? 'checked disabled' : ''}> 기본 배송지로 설정</label>
        <div class="error-text" id="aErr"></div>`,
      okText: '저장',
      onOk: w => {
        const f = { id: a && a.id, name: $('#aName', w).value.trim(), phone: $('#aPhone', w).value.trim(), zip: $('#aZip', w).value.trim(), addr1: $('#aAddr1', w).value.trim(), addr2: $('#aAddr2', w).value.trim() };
        if (!f.name || !/^0\d{1,2}-?\d{3,4}-?\d{4}$/.test(f.phone) || !/^\d{5}$/.test(f.zip) || !f.addr1 || !f.addr2) {
          $('#aErr', w).textContent = '받는 분, 연락처(예: 010-1234-5678), 우편번호 5자리, 주소를 모두 입력해 주세요.';
          return false;
        }
        AddressBook.save(f, $('#aDef', w).checked);
        toast('배송지를 저장했어요.');
        render();
      },
    });
  }

  function careHtml() {
    const rows = [];
    Orders.mine().forEach(o => o.items.forEach(it => {
      if (it.live && ['배송완료', '구매확정'].includes(it.status)) rows.push({ o, it });
    }));
    if (!rows.length) return `<div class="empty"><div class="ico">🩺</div><p>새 가족이 집에 오면 첫날부터 한 달까지의 돌봄 일정과<br>다음 예방접종 날짜를 여기서 챙겨드려요.</p><a class="btn btn-outline" href="help.html?tab=guide">입양 후 첫 일주일 가이드</a></div>`;
    const now = new Date();
    return rows.map(({ o, it }) => {
      const p = getProduct(it.id);
      return `<div class="care-card">
        <div class="care-head">${p ? thumb(p, 'sm') : ''}<div><strong>${esc(it.name.split(' · ')[0])}</strong><div class="muted" style="font-size:13px">우리 집에 온 날 ${fmtDate(it.doneAt || o.paidAt || o.date)}</div></div></div>
        <ul class="care-list">${CarePlan.forItem(o, it).map(c => `<li class="${c.date <= now ? 'done' : ''}"><span class="d">${c.date.getMonth() + 1}/${c.date.getDate()}</span>${esc(c.text)}${c.date <= now ? ' <span class="muted">✓</span>' : ''}</li>`).join('')}</ul>
        <a class="link-btn" href="help.html?tab=guide">📖 ${esc(getCategory((p || {}).category).name)} 첫 일주일 가이드 보기</a>
      </div>`;
    }).join('');
  }

  function qnaHtml() {
    const u = Auth.current();
    const list = QnA.all().filter(q => q.email === u.email);
    if (!list.length) return '<div class="empty"><div class="ico">💬</div><p>작성한 문의가 없어요. 친구·용품 페이지의 [문의] 탭에서 질문할 수 있어요.</p></div>';
    return list.map(q => `<div class="qna">
      <div><span class="chip ${q.answer ? 'on' : 'off'}">${q.answer ? '답변완료' : '답변대기'}</span> <a href="product.html?id=${q.productId}&tab=qna" class="muted" style="font-size:13px">${esc(getProduct(q.productId)?.name || '지금은 볼 수 없는 친구')}</a></div>
      <p style="margin:6px 0"><b>Q.</b> ${esc(q.question)}</p><div class="muted" style="font-size:12px">${fmtDate(q.date)}</div>
      ${q.answer ? `<div class="a"><b>A.</b> ${esc(q.answer)}</div>` : ''}</div>`).join('');
  }

  function profileHtml() {
    const u = Auth.current();
    const a = u.address;
    return `<table class="info-table">
      <tr><th>이름</th><td>${esc(u.name)}</td></tr>
      <tr><th>이메일</th><td>${esc(u.email)}</td></tr>
      <tr><th>휴대폰</th><td>${esc(u.phone)}</td></tr>
      <tr><th>적립금</th><td><strong style="color:var(--primary)">${won(u.points)}</strong></td></tr>
      <tr><th>기본 배송지</th><td>${a ? `[${esc(a.zip)}] ${esc(a.addr1)} ${esc(a.addr2)}` : '<span class="muted">등록된 배송지가 없어요 (첫 신청 때 저장돼요)</span>'}</td></tr>
      <tr><th>마케팅 수신</th><td><label class="check"><input type="checkbox" id="mkt" ${u.marketing ? 'checked' : ''}> 이벤트·혜택 알림 받기</label></td></tr>
      <tr><th>판매자</th><td>${u.seller ? `${esc(u.seller.storeName)} <a class="btn btn-sm" href="seller.html">셀러센터</a>` : '<a class="btn btn-sm" href="seller.html">판매자 등록하기</a>'}</td></tr>
      <tr><th>가입일</th><td>${fmtDate(u.createdAt)}</td></tr>
    </table>
    <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">
      <button class="btn" id="chPw">비밀번호 변경</button>
      <button class="btn" id="logout2">로그아웃</button>
    </div>`;
  }

  function render() {
    const u = Auth.current();
    const orders = Orders.mine();
    const toConfirm = orders.reduce((n, o) => n + o.items.filter(i => i.status === '배송완료').length, 0);
    const body = {
      orders: ordersHtml,
      wish: () => gridOrEmpty(Wish.list(), '마음에 담은 친구가 없어요. 🤍를 눌러보세요.'),
      recent: () => gridOrEmpty(Recent.list(), '최근 만난 친구가 없어요.', Recent.list().length ? '<div style="text-align:right;margin-bottom:10px"><button class="link-btn" id="clearRecent">전체 삭제</button></div>' : ''),
      qna: qnaHtml,
      care: careHtml,
      coupons: couponsHtml,
      address: addressHtml,
      profile: profileHtml,
    }[tab]();

    $('#app').innerHTML = `
      <div class="my-layout">
        <aside class="card my-menu">
          <div class="profile"><strong>${esc(u.name)}</strong>님
            <div class="muted" style="font-size:13px">적립금 <b style="color:var(--primary)">${won(u.points)}</b></div>
            <div class="muted" style="font-size:13px">소식 ${orders.length}건 · 관심 ${Wish.list().length}개 · 쿠폰 ${CouponBox.usable().length}장</div>
            ${toConfirm ? `<div class="free-hint" style="margin-bottom:0">확인을 기다리는 소식 ${toConfirm}건</div>` : ''}
          </div>
          ${TABS.map(([k, v]) => `<button data-tab="${k}" class="${k === tab ? 'active' : ''}">${v}</button>`).join('')}
        </aside>
        <section class="card" style="min-width:0">
          <h1 class="page-title" style="margin-top:0">${TABS.find(t => t[0] === tab)[1]}</h1>
          ${body}
        </section>
      </div>`;
    bind();
  }

  function bind() {
    $$('[data-tab]').forEach(b => b.addEventListener('click', () => {
      tab = b.dataset.tab;
      history.replaceState(null, '', 'mypage.html?tab=' + tab);
      render();
    }));
    $$('[data-filter]').forEach(b => b.addEventListener('click', () => { orderFilter = b.dataset.filter; render(); }));
    $$('[data-cancel]').forEach(b => b.addEventListener('click', () => modal({
      title: '취소하기',
      body: '<p>정말 취소할까요?<br><span class="muted" style="font-size:13px">결제 금액은 결제 수단으로 환불되고, 사용한 적립금은 즉시 반환돼요. (데모)</span></p>',
      okText: '취소할게요',
      onOk: () => {
        if (Orders.cancel(b.dataset.cancel)) toast('취소되었어요.');
        else toast('이미 발송되어 취소할 수 없어요. 고객센터로 문의해 주세요.');
        renderHeader(); render();
      },
    })));
    $$('[data-confirm]').forEach(b => b.addEventListener('click', () => modal({
      title: b.dataset.live ? '입양 완료' : '잘 받았어요',
      body: b.dataset.live
        ? '<p>새 가족과 잘 지내고 있나요? 💛<br><span class="muted" style="font-size:13px">입양 완료 후에는 건강보증 신청이 어려워요. 15일 동안 건강하게 지냈는지 확인 후 눌러주세요.</span></p>'
        : '<p>준비물을 잘 받으셨나요?<br><span class="muted" style="font-size:13px">확인 후에는 교환·환불 신청이 어려워요.</span></p>',
      okText: b.dataset.live ? '입양 완료' : '잘 받았어요',
      onOk: () => {
        const pts = Orders.confirm(b.dataset.confirm, Number(b.dataset.idx));
        toast(b.dataset.live ? '입양을 축하해요! 오래오래 행복하세요. 💛' : `고마워요! 적립금 ${won(pts)}이 적립되었어요.`);
        renderHeader(); render();
      },
    })));
    $$('[data-review]').forEach(b => b.addEventListener('click', () => openReview(b.dataset.review, Number(b.dataset.idx))));
    $$('[data-return]').forEach(b => b.addEventListener('click', () => openReturn(b.dataset.return, Number(b.dataset.idx))));
    $$('[data-payadopt]').forEach(b => b.addEventListener('click', () => {
      const o = Orders.find(b.dataset.payadopt);
      modal({
        title: '분양비 결제',
        body: `<p style="margin-top:0">만남은 잘 하셨나요? 💛<br>분양비 <b>${feeText(o.totals.total)}</b> (${won(o.totals.total)})를 결제하면 인계를 준비해요.</p>
          <div class="choice-row">${['신용/체크카드', '간편결제', '계좌이체'].map((m, k) => `<label><input type="radio" name="apay" value="${m}" ${k ? '' : 'checked'}> ${m}</label>`).join('')}</div>
          <p class="muted" style="font-size:12px">🔒 데모 결제예요. 실제 결제 정보는 입력받지 않아요.</p>`,
        okText: '분양비 결제하기',
        onOk: w => {
          const m = $('input[name=apay]:checked', w).value;
          toast(Orders.payAdoption(o.no, m) ? '분양비 결제가 완료되었어요. 곧 인계를 준비할게요! 🏡' : '지금은 결제할 수 없는 상태예요.');
          renderHeader(); render();
        },
      });
    }));
    $$('[data-rehome]').forEach(b => b.addEventListener('click', () => {
      const w = modal({
        title: '🤝 돌아오기 약속',
        body: `<p style="margin-top:0">함께하기 어려운 사정이 생겼군요. 혼자 결정하지 않고 알려주셔서 정말 고마워요.<br><span class="muted" style="font-size:13px">몽글이 아이를 다시 맡아 건강을 확인하고, 새 가족을 신중히 찾아드려요. 비용은 받지 않아요.</span></p>
          <div class="field"><label for="rhReason">어떤 사정인가요?</label><select class="select" id="rhReason">${['이사·주거 환경 변화', '가족 건강(알레르기 등)', '경제적 어려움', '돌볼 시간이 부족해요', '아이와 맞지 않아요', '기타'].map(r => `<option>${r}</option>`).join('')}</select></div>
          <textarea class="input" id="rhText" rows="3" maxlength="500" placeholder="상담 선생님이 미리 알면 좋은 내용을 적어주세요. (선택)"></textarea>
          <p class="muted" style="font-size:12px">경제적 어려움이라면 사료·병원비 지원 프로그램부터 함께 찾아볼게요. (데모)</p>`,
        okText: '상담 신청하기',
        onOk: wrap => {
          toast(Orders.requestRehome(b.dataset.rehome, Number(b.dataset.idx), $('#rhReason', wrap).value, $('#rhText', wrap).value.trim()) ? '재입양 상담이 접수되었어요. 곧 연락드릴게요.' : '이미 상담이 접수되었어요.');
          render();
        },
      });
    }));
    const reg = $('#regBtn');
    if (reg) reg.addEventListener('click', () => {
      const code = $('#regCode').value.trim().toUpperCase();
      const r = CouponBox.give(code);
      toast(r === 'ok' ? '쿠폰을 등록했어요!' : r === 'dup' ? '이미 등록된 쿠폰이에요.' : '존재하지 않는 쿠폰 코드예요.');
      if (r === 'ok') render();
    });
    $$('[data-defaddr]').forEach(b => b.addEventListener('click', () => { AddressBook.setDefault(b.dataset.defaddr); toast('기본 배송지를 변경했어요.'); render(); }));
    $$('[data-editaddr]').forEach(b => b.addEventListener('click', () => openAddress(AddressBook.list().find(a => a.id === b.dataset.editaddr))));
    $$('[data-deladdr]').forEach(b => b.addEventListener('click', () => modal({
      title: '배송지 삭제', body: '<p>이 배송지를 삭제할까요?</p>', okText: '삭제',
      onOk: () => { AddressBook.remove(b.dataset.deladdr); toast('배송지를 삭제했어요.'); render(); },
    })));
    const add = $('#addAddr');
    if (add) add.addEventListener('click', () => openAddress(null));
    $$('[data-rebuy]').forEach(b => b.addEventListener('click', () => {
      if (Cart.add(Number(b.dataset.rebuy), b.dataset.opt, 1)) toast('몽글바구니에 담았어요. 🧺', 'cart.html', '바구니 보기');
      else toast('지금은 담을 수 없는 준비물이에요.');
    }));
    const cr = $('#clearRecent');
    if (cr) cr.addEventListener('click', () => { Recent.clear(); render(); });
    const mkt = $('#mkt');
    if (mkt) mkt.addEventListener('change', e => { Auth.updateCurrent({ marketing: e.target.checked }); toast(e.target.checked ? '혜택 알림 수신에 동의했어요.' : '혜택 알림 수신을 해제했어요.'); });
    const lo = $('#logout2');
    if (lo) lo.addEventListener('click', () => { Auth.logout(); location.href = 'index.html'; });
    const ch = $('#chPw');
    if (ch) ch.addEventListener('click', () => modal({
      title: '비밀번호 변경',
      body: `<div class="field"><label for="oldPw">현재 비밀번호</label><input class="input" type="password" id="oldPw" autocomplete="current-password"></div>
        <div class="field"><label for="newPw">새 비밀번호 (영문+숫자 8~20자)</label><input class="input" type="password" id="newPw" autocomplete="new-password"></div>
        <div class="field"><label for="newPw2">새 비밀번호 확인</label><input class="input" type="password" id="newPw2" autocomplete="new-password"></div>
        <div class="error-text" id="pwErr"></div>`,
      okText: '변경',
      onOk: async w => {
        const err = $('#pwErr', w);
        const n = $('#newPw', w).value;
        if (!/^(?=.*[A-Za-z])(?=.*\d).{8,20}$/.test(n)) { err.textContent = '새 비밀번호는 영문과 숫자를 포함해 8~20자로 입력해 주세요.'; return false; }
        if (n !== $('#newPw2', w).value) { err.textContent = '새 비밀번호가 일치하지 않아요.'; return false; }
        try { await Auth.changePassword($('#oldPw', w).value, n); toast('비밀번호를 변경했어요.'); }
        catch (ex) { err.textContent = ex.message; return false; }
      },
    }));
  }

  function openReturn(no, idx) {
    const o = Orders.find(no);
    const it = o.items[idx];
    const preview = reason => {
      const r = Orders.refundFor(o, { ...it, returnReason: reason });
      return `예상 환불액 <b>${won(r.cash)}</b>${r.points ? ` + 적립금 ${r.points.toLocaleString()}P` : ''}${r.fee ? `<br><span class="muted">단순 변심은 왕복 배송비 ${won(r.fee)}이 차감돼요.</span>` : ''}`;
    };
    const w = modal({
      title: it.live ? '🩺 건강보증 신청' : '교환·환불 신청',
      body: `<p style="margin-top:0"><b>${esc(it.name)}</b> · ${it.qty}${it.live ? "마리" : "개"}</p>
        <div class="field"><label for="rtReason">${it.live ? '어떤 일이 있었나요?' : '사유'}</label><select class="select" id="rtReason">${(it.live ? LIVE_RETURN_REASONS : RETURN_REASONS).map(r => `<option>${r}</option>`).join('')}</select></div>
        <textarea class="input" id="rtText" rows="3" maxlength="300" placeholder="자세한 내용을 적어주세요 (선택)"></textarea>
        <div class="free-hint" id="rtPreview">${preview((it.live ? LIVE_RETURN_REASONS : RETURN_REASONS)[0])}</div>
        ${it.live ? '<p class="muted" style="font-size:12px;margin:0 0 6px">많이 놀라셨죠. 인계 후 15일 안에 아프거나, 무지개다리를 건넜거나, 분양 정보와 다를 때 신청할 수 있어요. 수의사 진단서를 함께 보내주시면 분양자가 끝까지 책임지고 도와드려요. (데모)</p>' : ''}
        ${it.live ? '<p class="muted" style="font-size:12px;margin:0">분양자가 1일 안에 연락드려 아이 상태를 함께 살펴요. 치료 지원이 먼저이고, 필요하면 환불해 드려요. (데모)</p>' : '<p class="muted" style="font-size:12px;margin:0">택배 기사님이 1~2일 안에 준비물을 가지러 가요. 확인 후 결제 수단으로 환불돼요. (데모)</p>'}`,
      okText: it.live ? '건강보증 신청하기' : '교환·환불 신청하기',
      onOk: wrap => {
        if (Orders.requestReturn(no, idx, $('#rtReason', wrap).value, $('#rtText', wrap).value.trim())) toast(it.live ? '건강보증 신청이 접수되었어요. 곧 연락드릴게요.' : '교환·환불 신청이 접수되었어요.');
        else toast('지금은 신청할 수 없는 상태예요.');
        render();
      },
    });
    $('#rtReason', w).addEventListener('change', e => { $('#rtPreview', w).innerHTML = preview(e.target.value); });
  }

  // 반려동물: 별점 대신 '우리 아이 근황' (한마디 + 사진 + 요즘 모습)
  function openStory(no, idx) {
    const o = Orders.find(no);
    const it = o.items[idx];
    const MOODS = ['잘 먹어요 🍚', '잘 자요 😴', '장난꾸러기예요 🎾', '애교쟁이예요 💕', '가족과 친해졌어요 🏡', '산책을 좋아해요 🐾'];
    const picked = new Set();
    let photo = '';
    const w = modal({
      title: '💌 우리 아이 근황 남기기',
      body: `<p style="margin-top:0"><b>${esc(it.name.split(' · ')[0])}</b>는(은) 요즘 어떻게 지내나요?<br><span class="muted" style="font-size:13px">별점은 없어요. 아이의 이야기를 들려주세요. 다음 가족에게 큰 힘이 돼요.</span></p>
        <div class="q-title" style="font-weight:600;font-size:13px;margin-bottom:6px">요즘 우리 아이는</div>
        <div class="quiz-chips">${MOODS.map(m => `<button type="button" class="quiz-chip" data-mood="${esc(m)}">${esc(m)}</button>`).join('')}</div>
        <textarea class="input" id="rvText" rows="4" maxlength="1000" placeholder="집에 온 뒤 달라진 모습, 좋아하는 놀이, 첫날의 기억 등을 적어주세요. (10자 이상)" style="margin-top:12px"></textarea>
        <div class="muted" style="font-size:12px;text-align:right"><span id="rvLen">0</span>/1000</div>
        <label style="font-weight:600;font-size:13px">📷 사진 한 장 (선택)</label>
        <input type="file" id="rvPhoto" accept="image/png,image/jpeg,image/webp">
        <div id="rvPrev" style="margin-top:8px"></div>
        <div class="error-text" id="rvErr"></div>`,
      okText: '근황 남기기',
      onOk: wrap => {
        const text = $('#rvText', wrap).value.trim();
        if (text.length < 10) { $('#rvErr', wrap).textContent = '아이 이야기를 10자 이상 들려주세요.'; return false; }
        const u = Auth.current();
        Reviews.add({ productId: it.id, orderNo: no, email: u.email, name: u.name, score: 5, text, option: it.option, moods: [...picked], photo, story: true });
        Orders.markReviewed(no, idx);
        toast('따뜻한 근황 고마워요! 💛', 'product.html?id=' + it.id + '&tab=review', '근황 보기');
        render();
      },
    });
    $$('[data-mood]', w).forEach(b => b.addEventListener('click', () => {
      const m = b.dataset.mood;
      if (picked.has(m)) picked.delete(m); else picked.add(m);
      b.classList.toggle('on', picked.has(m));
    }));
    $('#rvText', w).addEventListener('input', e => { $('#rvLen', w).textContent = e.target.value.length; });
    $('#rvPhoto', w).addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 10 * 1024 * 1024) { toast('10MB 이하 사진만 올릴 수 있어요.'); e.target.value = ''; return; }
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const scale = Math.min(1, 480 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
        photo = c.toDataURL('image/jpeg', 0.8);
        URL.revokeObjectURL(url);
        $('#rvPrev', w).innerHTML = `<img src="${safeImage(photo)}" alt="미리보기" style="max-width:160px;border-radius:14px">`;
      };
      img.src = url;
    });
  }

  function openReview(no, idx) {
    const o = Orders.find(no);
    const it = o.items[idx];
    if (it.live) return openStory(no, idx);
    let score = 5;
    const w = modal({
      title: '리뷰 쓰기',
      body: `<p style="margin-top:0"><b>${esc(it.name)}</b>${it.option ? `<br><span class="muted" style="font-size:13px">${esc(it.option)}</span>` : ''}</p>
        <div class="star-input" role="radiogroup" aria-label="별점">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-s="${n}" class="on" aria-label="${n}점">★</button>`).join('')}</div>
        <textarea class="input" id="rvText" rows="4" maxlength="1000" placeholder="어떠셨나요? 다른 고객에게 도움이 되도록 10자 이상 적어주세요." style="margin-top:10px"></textarea>
        <div class="muted" style="font-size:12px;text-align:right"><span id="rvLen">0</span>/1000</div>
        <div class="error-text" id="rvErr"></div>`,
      okText: '리뷰 등록',
      onOk: wrap => {
        const text = $('#rvText', wrap).value.trim();
        if (text.length < 10) { $('#rvErr', wrap).textContent = '리뷰를 10자 이상 작성해 주세요.'; return false; }
        const u = Auth.current();
        Reviews.add({ productId: it.id, orderNo: no, email: u.email, name: u.name, score, text, option: it.option });
        Orders.markReviewed(no, idx);
        toast('소중한 리뷰 감사합니다! ⭐', 'product.html?id=' + it.id + '&tab=review', '리뷰 보기');
        render();
      },
    });
    const btns = $$('[data-s]', w);
    btns.forEach(b => b.addEventListener('click', () => {
      score = Number(b.dataset.s);
      btns.forEach(x => x.classList.toggle('on', Number(x.dataset.s) <= score));
    }));
    $('#rvText', w).addEventListener('input', e => { $('#rvLen', w).textContent = e.target.value.length; });
  }

  // 찜 해제 시 목록 갱신
  document.addEventListener('click', e => {
    if (tab === 'wish' && e.target.closest('[data-wish]')) setTimeout(render, 0);
  });

  render();
  // 진행 중 주문이 있으면 상태 자동 갱신 (직영 상품 데모 배송)
  setInterval(() => {
    if (tab === 'orders' && !$('.modal-wrap') && Orders.mine().some(o => o.items.some(i => !i.sellerEmail && ['결제완료', '배송준비중', '배송중', '반품요청'].includes(i.status)))) { render(); CarePlan.check(); renderHeader(); }
  }, 10000);
})();
