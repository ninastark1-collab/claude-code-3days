(function () {
  const TABS = [['terms', '이용약관'], ['privacy', '개인정보처리방침'], ['contract', '분양 계약 안내']];
  let tab = TABS.some(t => t[0] === param('tab')) ? param('tab') : 'terms';

  const BODY = {
    terms: `
      <p class="muted">시행일 2026-11-12 · 학습용 데모 사이트의 예시 약관이에요.</p>
      <h3 class="sub-h">제1조 목적</h3>
      <p>이 약관은 몽글(이하 "몽글")이 제공하는 반려동물 책임 분양과 준비물 서비스의 이용 조건과 절차, 이용자와 몽글의 권리·의무를 정해요.</p>
      <h3 class="sub-h">제2조 책임 분양</h3>
      <ol class="habitat">
        <li>몽글은 입양 신청서와 만남을 거쳐 아이와 잘 맞는 가족에게만 분양해요. 분양자는 신청을 정중히 거절할 수 있어요.</li>
        <li>분양비는 분양자가 신청을 승인한 뒤에 결제해요. 승인 전에는 결제하지 않아요.</li>
        <li>생명은 택배로 보내지 않고, 매장 방문 또는 펫택시로 직접 만나 인계해요.</li>
      </ol>
      <h3 class="sub-h">제3조 건강보증</h3>
      <p>인계 후 15일 안에 아프면 분양자가 치료를 지원해요. 회복이 어렵거나 무지개다리를 건너면 같은 종 입양 또는 환불로 책임져요 (소비자분쟁해결기준). 마음이 바뀌었다는 이유로는 돌려보낼 수 없어요.</p>
      <h3 class="sub-h">제4조 돌아오기 약속</h3>
      <p>함께하기 어려운 사정이 생기면 버리지 말고 몽글과 먼저 상의해 주세요. 몽글이 아이를 다시 맡아 새 가족을 찾아요.</p>
      <h3 class="sub-h">제5조 준비물</h3>
      <p>준비물은 받은 뒤 7일 안에 교환·환불을 신청할 수 있어요. 단순 변심일 때는 왕복 배송비가 들어요.</p>`,
    privacy: `
      <p class="muted">시행일 2026-11-12 · 학습용 데모 사이트의 예시 방침이에요. 이 사이트는 서버가 없어 모든 정보가 이용자 브라우저에만 저장돼요.</p>
      <table class="info-table">
        <tr><th>수집 항목</th><td>이름, 이메일, 휴대폰 번호, 주소 · 입양 신청 시 가족 동의 여부, 주거 형태, 반려 경험, 혼자 있는 시간, 입양 이유, 만남 희망 일정</td></tr>
        <tr><th>이용 목적</th><td>회원 관리, 입양 신청서 검토와 분양자 연락, 아이 인계, 준비물 배송, 건강보증·돌아오기 상담</td></tr>
        <tr><th>보유 기간</th><td>회원 탈퇴 시까지. 단, 분양 계약 기록은 아이의 평생 관리와 법령에 따라 5년간 보관해요.</td></tr>
        <tr><th>제3자 제공</th><td>입양 신청서는 해당 아이의 분양자에게만 전달돼요. 그 밖의 제3자에게는 제공하지 않아요.</td></tr>
        <tr><th>동의 거부</th><td>동의하지 않을 수 있지만, 이 경우 입양 신청과 준비물 주문을 할 수 없어요.</td></tr>
        <tr><th>문의</th><td>개인정보 보호 담당 · 1588-0000 (데모)</td></tr>
      </table>`,
    contract: `
      <p>동물보호법은 반려동물을 분양할 때 계약서에 꼭 적어야 할 내용을 정하고 있어요. 몽글은 인계할 때 아래 내용을 담은 분양 계약서를 함께 드려요.</p>
      <table class="info-table">
        <tr><th>분양자 정보</th><td>동물판매업 등록번호, 상호, 주소, 연락처</td></tr>
        <tr><th>아이 정보</th><td>품종, 색상, 성별, 출생일, 판매일 당시의 건강 상태</td></tr>
        <tr><th>접종·진료 기록</th><td>예방접종 내역, 구충, 질병 치료 이력 (수의사 확인)</td></tr>
        <tr><th>동물등록</th><td>내장칩 번호와 보호자 변경 방법 (개는 등록 의무)</td></tr>
        <tr><th>보상 기준</th><td>인계 후 15일 안에 질병이 생기거나 사망한 경우의 치료 지원·교환·환불 기준</td></tr>
        <tr><th>분양비</th><td>분양비와 포함 항목 (건강검진, 접종, 동물등록 등)</td></tr>
      </table>
      <p class="muted" style="font-size:13px">강아지·고양이는 생후 2개월 이상만 분양할 수 있어요. 실제 운영 시 계약서 양식은 관련 법령을 꼭 확인해 주세요. (데모)</p>`,
  };

  function render() {
    document.title = TABS.find(t => t[0] === tab)[1] + ' | 몽글';
    $('#app').innerHTML = `
      <h1 class="page-title">약관 · 정책</h1>
      <div class="sort-tabs" style="margin-bottom:16px">${TABS.map(([k, v]) => `<button data-t="${k}" class="${k === tab ? 'active' : ''}">${v}</button>`).join('')}</div>
      <section class="card policy">${BODY[tab]}</section>`;
    $$('[data-t]').forEach(b => b.addEventListener('click', () => {
      tab = b.dataset.t;
      history.replaceState(null, '', 'terms.html?tab=' + tab);
      render();
    }));
  }
  render();
})();
