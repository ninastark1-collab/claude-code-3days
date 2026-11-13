// 충차대·농성 배치 확인 캡처: dev 서버(5174) 켠 뒤  npx electron scripts/capture-ram.cjs → design/screenshots/3d/ram_*.png
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const OUT = path.join(__dirname, '..', 'design', 'screenshots', '3d');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const win = new BrowserWindow({ width: 1688, height: 780, useContentSize: true, show: true });
  await win.loadURL('http://localhost:5174');
  const js = (code) => win.webContents.executeJavaScript(`(async () => { ${code} })()`);
  for (let i = 0; i < 50 && !(await js('return !!window.__store')); i++) await wait(200);
  await js(`
    const st = window.__store; st.getState().newGame('s194','cao',true,'normal'); await new Promise(r=>setTimeout(r,1200));
    const g = st.getState().g; g.s.messages=[]; g.s.cities.chenliu.food = 99999;
    const offs = Object.values(g.s.officers).filter(o=>o.faction==='cao'&&o.status==='serving'&&o.city==='chenliu'&&o.troops>0).slice(0,5);
    st.getState().attack({ id:'cap', attacker:'cao', defender: g.s.cities.puyang.faction, from:'chenliu', city:'puyang', units: offs.map(o=>({officer:o.id, troops:o.troops})), food: 40000 }, {});
    await new Promise(r=>setTimeout(r,600));
    const A = await import('/src/engine/battle/auto.ts'); const P = await import('/src/engine/battle/plan.ts');
    const b = st.getState().battle; A.setPlan(b, 'def', P.defaultPlan(b, 'def', 'def_hold')); st.getState().bump();
    await new Promise(r=>setTimeout(r,300));
    [...document.querySelectorAll('button')].find(x=>x.textContent.includes('작전 확정'))?.click(); await new Promise(r=>setTimeout(r,300));
    [...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='확정 · 관전')?.click(); await new Promise(r=>setTimeout(r,500));
    [...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='4배')?.click();`);
  for (const [name, ms] of [['ram_1_march', 3500], ['ram_2_gate', 22000]]) {
    await wait(ms);
    fs.writeFileSync(path.join(OUT, `${name}.png`), (await win.webContents.capturePage()).toPNG());
    console.log('saved', name, await js('const b = window.__store.getState().battle; const r = b.units.find(u=>u.ram); return r && (r.name + " " + r.x + "," + r.y + " " + r.order.type + " tick " + b.tick)'));
  }
  app.quit();
});
