// 3D 단계별 화면 캡처: dev 서버(5174)를 켠 뒤  npx electron scripts/capture-3d.cjs
// 결과: design/screenshots/3d/<단계>_*.png (논리 844×390 의 2배)
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const URL_ = (process.env.URL || 'http://localhost:5174') + '/#scene3d';
const W = 1688;
const H = 780;
const OUT = path.join(__dirname, '..', 'design', 'screenshots', '3d');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({ width: W, height: H, useContentSize: true, resizable: false, show: true, webPreferences: { contextIsolation: true } });
  await win.loadURL(URL_);
  const js = (code) => win.webContents.executeJavaScript(`(async () => { ${code} })()`);
  const shot = async (name, ms = 1500) => {
    await wait(ms);
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(OUT, `${name}.png`), img.toPNG());
    console.log('saved', name);
  };
  const click = (t) => js(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${JSON.stringify(t)})?.click()`);
  const STEP = process.env.STEP || 'all';
  const fps = async () => {
    await js('window.__world.onStats = (s) => (window.__st = s)');
    await wait(2200);
    return js('return window.__st && `${window.__st.fps} fps · 그리기 ${window.__st.calls} · 삼각형 ${Math.round(window.__st.triangles / 1000)}k · 배율 ${window.__st.pixelRatio.toFixed(2)} · 화질 ${window.__world.quality}`');
  };
  if (STEP === 'all' || STEP === '2') {
    // 2단계: 실제 엔진 전투 재생 (194년 조조군 → 복양 여포군)
    for (let i = 0; i < 50 && !(await js('return !!window.__store')); i++) await wait(200);
    await js(`
      const st0 = window.__store.getState(); st0.newGame('s194', 'cao', true, 'normal'); const g = window.__store.getState().g; g.s.messages = [];
      const offs = Object.values(g.s.officers).filter((o) => o.faction === 'cao' && o.status === 'serving' && o.city === 'chenliu' && o.troops > 0).slice(0, 5);
      window.__store.getState().attack({ id: 'cap3d', attacker: 'cao', defender: g.s.cities.puyang.faction, from: 'chenliu', city: 'puyang', units: offs.map((o) => ({ officer: o.id, troops: o.troops })), food: 40000 }, {});`);
    await wait(500);
    await js(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim().includes('작전 확정'))?.click()`);
    await wait(300);
    await click('확정 · 관전');
    await shot('S2_battle_deploy', 2500);
    console.log('fps(deploy)', await fps());
    await click('4배');
    await shot('S2_battle_march', 6000);
    // 일기토 장면이 뜨면 넘긴다
    for (let i = 0; i < 25; i++) {
      await wait(1000);
      await js(`document.querySelector('.duel-scene button')?.click()`);
    }
    await shot('S2_battle_melee', 500);
    console.log('fps(melee)', await fps());
    await js(`window.__world.cam.set(window.__world.cam.T.x, 0, window.__world.cam.T.z, 0.4, 0.5, 28)`);
    await shot('S2_battle_close', 2500);
    // 같은 전투를 보통·절약 화질로 다시 열어 예산 확인 (?q= 로 화질 강제)
    for (const q of ['normal', 'saver']) {
      await win.loadURL((process.env.URL || 'http://localhost:5174') + '/?q=' + q + '#scene3d');
      for (let i = 0; i < 50 && !(await js('return !!window.__store')); i++) await wait(200);
      await js(`
        const st0 = window.__store.getState(); st0.newGame('s194', 'cao', true, 'normal'); const g = window.__store.getState().g; g.s.messages = [];
        const offs = Object.values(g.s.officers).filter((o) => o.faction === 'cao' && o.status === 'serving' && o.city === 'chenliu' && o.troops > 0).slice(0, 5);
        window.__store.getState().attack({ id: 'cap3d', attacker: 'cao', defender: g.s.cities.puyang.faction, from: 'chenliu', city: 'puyang', units: offs.map((o) => ({ officer: o.id, troops: o.troops })), food: 40000 }, {});`);
      await wait(500);
      await js(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim().includes('작전 확정'))?.click()`);
      await wait(300);
      await click('확정 · 관전');
      await wait(2500);
      console.log('fps(' + q + ')', await fps());
      if (q === 'saver') await shot('S2_battle_saver', 200);
    }
    if (STEP === '2') return app.quit();
  }
  if (STEP === '6') {
    await win.loadURL(URL_);
    for (let i = 0; i < 50 && !(await js('return !!window.__store')); i++) await wait(200);
    await js(`const st0 = window.__store.getState(); st0.newGame('s194', 'cao', true, 'normal'); const g = window.__store.getState().g; g.s.messages = []; window.__store.getState().open({ kind: 'city3d', id: 'chenliu' });`);
    await shot('S6_city', 5000);
    console.log('fps(city)', await fps());
    const card = (t) => js(`[...document.querySelectorAll('.c-cards button')].find((b) => b.textContent.includes(${JSON.stringify(t)}))?.click()`);
    await card('개간');
    await shot('S6_city_farm', 2600);
    await card('징병');
    await shot('S6_city_conscript', 3500);
    await card('상업');
    await shot('S6_city_market', 2600);
    return app.quit();
  }
  if (STEP === '5') {
    await win.loadURL(URL_);
    for (let i = 0; i < 50 && !(await js('return !!window.__store')); i++) await wait(200);
    await js(`const st0 = window.__store.getState(); st0.newGame('s194', 'cao', true, 'normal'); const g = window.__store.getState().g; g.s.messages = []; window.__store.getState().bump();`);
    await shot('S5_map', 5000);
    console.log('fps(map)', await fps());
    await js(`window.__store.getState().focusCity('xiapi')`);
    await shot('S5_map_sheet', 3000);
    return app.quit();
  }
  if (STEP === '4') {
    const start = async (code) => {
      await win.loadURL(URL_);
      for (let i = 0; i < 50 && !(await js('return !!window.__store')); i++) await wait(200);
      await js(code);
      await wait(500);
      await js(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim().includes('작전 확정'))?.click()`);
      await wait(300);
      await click('확정 · 관전');
      await wait(1500);
      await click('4배');
    };
    // 일기토: 관우·장비를 조조군으로 옮겨 여포가 있는 복양을 친다 (연의 매치업)
    await start(`
      const st0 = window.__store.getState(); st0.newGame('s194', 'cao', true, 'normal'); const g = window.__store.getState().g; g.s.messages = [];
      for (const id of ['guan_yu', 'zhang_fei']) { const o = g.s.officers[id]; o.faction = 'cao'; o.city = 'chenliu'; o.status = 'serving'; o.troops = 8000; }
      window.__store.getState().attack({ id: 'd3', attacker: 'cao', defender: g.s.cities.puyang.faction, from: 'chenliu', city: 'puyang', units: [{ officer: 'guan_yu', troops: 8000 }, { officer: 'zhang_fei', troops: 8000 }, { officer: 'cao_cao', troops: 12000 }], food: 40000 }, {});`);
    // 공격군을 다리 줄 서쪽에 세워 다리로 건너게 한다 (엔진 길찾기는 다리가 싸다)
    await js(`const b = window.__store.getState().battle; const br = b.tiles.findIndex((t) => t.t === 'bridge'); const by = Math.floor(br / b.w); let k = 0; for (const u of b.units.filter((u) => u.side === 'atk' && u.status === 'active')) { u.x = 3 + (k % 2); u.y = Math.max(0, Math.min(b.h - 1, by + (k >> 1) - 1)); u.anchor = { x: u.x, y: u.y }; k++; }`);
    // 다리 건너기 → 대열 교전 → 일기토 무대 순서로 찍는다
    const got = { bridge: false, melee: false, cut: false, vs: false, r1: false, r2: false, win: false, back: false };
    for (let i = 0; i < 400 && !got.back; i++) {
      await wait(200);
      const st = await js(`
        const b = window.__store.getState().battle; if (!b) return {};
        const onBridge = b.units.find((u) => u.status === 'active' && b.tiles[u.y * b.w + u.x]?.t === 'bridge');
        const r = document.querySelector('.d3-round')?.textContent || '';
        return { bridge: onBridge ? [onBridge.x, onBridge.y] : null, cut: !!document.querySelector('.duel3d .cut3d'), stage: !!document.querySelector('.duel3d-stage'), vs: !!document.querySelector('.d3-vs'), round: r, win: !!document.querySelector('.d3-act.win'), result: !!document.querySelector('.duel3d-result'), melee: b.units.some((u) => u.status === 'active' && u.order.type === 'attack') && b.tick > 20 };`);
      if (st.bridge && !got.bridge) { got.bridge = true; await js(`const c = window.__world.cam; const [x, z] = [(${st.bridge[0]} + 0.5 - 12) * 4, (${st.bridge[1]} + 0.5 - 8) * 4]; c.set(x, 0, z, 0.35, 0.55, 22); c.hold = 3`); await shot('S8_bridge', 1500); }
      if (st.melee && !got.melee && !st.stage && !st.cut && got.bridge) {
        got.melee = true;
        await js(`const b = window.__store.getState().battle; const u = b.units.find((u) => u.status === 'active' && u.order.type === 'attack' && u.side === 'atk'); const t = b.units.find((x) => x.id === u.order.target) || u; const c = window.__world.cam; c.set(((u.x + t.x) / 2 + 0.5 - 12) * 4, 0, ((u.y + t.y) / 2 + 0.5 - 8) * 4, 0.45, 0.62, 26); c.hold = 4`);
        await shot('S8_melee', 2200);
      }
      if (st.cut && !got.cut) { got.cut = true; await shot('S8_duel_cutin', 200); }
      if (st.stage && st.vs && !got.vs) { got.vs = true; await shot('S8_duel_vs', 600); }
      if (st.round === '一合' && !got.r1) { got.r1 = true; await shot('S8_duel_pass', 900); }
      if (st.round === '二合' && !got.r2) { got.r2 = true; await shot('S8_duel_lock', 1000); }
      if (st.win && !got.win) { got.win = true; await shot('S8_duel_finish', 600); }
      if (st.result && !got.back) { got.back = true; await shot('S8_duel_back', 300); }
    }
    console.log('duel', JSON.stringify(got));
    // 공성: 수비군을 거의 없애 공격군이 바로 성을 치게 한다
    await start(`
      const st0 = window.__store.getState(); st0.newGame('s194', 'cao', true, 'normal'); const g = window.__store.getState().g; g.s.messages = [];
      g.s.cities.puyang.walls = 400;
      const offs = Object.values(g.s.officers).filter((o) => o.faction === 'cao' && o.status === 'serving' && o.city === 'chenliu' && o.troops > 0).slice(0, 5);
      window.__store.getState().attack({ id: 's3', attacker: 'cao', defender: g.s.cities.puyang.faction, from: 'chenliu', city: 'puyang', units: offs.map((o) => ({ officer: o.id, troops: o.troops })), food: 40000 }, {});`);
    // 수비군을 성 안으로 넣어 둔다 (들판에 적이 없으면 공격군이 성을 친다)
    await js(`const b = window.__store.getState().battle; let k = 0; for (const u of b.units.filter((u) => u.side === 'def' && u.status === 'active')) { const x = 17 + (k % 5), y = 6 + Math.floor(k / 5) * 2; u.x = x; u.y = y; u.anchor = { x, y }; k++; }`);
    let sieged = false;
    for (let i = 0; i < 160; i++) {
      await wait(500);
      const n = await js(`const b = window.__store.getState().battle; return b ? b.units.filter((u) => u.status === 'active' && u.order.type === 'siege').length : -1`);
      if (n > 0 && !sieged) { sieged = true; await js(`const c = window.__world.cam; c.set(14, 0, 0, 0.55, 0.55, 46); c.hold = 99`); await shot('S4_siege', 3500); }
      const broke = await js(`const b = window.__store.getState().battle; return b ? b.tiles.filter((t) => t.t === 'gate').length < 3 : false`);
      if (broke) { await shot('S4_gate_broken', 1200); break; }
      if (await js(`return !!window.__store.getState().battle?.result`)) break;
    }
    console.log('siege', sieged);
    return app.quit();
  }
  await win.loadURL(URL_);
  for (let i = 0; i < 50 && !(await js('return !!window.__world')); i++) await wait(200);
  const _unused = (t) => js(`[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === ${JSON.stringify(t)})?.click()`);
  await click('고급');
  await shot('S1_day', 2500);
  await js(`window.__world.cam.set(-8, 0, 4, 0.5, 0.45, 34)`);
  await shot('S1_day_close', 2000);
  await js(`window.__world.cam.set(0, 0, 0, 0.12, 0.62, 62)`);
  await click('노을');
  await shot('S1_dusk', 2500);
  await click('밤');
  await shot('S1_night', 2500);
  await click('낮');
  await click('비');
  await shot('S1_rain', 2500);
  await click('비');
  await click('절약');
  await shot('S1_saver', 3000);
  const stats = await js(`return document.querySelector('.hud3d-stats')?.textContent`);
  console.log('stats(saver)', stats);
  app.quit();
});
