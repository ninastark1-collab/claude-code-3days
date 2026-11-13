(function () {
  if (!Auth.require()) return;
  const o = Orders.find(param('no'));
  if (!o || o.userEmail !== Auth.current().email) {
    $('#app').innerHTML = `<div class="empty card"><div class="ico">🧾</div><p>소식을 찾을 수 없어요.</p><a class="btn btn-primary" href="mypage.html">${adopt ? "입양 신청 내역" : "우리 아이 소식"}</a></div>`;
    return;
  }
  const isNew = param('new') === '1';
  const status = Orders.status(o);
  const a = o.address;
  const t = o.totals;
  // 일부만 반품된 주문은 남은 상품 기준으로 진행 단계 표시
  const step = STATUS_FLOW.indexOf(status);
  const adopt = o.items.some(i => i.live);
  document.title = (adopt ? (isNew ? '입양 신청 완료' : '입양 신청 상세') : (isNew ? '준비물 접수 완료' : '준비물 소식')) + ' | 몽글';

  $('#app').innerHTML = `
    <div class="complete">
      ${isNew
        ? (adopt ? `<div class="ico">💌</div><h1>입양 신청이 접수되었어요</h1><p>소중한 마음 고마워요. 분양자가 신청서를 정성껏 읽고 만남 일정을 확인해 1일 안에 연락드릴게요.<br><b>분양비는 만남 후 승인되면 결제해요.</b></p>` : `<div class="ico">🎉</div><h1>준비물이 곧 출발해요! 🧺</h1>`)
        : `<h1 class="page-title">${adopt ? '입양 신청 상세' : '준비물 소식'}</h1>`}
      <p class="muted">${fmtDate(o.date)} ${adopt ? "신청 · 신청번호" : "접수 · 접수번호"} <strong>${esc(o.no)}</strong></p>
      <div class="card">
        ${step < 0
          ? `<div class="center"><span class="status s-${status}">${statusLabel(status, adopt)}</span><p class="muted">${status === '주문취소' ? '취소되었어요. 사용한 적립금과 쿠폰은 반환되었어요.' : status === '반품요청' ? (adopt ? '건강보증 신청이 접수되었어요. 분양자가 아이 상태를 함께 살펴볼게요.' : '교환·환불 신청이 접수되었어요. 확인 후 환불돼요.') : (adopt ? '건강보증 처리가 끝났어요. 마음 아픈 일이 있었다면 진심으로 위로드려요.' : '환불이 완료되었어요.')}</p></div>`
          : `<div class="timeline">${STATUS_FLOW.map((s, i) => `<div class="step ${i <= step ? 'done' : ''}"><div class="dot">${i <= step ? '✓' : i + 1}</div>${statusLabel(s, adopt)}</div>`).join('')}</div>`}
      </div>
      <div class="card">
        <h3 style="margin-top:0">${adopt ? '함께할 친구' : '함께 온 준비물'}</h3>
        ${o.items.map(i => {
          const p = getProduct(i.id);
          return `<div class="co-item">${p ? `<a href="product.html?id=${p.id}">${thumb(p, 'sm')}</a>` : '<div class="thumb sm" style="background:var(--bg)"><span class="emoji">📦</span></div>'}
            <div><div>${esc(i.name)}</div><div class="muted" style="font-size:13px">${i.option ? esc(i.option) + ' · ' : ''}${i.qty}개 · ${esc(i.seller || '몽글 직영')}</div>
            ${i.tracking ? `<div class="muted" style="font-size:12px">송장: ${esc(i.tracking)}</div>` : ''}
            ${i.returnReason ? `<div class="muted" style="font-size:12px">${i.live ? '건강보증' : '교환·환불'} 사유: ${esc(i.returnReason)}</div>` : ''}
            ${i.refund ? `<div class="muted" style="font-size:12px">환불 ${won(i.refund.cash)}${i.refund.points ? ` + ${i.refund.points.toLocaleString()}P` : ''}${i.refund.fee ? ` (왕복 배송비 ${won(i.refund.fee)} 차감)` : ''}</div>` : ''}</div>
            <div style="text-align:right">${won(i.price * i.qty)}<br><span class="status s-${i.status}">${statusLabel(i.status, i.live)}</span></div></div>`;
        }).join('')}
      </div>
      <div class="card">
        <table class="info-table">
          <tr><th>${adopt ? "보호자" : "받는 분"}</th><td>${esc(a.name)} (${esc(a.phone)})</td></tr>
          <tr><th>${adopt ? "주소" : "배송지"}</th><td>[${esc(a.zip)}] ${esc(a.addr1)} ${esc(a.addr2)}</td></tr>
          ${o.handover ? `<tr><th>인계 방법</th><td>🐾 ${esc(o.handover)}</td></tr>` : ''}
          ${o.meeting ? `<tr><th>만남 예약</th><td>👋 ${esc(o.meeting.type)} · ${esc(o.meeting.date)} ${esc(o.meeting.slot)}</td></tr>` : ''}
          ${o.adoption ? `<tr><th>분양비 결제</th><td>${o.paid ? `결제 완료 (${esc(o.payMethod)})` : Orders.status(o) === '주문취소' ? '결제 없이 마무리' : Orders.canPayAdoption(o) ? '<b style="color:var(--forest)">승인 완료!</b> 마이페이지에서 분양비를 결제해 주세요' : '만남 후 분양자가 승인하면 결제해요'}</td></tr>` : ''}
          ${o.items.some(i => i.declined) ? `<tr><th>분양자 메시지</th><td>🌷 ${esc(o.items.find(i => i.declined).declineMsg)}</td></tr>` : ''}
          ${o.application ? `<tr><th>입양 신청서</th><td>${esc(o.application.home)} · ${esc(o.application.experience)} · 혼자 있는 시간 ${esc(o.application.alone)}<div class="muted" style="font-size:13px;margin-top:4px">“${esc(o.application.why)}”</div></td></tr>` : ''}
          <tr><th>요청사항</th><td>${esc(o.memo)}</td></tr>
          ${o.adoption ? '' : `<tr><th>결제수단</th><td>${esc(o.payMethod)}</td></tr>`}
          <tr><th>${adopt ? "분양비·준비물 금액" : "준비물 금액"}</th><td>${won(t.subtotal)}</td></tr>
          ${t.couponDiscount ? `<tr><th>쿠폰할인</th><td>-${won(t.couponDiscount)} (${esc(o.coupon)})</td></tr>` : ''}
          ${t.pointsUsed ? `<tr><th>적립금 사용</th><td>-${won(t.pointsUsed)}</td></tr>` : ''}
          <tr><th>배송비</th><td>${t.shipping ? won(t.shipping) : '무료'}</td></tr>
          <tr><th>결제금액</th><td><strong style="font-size:20px;color:var(--primary)">${won(t.total)}</strong></td></tr>
        </table>
      </div>
      ${isNew ? '<p class="muted" style="font-size:13px">💡 데모: 몽글 직영 준비물·분양은 약 1분 뒤 인계(배송) 완료로 바뀌어요. 그 후 마이페이지에서 입양 완료(잘 받았어요)와 후기를 남길 수 있어요.</p>' : ''}
      <div class="row" style="margin-top:20px">
        <a class="btn btn-lg" href="mypage.html">${adopt ? "입양 신청 내역" : "우리 아이 소식"}</a>
        <a class="btn btn-primary btn-lg" href="index.html">${adopt ? "다른 친구들도 만나보기" : "더 둘러보기"}</a>
      </div>
    </div>`;
})();
