/**
 * QA 사이클 1 (qa/requests/사이클1_개발.md) 회귀 테스트 — 엔진 밖(UI·플랫폼) 수정분.
 * 엔진 수정분은 각 영역 테스트 파일에 둔다 (DEV-04 → save.test.ts, DEV-06 → balance.test.ts).
 */
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';

vi.spyOn(console, 'error').mockImplementation(() => {});

// localStorage 흉내 (node 환경)
const ls = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => ls.get(k) ?? null,
  setItem: (k: string, v: string) => void ls.set(k, String(v)),
  removeItem: (k: string) => void ls.delete(k),
};

describe('QA-DEV-02 오류 화면·오류 기록', () => {
  it('오류는 버전·시각과 함께 기기에 기록되고 최근 20건만 남는다', async () => {
    const { logError, readErrorLog } = await import('../src/ui/errorLog');
    for (let i = 0; i < 25; i++) logError('test', new Error(`e${i}`));
    const log = readErrorLog();
    expect(log.length).toBe(20);
    expect(log.at(-1)!.msg).toBe('e24');
    expect(log[0]!.v).toBeTruthy();
    expect(log[0]!.at).toMatch(/^\d{4}-/);
  });

  it('오류 화면에는 "자동 저장에서 이어하기"와 "타이틀로"가 있다', async () => {
    const { ErrorBoundary } = await import('../src/ui/ErrorScreen');
    const eb = new ErrorBoundary({ children: null });
    eb.state = { err: { v: '0.6.0', at: '', where: 'render', msg: '시험 오류' }, busy: false, note: '' };
    const html = renderToStaticMarkup(eb.render() as JSX.Element);
    expect(html).toContain('자동 저장에서 이어하기');
    expect(html).toContain('타이틀로');
    expect(html).toContain('시험 오류');
  });

  it('main.tsx 가 앱 전체를 오류 경계로 감싸고 전역 오류 처리를 설치한다', () => {
    const main = readFileSync('src/main.tsx', 'utf-8');
    expect(main).toMatch(/<ErrorBoundary>\s*<App \/>\s*<\/ErrorBoundary>/);
    expect(main).toContain('installGlobalErrorHandlers()');
  });

  it('"자동 저장에서 이어하기"는 가장 최근의 정상 자동 저장 칸을 고른다', async () => {
    const save = await import('../src/engine/save');
    const { loadGameData } = await import('../src/data/gameData');
    const { createGameState } = await import('../src/engine/state');
    const mem = new Map<string, string>();
    save.setSaveBackend({ read: async (n) => mem.get(n) ?? null, write: async (n, t) => void mem.set(n, t), remove: async (n) => void mem.delete(n) });
    expect(await save.latestAutoSlot()).toBeNull();
    const s = createGameState(loadGameData(), 's194', 'liu_bei', 1);
    await save.saveGame(s, 'auto1', 'a');
    await new Promise((r) => setTimeout(r, 5));
    await save.saveGame(s, 'auto3', 'b');
    await new Promise((r) => setTimeout(r, 5));
    await save.saveGame(s, 'slot1', 'manual'); // 수동 저장은 고르지 않는다
    expect(await save.latestAutoSlot()).toBe('auto3');
    mem.set('auto3', '{깨짐');
    expect(await save.latestAutoSlot()).toBe('auto1');
    save.setSaveBackend(null);
  });
});

describe('QA-DEV-03 앱 내림 감지', () => {
  it('앱 시작 때 visibilitychange(hidden)·pagehide 저장을 설치한다', () => {
    expect(readFileSync('src/main.tsx', 'utf-8')).toContain('installSuspendSave()');
    const store = readFileSync('src/ui/store.ts', 'utf-8');
    expect(store).toMatch(/visibilitychange[\s\S]{0,120}hidden[\s\S]{0,40}saveOnSuspend/);
    expect(store).toMatch(/pagehide[\s\S]{0,40}saveOnSuspend/);
  });
});

describe('QA-DEV-05 글꼴 라이선스', () => {
  it('정보·라이선스 화면에 글꼴 3종의 OFL 전문이 들어 있다', async () => {
    const { FONT_LICENSES } = await import('../src/ui/components/About');
    expect(FONT_LICENSES.length).toBe(3);
    for (const f of FONT_LICENSES) expect(f.text).toContain('SIL Open Font License');
  });
  it('설정 화면에 "정보 · 라이선스" 버튼이 있다', () => {
    expect(readFileSync('src/ui/screens/Settings.tsx', 'utf-8')).toContain('정보 · 라이선스');
  });
  it('빌드가 assets/fonts/LICENSE-*.txt 를 dist/licenses/ 로 복사한다', () => {
    const cfg = readFileSync('vite.config.ts', 'utf-8');
    expect(cfg).toContain('copyLicenses()');
    expect(cfg).toMatch(/dist\/licenses/);
  });
});

