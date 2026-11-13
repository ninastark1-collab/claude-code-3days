(function () {
  const redirect = safeRedirect(param('redirect'));
  if (Auth.current()) { location.replace(redirect); return; }

  $('#app').innerHTML = `
    <div class="auth-box">
      <a href="index.html" class="logo">${LOGO}</a>
      <form class="card" id="form" novalidate>
        <div class="field"><label for="email">이메일</label><input class="input" id="email" type="email" autocomplete="username" placeholder="example@email.com"></div>
        <div class="field"><label for="pw">비밀번호</label><input class="input" id="pw" type="password" autocomplete="current-password" placeholder="비밀번호"></div>
        <label class="check" style="font-size:14px;margin-bottom:14px"><input type="checkbox" id="remember" checked> 아이디 저장</label>
        <div class="error-text hidden" id="err" style="margin-bottom:10px"></div>
        <button class="btn btn-primary btn-lg btn-block" type="submit" id="submit">로그인</button>
        <div class="auth-links"><span>아직 회원이 아니신가요?</span><a href="signup.html${param('redirect') ? '?redirect=' + encodeURIComponent(redirect) : ''}">회원가입</a></div>
      </form>
    </div>`;

  const saved = Store.get('savedEmail', '');
  if (saved) { $('#email').value = saved; $('#pw').focus(); } else $('#email').focus();

  $('#form').addEventListener('submit', async e => {
    e.preventDefault();
    const email = $('#email').value.trim();
    const pw = $('#pw').value;
    const err = $('#err');
    err.classList.add('hidden');
    if (!email || !pw) {
      err.textContent = '이메일과 비밀번호를 입력해 주세요.';
      err.classList.remove('hidden');
      return;
    }
    $('#submit').disabled = true;
    try {
      await Auth.login(email, pw);
      if ($('#remember').checked) Store.set('savedEmail', email.toLowerCase()); else Store.remove('savedEmail');
      location.href = redirect;
    } catch (ex) {
      err.textContent = ex.message;
      err.classList.remove('hidden');
      $('#submit').disabled = false;
    }
  });
})();
