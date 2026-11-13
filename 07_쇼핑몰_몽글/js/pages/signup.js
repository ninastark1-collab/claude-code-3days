(function () {
  const redirect = safeRedirect(param('redirect'));
  if (Auth.current()) { location.replace(redirect); return; }

  $('#app').innerHTML = `
    <div class="auth-box">
      <a href="index.html" class="logo">${LOGO}</a>
      <form class="card" id="form" novalidate>
        <h2 style="margin-top:0">회원가입</h2>
        <div class="field"><label for="email">이메일</label><input class="input" id="email" type="email" autocomplete="email" placeholder="example@email.com"><div class="error-text" data-err="email"></div></div>
        <div class="field"><label for="pw">비밀번호</label><input class="input" id="pw" type="password" autocomplete="new-password" placeholder="영문, 숫자 포함 8~20자"><div class="error-text" data-err="pw"></div></div>
        <div class="field"><label for="pw2">비밀번호 확인</label><input class="input" id="pw2" type="password" autocomplete="new-password" placeholder="비밀번호 재입력"><div class="error-text" data-err="pw2"></div></div>
        <div class="field"><label for="name">이름</label><input class="input" id="name" autocomplete="name" placeholder="이름"><div class="error-text" data-err="name"></div></div>
        <div class="field"><label for="phone">휴대폰 번호</label><input class="input" id="phone" type="tel" autocomplete="tel" placeholder="010-1234-5678"><div class="error-text" data-err="phone"></div></div>
        <div class="terms">
          <label class="check all"><input type="checkbox" id="agreeAll"> 모두 동의합니다</label>
          <label class="check"><input type="checkbox" class="agree" data-required="1"> [필수] 만 14세 이상입니다</label>
          <label class="check"><input type="checkbox" class="agree" data-required="1"> [필수] 이용약관 동의 <a href="terms.html" target="_blank" class="link-btn">보기</a></label>
          <label class="check"><input type="checkbox" class="agree" data-required="1"> [필수] 개인정보 수집 및 이용 동의 <a href="terms.html?tab=privacy" target="_blank" class="link-btn">보기</a></label>
          <label class="check"><input type="checkbox" class="agree" id="marketing"> [선택] 마케팅 정보 수신 동의</label>
        </div>
        <div class="error-text" data-err="terms"></div>
        <button class="btn btn-primary btn-lg btn-block" type="submit" id="submit" style="margin-top:16px">가입하기</button>
        <div class="auth-links"><span>이미 회원이신가요?</span><a href="login.html${param('redirect') ? '?redirect=' + encodeURIComponent(redirect) : ''}">로그인</a></div>
      </form>
    </div>`;

  // 휴대폰 번호 자동 하이픈
  $('#phone').addEventListener('input', e => {
    const d = e.target.value.replace(/\D/g, '').slice(0, 11);
    e.target.value = d.length < 4 ? d : d.length < 8 ? `${d.slice(0, 3)}-${d.slice(3)}` : `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  });

  const agrees = $$('.agree');
  $('#agreeAll').addEventListener('change', e => agrees.forEach(a => (a.checked = e.target.checked)));
  agrees.forEach(a => a.addEventListener('change', () => { $('#agreeAll').checked = agrees.every(x => x.checked); }));

  function validate() {
    const v = {
      email: $('#email').value.trim(), pw: $('#pw').value, pw2: $('#pw2').value,
      name: $('#name').value.trim(), phone: $('#phone').value.trim(),
    };
    const errors = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) errors.email = '올바른 이메일 형식이 아니에요.';
    else if (Auth.users()[v.email.toLowerCase()]) errors.email = '이미 가입된 이메일입니다.';
    if (!/^(?=.*[A-Za-z])(?=.*\d).{8,20}$/.test(v.pw)) errors.pw = '영문과 숫자를 포함해 8~20자로 입력해 주세요.';
    if (!v.pw2 || v.pw !== v.pw2) errors.pw2 = '비밀번호가 일치하지 않아요.';
    if (v.name.length < 2) errors.name = '이름을 2자 이상 입력해 주세요.';
    if (!/^01[0-9]-\d{3,4}-\d{4}$/.test(v.phone)) errors.phone = '휴대폰 번호를 정확히 입력해 주세요.';
    if (!$$('.agree[data-required]').every(a => a.checked)) errors.terms = '필수 약관에 모두 동의해 주세요.';
    $$('[data-err]').forEach(el => { el.textContent = errors[el.dataset.err] || ''; });
    ['email', 'pw', 'pw2', 'name', 'phone'].forEach(k => $('#' + k).classList.toggle('invalid', !!errors[k]));
    return Object.keys(errors).length ? null : v;
  }

  $('#form').addEventListener('submit', async e => {
    e.preventDefault();
    const v = validate();
    if (!v) return;
    $('#submit').disabled = true;
    try {
      await Auth.signup({ name: v.name, email: v.email, password: v.pw, phone: v.phone, marketing: $('#marketing').checked });
      alert(`${v.name}님, 가입을 환영합니다! 🎉\n준비물을 받아볼 때 쿠폰코드 WELCOME10을 사용해 보세요.`);
      location.href = redirect;
    } catch (ex) {
      $('[data-err="email"]').textContent = ex.message;
      $('#submit').disabled = false;
    }
  });
})();