describe('QA-DEV-01 폰 빌드', () => {
  it('Capacitor 설정이 Vite 빌드(dist)를 감싸고, 안드로이드 프로젝트가 저장소에 있다', () => {
    const cap = JSON.parse(readFileSync('capacitor.config.json', 'utf-8'));
    expect(cap.webDir).toBe('dist');
    expect(cap.appId).toBeTruthy();
    expect(readFileSync('android/app/src/main/AndroidManifest.xml', 'utf-8')).toContain('MainActivity');
  });
  it('명령 하나로 APK/AAB 를 만드는 스크립트가 있다', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf-8'));
    expect(pkg.scripts['android:apk']).toContain('mobile-build.mjs apk');
    expect(pkg.scripts['android:aab']).toContain('mobile-build.mjs aab');
    expect(pkg.scripts['ios:sync']).toContain('cap sync ios');
    expect(readFileSync('scripts/mobile-build.mjs', 'utf-8')).toMatch(/assembleDebug[\s\S]*bundleRelease|bundleRelease[\s\S]*assembleDebug/);
  });
  it('홈 화면에 추가할 수 있는 PWA manifest 가 있다 (가로 고정)', () => {
    const m = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf-8'));
    expect(m.orientation).toBe('landscape');
    expect(m.icons.length).toBeGreaterThan(0);
    expect(readFileSync('index.html', 'utf-8')).toContain('rel="manifest"');
  });
});

describe('QA-DSN-02 군주 카드 체급 단어', () => {
  it('체급은 강국/중견/약소로 쓰고 난이도 단어(쉬움/보통/어려움)를 쓰지 않는다', async () => {
    const { tierOf } = await import('../src/ui/screens/NewGame');
    const words = Array.from({ length: 9 }, (_, i) => tierOf(i, 9));
    expect(new Set(words)).toEqual(new Set(['강국', '중견', '약소']));
    const src = readFileSync('src/ui/screens/NewGame.tsx', 'utf-8');
    expect(src).not.toMatch(/'쉬움'|'어려움'/);
    expect(src).toContain('게임 난이도');
  });
});

