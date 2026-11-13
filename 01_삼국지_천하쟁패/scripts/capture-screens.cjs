// 화면 캡처 도구 (QA·보고용): 개발 서버(vite)에 붙어 각 화면을 순서대로 띄우고 PNG로 저장한다.
// 사용: dev 서버를 켠 뒤  npx electron scripts/capture-screens.cjs
//   URL (기본 http://localhost:5174), W×H (기본 1688×780 = 논리 844×390의 2배) 환경변수로 바꿀 수 있다.
// 게임 엔진은 건드리지 않고, 개발 모드 전용 window.__store 로 화면만 전환한다.
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const URL_ = process.env.URL || 'http://localhost:5174';
const W = Number(process.env.W || 1688);
const H = Number(process.env.H || 780);
const OUT = path.join(__dirname, '..', 'design', 'screenshots', process.env.TAG || `${W}x${H}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({
    width: W,
    height: H,
    useContentSize: true,
    resizable: false,
    show: true,
    webPreferences: { preload: path.join(__dirname, '..', 'electron', 'preload.cjs'), contextIsolation: true },
  });
  await win.loadURL(URL_);
  const js = (code) => win.webContents.executeJavaScript(`(async () => { ${code} })()`);
  const shot = async (name, ms = 900) => {
    await wait(ms);
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(OUT, `${name}.png`), img.toPNG());
    console.log('saved', name);
  };
  for (let i = 0; i < 50 && !(await js('return !!window.__store')); i++) await wait(200);
  await js(`
    window.__btn = (t) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim().includes(t));
    window.__click = (t) => window.__btn(t)?.click();
    window.__S = () => window.__store.getState();
    const m = await import('/src/ui/settings.ts');
    window.__set = m.useSettings.getState().set;
    window.__set('colorBlind', false); window.__set('fontSize', 'normal');
  `);

  await shot('S01_title', 1500);
  await js(`__S().go('newgame')`);
  await shot('S02_scenario', 1500);
  await js(`__S().pickScenario('s194')`);
  await shot('S03_lord');
  await js(`__S().newGame('s194', 'liu_bei', true, 'normal')`);
  const hasEvent = await js(`return __S().g.s.messages.some((m) => m.kind === 'event')`);
  if (hasEvent) await shot('S11_event', 1500);
  await js(`const g = __S().g; g.s.messages = g.s.messages.filter((m) => m.kind !== 'event'); __S().bump();`);
  await js(`__S().selectCity(null)`);
  await shot('S04_map', 1500);
  const cap = await js(`const g = __S().g; return g.s.officers[g.s.factions[g.s.playerFaction].ruler].city`);
  await js(`__S().focusCity(${JSON.stringify(cap)})`);
  await shot('S05_city_sheet', 1200);
  await js(`document.querySelector('.cmd')?.click()`);
  await shot('S06_command_pick');
  await js(`__S().selectCity(null)`);
  await js(`__S().endTurn()`);
  await wait(2500);
  for (let i = 0; i < 5 && (await js('return !!__S().incoming')); i++) {
    if (i === 0) await shot('S07b_incoming', 300);
    await js(`__S().commandIncoming(false)`);
    await wait(800);
  }
  if (await js(`return !!__S().report`)) await shot('S07_turn_report', 300);
  await js(`__S().closeReport(); const g = __S().g; g.s.messages = g.s.messages.filter((m) => m.kind !== 'event'); g.s.proposals = []; __S().bump();`);

  await js(`__S().open({ kind: 'officers' })`);
  await shot('S08_officer_list');
  await js(`__S().open({ kind: 'officer', id: 'guan_yu' })`);
  await shot('S09_officer_detail', 1200);
  await js(`__S().open({ kind: 'diplomacy' })`);
  await shot('S10_diplomacy');
  await js(`__S().open({ kind: 'chronicle' })`);
  await shot('S16_chronicle');
  await js(`__S().open({ kind: 'settings' })`);
  await shot('S17_settings');
  await js(`__S().open({ kind: 'factions' })`);
  await shot('S04b_factions');
  await js(`__S().open(null)`);

  // 밝은 세력색(원술 노랑) 위 글자 + 색약 모드
  const ysCity = await js(`return Object.values(__S().g.s.cities).find((c) => c.faction === 'yuan_shu')?.id ?? null`);
  await js(`__set('colorBlind', true)`);
  if (ysCity) await js(`__S().focusCity(${JSON.stringify(ysCity)})`);
  await shot('A1_colorblind_yuanshu', 1500);
  await js(`__set('fontSize', 'large')`);
  await shot('A2_font_large', 900);
  await js(`__set('colorBlind', false); __set('fontSize', 'normal'); __S().selectCity(null)`);

  // 전투
  const started = await js(`
    const st = __S(); const g = st.g; const pf = g.s.playerFaction; let res = null;
    for (const c of Object.values(g.s.cities).filter((c) => c.faction === pf)) {
      for (const n of g.ix.adj.get(c.id) || []) { const t = g.s.cities[n.to]; if (t && t.faction && t.faction !== pf) { res = { from: c.id, to: t.id }; break; } }
      if (res) break;
    }
    if (!res) return false;
    const offs = Object.values(g.s.officers).filter((o) => o.faction === pf && o.status === 'serving').slice(0, 3);
    st.attack({ id: 'cap', attacker: pf, defender: g.s.cities[res.to].faction, from: res.from, city: res.to, units: offs.map((o) => ({ officer: o.id, troops: 5000 })), food: 20000 }, {});
    return __S().screen === 'battle';
  `);
  if (started) {
    // 전투개편 1단계: 작전 회의 → 관전 → 결과 보고서
    await shot('B1_war_council', 1200);
    await js(`__click('학익 포위')`);
    await js(`document.querySelector('.council-unit')?.click()`);
    await shot('B2_unit_setting', 500);
    await js(`__click('확인')`);
    await js(`__click('작전 확정 · 관전')`);
    await shot('B3_confirm', 400);
    await js(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '확정 · 관전')?.click()`);
    await wait(6000);
    await js(`document.querySelector('.ucell')?.click()`);
    await shot('B4_spectate', 600);
    await js(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '결과만 보기')?.click()`);
    await shot('B5_report', 1200);
  }
  app.quit();
});
