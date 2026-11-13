(function () {
  const live = PRODUCTS.filter(p => p.live && !p.soldOut);
  // 새 가족을 기다리는 친구들: 분류별로 골고루 (강아지만 몰리지 않게)
  const byCat = {};
  live.filter(p => !(p.pet && p.pet.adult)).forEach(p => { (byCat[p.category] = byCat[p.category] || []).push(p); });
  const waiting = [];
  for (let round = 0; waiting.length < 8 && round < 20; round++) {
    CATEGORIES.forEach(c => { const list = byCat[c.id]; if (list && list[round] && waiting.length < 8) waiting.push(list[round]); });
  }
  const babies = live.filter(p => p.isNew).slice(0, 5);
  const adults = live.filter(p => p.pet && p.pet.adult);
  // 진짜 입양 가족이 남긴 이야기만 보여줘요 (예시 문장은 쓰지 않아요)
  const stories = Reviews.all().map(r => ({ ...r, p: getProduct(r.productId) })).filter(r => r.p && r.p.live).slice(0, 4);
  const recent = Recent.list().map(getProduct).filter(p => p && p.status !== 'hidden').slice(0, 5);
  const countBy = c => PRODUCTS.filter(p => p.category === c && !p.soldOut).length;
  const maskName = n => (!n ? '입양 가족' : n.length <= 1 ? n : n[0] + '*' + (n.length > 2 ? n.slice(-1) : ''));

  const ticker = ['💌 입양 신청서를 읽고 가족을 정해요', '✦ 모든 아이 수의사 건강검진', '✦ 분양 후 15일 건강보증', '✦ 생명은 택배 없이 직접 만나 인계', '✦ 입양 후에도 분양자와 함께 상담', '✦ 함께하기 어려워지면 돌아오기 약속'];
  const tickerHtml = ticker.map(t => `<span>${t}</span>`).join('');

  // 마키는 화면 전체 폭으로
  const marquee = document.createElement('div');
  marquee.className = 'marquee';
  marquee.setAttribute('aria-label', '안내');
  marquee.innerHTML = `<div class="marquee-track">${tickerHtml}${tickerHtml}</div>`;
  $('#app').before(marquee);

  const heroPics = [1, 9, 16, 22].map(getProduct).filter(Boolean);

  $('#app').innerHTML = `
    <section class="bento reveal">
      <div class="bento-main">
        <div>
          <div class="eyebrow">Responsible adoption</div>
          <h1>정성껏<br>키워주실<br>가족을<br><mark>기다려요.</mark></h1>
          <p>우리는 아이를 팔지 않고, 가족을 찾아요.<br>입양 신청서를 꼼꼼히 읽고 아이와 꼭 맞는 분께 보내드려요.</p>
        </div>
        <div class="cta">
          <a class="btn btn-sage btn-lg" href="products.html?live=1">가족을 기다리는 친구들 →</a>
          <button type="button" class="btn btn-outline btn-lg" data-quiz>🧩 나와 맞는 친구 찾기</button>
        </div>
        <div class="hero-pics" aria-hidden="true">${heroPics.map(p => `<img src="${safeImage(p.image)}" alt="">`).join('')}</div>
      </div>
      <a class="bento-prep" href="products.html?cat=supplies">
        <span class="big-emoji" aria-hidden="true">🧺</span>
        <div><div class="eyebrow">Welcome kit</div><h3>새 가족 맞이<br>준비물 챙기기</h3></div>
        <span class="arrow">→</span>
      </a>
      <a class="bento-lilac" href="#how">
        <span class="big-emoji" aria-hidden="true">🩺</span>
        <div><div class="eyebrow">How adoption works</div><h3>입양은 이렇게<br>진행돼요</h3></div>
        <span class="arrow">→</span>
      </a>
    </section>

    <section class="section">
      <div class="quiz-band">
        <div><div class="eyebrow">Find your match</div><h2>어떤 친구가 우리 집과 잘 맞을까?</h2><p>가족, 집, 혼자 있는 시간, 예산까지 10가지만 답하면 1분 만에 찾아드려요.</p></div>
        <button class="btn btn-primary btn-lg" data-quiz>🧩 나와 꼭 맞는 친구 찾기</button>
      </div>
    </section>

    <section class="section reveal">
      <div class="cat-grid cat-8">
        ${CATEGORIES.map(c => `<a class="cat-item" href="products.html?cat=${c.id}"><span class="ico">${c.icon}</span><div>${c.name}</div><small class="muted">${countBy(c.id)}${c.id === 'supplies' ? '개' : '마리'}</small></a>`).join('')}
      </div>
    </section>

    <section class="section">
      <div class="section-head">
        <div><div class="eyebrow">Waiting for family</div><h2>새 가족을 기다리는 친구들 🏡</h2></div>
        <a href="products.html?live=1">모두 만나보기</a>
      </div>
      <div class="grid">${waiting.map(p => productCard(p)).join('')}</div>
    </section>

    <section class="section">
      <div class="section-head"><div><div class="eyebrow" id="how">How adoption works</div><h2>몽글의 책임 분양은 이렇게 진행돼요</h2></div><a href="help.html">자세히 보기</a></div>
      <div class="help-grid adopt-steps">
        <div class="card"><span class="ico">💌</span><strong>1. 입양 신청서</strong><span class="muted">가족 동의, 사는 곳, 반려 경험, 혼자 있는 시간, 입양 이유를 적어주세요.</span></div>
        <div class="card"><span class="ico">👋</span><strong>2. 먼저 만나보기</strong><span class="muted">방문이나 화상으로 아이를 만나고, 분양자가 승인하면 그때 분양비를 결제해요.</span></div>
        <div class="card"><span class="ico">🏡</span><strong>3. 직접 만나 인계</strong><span class="muted">건강 기록·계약서·먹던 사료와 함께 보내드리고, 15일 건강보증을 시작해요.</span></div>
      </div>
    </section>

    ${babies.length ? `
    <section class="section">
      <div class="section-head"><div><div class="eyebrow">New arrivals</div><h2>이번 주 새로 온 아기들 🍼</h2></div><a href="products.html?live=1&sort=new">모두 보기</a></div>
      <div class="grid cols-5">${babies.map(p => productCard(p)).join('')}</div>
    </section>` : ''}

    ${adults.length ? `
    <section class="section">
      <div class="section-head"><div><div class="eyebrow">Grown-up friends</div><h2>의젓한 어른 친구들도 기다려요 🧓</h2><p class="muted" style="margin:6px 0 0">성격이 이미 자리 잡아 우리 집과 잘 맞는지 알기 쉬워요.</p></div><a href="products.html?live=1&stage=adult">모두 보기</a></div>
      <div class="grid">${adults.slice(0, 4).map(p => productCard(p)).join('')}</div>
    </section>` : ''}

    ${stories.length ? `
    <section class="section">
      <div class="section-head"><div><div class="eyebrow">Happy together</div><h2>새 가족을 만났어요 💛</h2></div></div>
      <div class="story-grid">${stories.map(st => `<a class="story" href="product.html?id=${st.p.id}">
        <div class="story-img">${safeImage(st.photo) ? `<div class="thumb"><img src="${safeImage(st.photo)}" alt="우리 아이 근황 사진"></div>` : thumb({ ...st.p, soldOut: false })}</div>
        <div class="story-body"><p>“${esc(st.text)}”</p><span>— ${esc(maskName(st.name))} 님</span></div></a>`).join('')}</div>
    </section>` : ''}

    <section class="section">
      <div class="shelter">
        <div><div class="eyebrow">Adopt, don't shop · 함께해요</div><h2>보호소 친구들도 가족을 기다려요 🐕</h2>
          <p>몽글은 책임 분양과 함께 유기동물 입양을 응원해요. 새 가족을 찾고 있다면 보호소 친구들도 꼭 한 번 만나보세요.</p></div>
        <div class="shelter-cards">
          <a class="card" href="https://www.animal.go.kr" target="_blank" rel="noopener noreferrer"><span class="ico">🔎</span><strong>보호소 친구 찾아보기</strong><span class="muted">국가동물보호정보시스템에서 전국 보호소 아이들을 볼 수 있어요 ↗</span></a>
          <div class="card"><span class="ico">💝</span><strong>분양비 5% 기부</strong><span class="muted">모든 분양비의 5%는 협력 보호소의 사료·치료비로 쓰여요. (데모)</span></div>
          <div class="card"><span class="ico">🏠</span><strong>임시보호·봉사</strong><span class="muted">입양이 어렵다면 임시보호나 봉사도 아이들에게 큰 힘이 돼요.</span></div>
        </div>
      </div>
    </section>

    ${recent.length ? `
    <section class="section">
      <div class="section-head"><div><div class="eyebrow">Recently viewed</div><h2>최근 만난 친구들</h2></div><a href="mypage.html?tab=recent">전체보기</a></div>
      <div class="grid cols-5">${recent.map(p => productCard(p)).join('')}</div>
    </section>` : ''}
  `;
})();