describe('QA-DEV-07 노치·가로 고정', () => {
  it('viewport-fit=cover, 세로 안내, 안드로이드 가로 고정', () => {
    const html = readFileSync('index.html', 'utf-8');
    expect(html).toMatch(/name="viewport"[^>]*viewport-fit=cover/);
    expect(html).toContain('가로로 돌려 주세요');
    expect(readFileSync('src/ui/style.css', 'utf-8')).toMatch(/@media \(orientation: portrait\) and \(pointer: coarse\)[\s\S]{0,200}#rotate-hint/);
    expect(readFileSync('android/app/src/main/AndroidManifest.xml', 'utf-8')).toContain('android:screenOrientation="sensorLandscape"');
    expect(readFileSync('src/platform/index.ts', 'utf-8')).toContain("ScreenOrientation.lock({ orientation: 'landscape' })");
  });
});

describe('QA-DEV-08 종료 버튼·뒤로 가기', () => {
  const G = globalThis as Record<string, unknown>;
  it('종료 버튼은 PC·안드로이드에서만 보이고, 웹·iOS 에서는 숨긴다', async () => {
    const { canQuit } = await import('../src/platform');
    expect(canQuit()).toBe(false); // 웹
    G.saveApi = {};
    expect(canQuit()).toBe(true); // Electron
    delete G.saveApi;
    G.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android' };
    expect(canQuit()).toBe(true);
    G.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios' };
    expect(canQuit()).toBe(false);
    delete G.Capacitor;
    expect(readFileSync('src/ui/screens/Title.tsx', 'utf-8')).not.toContain('window.close()');
  });
  it('뒤로 가기: 창 닫기 → 한 단계 뒤로 → 타이틀에서만 종료', async () => {
    const { useStore, handleBack } = await import('../src/ui/store');
    useStore.setState({ screen: 'lord', overlay: { kind: 'settings' } });
    expect(handleBack()).toBe(true);
    expect(useStore.getState().overlay).toBeNull();
    expect(handleBack()).toBe(true);
    expect(useStore.getState().screen).toBe('newgame');
    handleBack();
    expect(useStore.getState().screen).toBe('title');
    expect(handleBack()).toBe(false);
    expect(readFileSync('src/main.tsx', 'utf-8')).toContain('onBackButton(handleBack)');
  });
});

describe('QA-DEV-09 되돌릴 수 없는 행동 확인창', () => {
  it('확인창은 물러서기·실행 두 버튼을 보여 준다', async () => {
    const { ConfirmModal } = await import('../src/ui/components/Confirm');
    const { createElement } = await import('react');
    const html = renderToStaticMarkup(createElement(ConfirmModal, { kind: 'quit', onCancel: () => {}, onOk: () => {} }));
    expect(html).toContain('타이틀로 나갈까요?');
    expect(html).toContain('계속하기');
  });
  it('설정의 "타이틀로"는 바로 나가지 않고 확인창을 연다', () => {
    const src = readFileSync('src/ui/screens/Settings.tsx', 'utf-8');
    expect(src).not.toMatch(/onClick=\{quitToTitle\}/);
    expect(src).toMatch(/<ConfirmModal\s+kind="quit"/);
    expect(src).toContain("label: '저장하고 나가기'");
  });
  it('저장된 칸에 저장하면 덮어쓰기 확인창을 거친다 (빈 칸은 바로 저장)', () => {
    const src = readFileSync('src/ui/components/SaveLoad.tsx', 'utf-8');
    expect(src).toMatch(/r\.meta \? setAsk\(r\) : save\(r\.slot\)/);
    expect(src).toContain('kind="overwrite"');
    expect(src).toContain('도시 ${ask.meta.cities}'); // 지워질 저장 요약
  });
});

describe('QA-DEV-10 버전 표기', () => {
  it('타이틀은 빌드 때 주입한 package.json 버전을 쓴다', () => {
    const title = readFileSync('src/ui/screens/Title.tsx', 'utf-8');
    expect(title).not.toMatch(/v0\.1\b/);
    expect(title).toContain('APP_VERSION');
    expect(readFileSync('vite.config.ts', 'utf-8')).toMatch(/__APP_VERSION__: JSON\.stringify\(pkg\.version\)/);
  });
});

describe('QA-DEV-02 오류 화면 스타일', () => {
  it('오류 화면 스타일이 style.css 에 있다 (상자가 가운데, 버튼 44px)', () => {
    const css = readFileSync('src/ui/style.css', 'utf-8');
    expect(css).toMatch(/\.err-screen \{[^}]*place-items: center/);
    expect(css).toMatch(/\.err-box \.btn \{ min-height: 44px/);
  });
});

describe('QA-DSN-01 세력 색 (design/세력색_v0.3.md)', () => {
  it('모든 시나리오의 모든 세력이 전용 색·무늬를 갖고, 같은 시나리오 안에서 색이 겹치지 않는다', async () => {
    const { loadGameData } = await import('../src/data/gameData');
    const theme = await import('../src/ui/theme');
    const css = readFileSync('src/ui/tokens.css', 'utf-8');
    const val = (t: string) => css.match(new RegExp(t + ': *(#[0-9a-fA-F]{6})'))?.[1]?.toLowerCase();
    for (const sc of loadGameData().scenarios) {
      const seen = new Map<string, string>();
      for (const f of sc.factions) {
        expect(theme.isUnmappedFaction(f.id), `${sc.id} ${f.id}`).toBe(false);
        const st = theme.factionStyle(f.id);
        expect(st.pattern).not.toBe('none');
        const hex = val(st.token);
        expect(hex, `${f.id} ${st.token}`).toBeTruthy();
        expect(seen.has(hex!), `${sc.id}: ${f.id} 와 ${seen.get(hex!)} 같은 색`).toBe(false);
        seen.set(hex!, f.id);
      }
    }
    expect(val('--f-lijue')).not.toBe(val('--f-dong'));
  });
});

describe('QA-DSN-05 타이틀 주 버튼', () => {
  it('세이브가 없으면 이어하기를 숨기고 새 게임을 주 버튼으로 둔다', () => {
    const src = readFileSync('src/ui/screens/Title.tsx', 'utf-8');
    expect(src).toMatch(/\{last && \(\s*<Btn\s+kind="primary"/);
    expect(src).toContain("kind={last ? undefined : 'primary'}");
  });
});

describe('폰 웹앱(PWA) 설치', () => {
  it('설치 안내 페이지·오프라인 캐시·홈 화면 아이콘 설정이 있다', () => {
    const page = readFileSync('public/install.html', 'utf-8');
    expect(page).toContain('beforeinstallprompt'); // 안드로이드 설치 버튼
    expect(page).toContain('홈 화면에 추가'); // 아이폰 안내
    expect(page).toContain('KAKAOTALK'); // 메신저 안 브라우저 → 기본 브라우저
    expect(readFileSync('public/sw.js', 'utf-8')).toContain("addEventListener('fetch'");
    const html = readFileSync('index.html', 'utf-8');
    expect(html).toContain('apple-touch-icon');
    expect(readFileSync('src/main.tsx', 'utf-8')).toContain('installWebApp()');
    expect(readFileSync('src/platform/index.ts', 'utf-8')).toMatch(/location\.protocol !== 'https:'/); // Electron·개발 서버에서는 끔
  });
});

describe('설정 › 소리: 배경음·효과음 크기 분리 (QA-DSN-06)', () => {
  it('효과음 크기를 저장하고 0~1로 제한한다', async () => {
    const snd = await import('../src/ui/sound');
    expect(snd.getSfxVolume()).toBeCloseTo(0.85);
    snd.setSfxVolume(1.7);
    expect(snd.getSfxVolume()).toBe(1);
    expect(localStorage.getItem('samgukji.sfxVol')).toBe('1');
    snd.setSfxVolume(0.85);
  });
  it('소리 탭에 배경음 크기·효과음 크기 막대가 있다', () => {
    const src = readFileSync('src/ui/screens/Settings.tsx', 'utf-8');
    expect(src).toContain("['배경음', !bgmMuted");
    expect(src).toContain("['효과음', !s.muted");
    expect(src).toContain('aria-label={`${name} 크기`}');
  });
});
