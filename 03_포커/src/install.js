// 폰에 '앱으로 설치' 돕기
//  - 안드로이드 크롬: 크롬이 설치를 허락하면(보통 화면을 눌러보고 30초쯤 지나면) 버튼 한 번으로 설치 창
//    아직 허락 전이면 '준비 중'으로 기다렸다가, 준비되는 순간 버튼이 '지금 설치하기'로 바뀜
//  - 삼성 인터넷(갤럭시 기본): 주소창의 설치 아이콘 / 메뉴로 설치 안내
//  - 아이폰: 공유 버튼 → '홈 화면에 추가' 안내 (애플 정책상 자동 설치 불가)
//  - 카카오톡 안: 기본 브라우저로 열어 줌
const $ = (id) => document.getElementById(id);
const ua = navigator.userAgent;
const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isAndroid = /Android/i.test(ua);
const isKakao = /KAKAOTALK/i.test(ua);
const isSamsung = /SamsungBrowser/i.test(ua);
const isInApp = isKakao || /Instagram|FBAN|FBAV|Line\/|NAVER\(inapp|DaumApps/i.test(ua);
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

let deferredPrompt = null;
let waiting = false;
let toastFn = () => {};

export function initInstall({ toast }) {
  toastFn = toast;
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then((r) => r.update()).catch(() => {});
  }
  const btn = $('install-btn');
  $('install-close').addEventListener('click', () => $('install-guide').classList.add('hidden'));
  if (isStandalone()) return; // 이미 앱으로 실행 중

  if (isInApp) setButton('📲 브라우저에서 열어 앱으로 설치');
  else if (isIOS) setButton('📲 홈 화면에 앱으로 설치');
  else if (isAndroid) setButton('📲 앱으로 설치하기');

  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    setButton('📲 지금 설치하기', { ready: true });
    if (waiting) {
      waiting = false;
      $('install-guide').classList.add('hidden');
      toastFn('설치 준비 완료! 버튼을 한 번 더 눌러주세요');
    }
  });
  addEventListener('appinstalled', () => {
    btn.classList.add('hidden');
    deferredPrompt = null;
    toastFn('설치됐어요! 홈 화면의 아이콘으로 실행하세요');
  });

  btn.addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice.catch(() => null);
      deferredPrompt = null;
      if (choice?.outcome === 'accepted') btn.classList.add('hidden');
      return;
    }
    if (isKakao) {
      // 카카오톡 → 폰 기본 브라우저로 같은 주소 열기
      location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(location.href)}`;
      return;
    }
    if (isInApp) return openGuide('inapp');
    if (isIOS) return openGuide('ios');
    if (isSamsung) return openGuide('samsung');
    if (isAndroid) {
      // 크롬이 아직 설치를 허락하지 않음 → 기다리는 동안 메뉴로 바로 설치하는 방법도 함께 안내
      waiting = true;
      setButton('⏳ 설치 준비 중… 잠시만요', { pending: true });
      return openGuide('chrome');
    }
    openGuide('other');
  });
}

function setButton(label, { ready = false, pending = false } = {}) {
  const btn = $('install-btn');
  btn.textContent = label;
  btn.classList.remove('hidden');
  btn.classList.toggle('ready', ready);
  btn.classList.toggle('pending', pending);
}

function openGuide(kind) {
  const { title, lead, steps } = {
    ios: {
      title: '홈 화면에 추가',
      lead: '아이폰은 애플 정책상 버튼으로 자동 설치가 안 돼요. 대신 10초면 돼요',
      steps: [
        ['사파리(또는 크롬)에서 이 화면을 열어요', '카카오톡 등 다른 앱 안에서는 설치가 안 돼요'],
        ['공유 버튼 <em class="ico">□↑</em> 을 눌러요', '사파리: 화면 아래 가운데 / 크롬: 주소창 오른쪽'],
        ['<em>홈 화면에 추가</em>를 눌러요', '목록을 조금 내리면 있어요'],
        ['오른쪽 위 <em>추가</em>를 누르면 끝!', '홈 화면의 금색 스페이드 아이콘으로 실행해요'],
      ],
    },
    samsung: {
      title: '삼성 인터넷에서 설치',
      lead: '갤럭시 기본 브라우저는 자체 설치 버튼을 써요',
      steps: [
        ['주소창 오른쪽의 <em>⬇ 설치</em> 아이콘을 눌러요', '아이콘이 없으면 아래 방법으로'],
        ['오른쪽 아래 <em>≡ 메뉴</em> → <em>현재 페이지 추가</em>', ''],
        ['<em>홈 화면</em>을 고르면 끝!', '홈 화면의 금색 스페이드 아이콘으로 실행해요'],
      ],
    },
    chrome: {
      title: '설치 준비 중이에요',
      lead: '크롬은 화면을 잠깐 써본 뒤(보통 30초 안팎) 바로 설치를 허락해요. 준비되면 버튼이 「지금 설치하기」로 바뀌어요',
      steps: [
        ['지금 바로 설치하려면: 오른쪽 위 <em>⋮</em> 메뉴', ''],
        ['<em>앱 설치</em> (또는 <em>홈 화면에 추가</em> → <em>설치</em>)', ''],
        ['홈 화면의 금색 스페이드 아이콘으로 실행해요', ''],
      ],
    },
    inapp: {
      title: '브라우저에서 열어 주세요',
      lead: '메신저 앱 안에서는 설치가 안 돼요',
      steps: [
        ['오른쪽 위(또는 아래) <em>⋮</em> 메뉴를 눌러요', ''],
        ['<em>다른 브라우저로 열기</em>를 눌러요', '크롬·사파리·삼성 인터넷 등'],
        ['열린 화면에서 다시 <em>📲 앱으로 설치</em>를 눌러요', ''],
      ],
    },
    other: {
      title: '앱으로 설치하기',
      lead: '한 번만 해두면 홈 화면 아이콘으로 바로 실행돼요',
      steps: [
        ['브라우저 메뉴를 눌러요', ''],
        ['<em>앱 설치</em> 또는 <em>홈 화면에 추가</em>를 눌러요', ''],
        ['홈 화면의 금색 스페이드 아이콘으로 실행해요', ''],
      ],
    },
  }[kind];
  $('install-title').textContent = title;
  $('install-lead').textContent = lead;
  $('install-steps').innerHTML = steps
    .map(([t, sub], i) => `<li><span class="step-no">${i + 1}</span><div><b>${t}</b>${sub ? `<span>${sub}</span>` : ''}</div></li>`)
    .join('');
  $('install-guide').classList.remove('hidden');
}
