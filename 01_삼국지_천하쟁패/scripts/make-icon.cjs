// 앱 아이콘 생성: Electron 오프스크린 렌더링으로 build/icon.png (512x512)을 만든다.
// 사용법: npx electron scripts/make-icon.cjs
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const html = `<!doctype html><html><body style="margin:0;background:transparent">
<div style="width:512px;height:512px;display:flex;align-items:center;justify-content:center">
  <div style="width:460px;height:460px;border-radius:96px;background:radial-gradient(circle at 35% 30%,#d14a35,#7a1810 70%);
    border:14px solid #e8c77a;box-sizing:border-box;display:flex;align-items:center;justify-content:center;
    box-shadow:inset 0 0 40px rgba(0,0,0,.45)">
    <span style="font-family:'Batang','Malgun Gothic',serif;font-size:300px;font-weight:bold;color:#f6e2b0;
      text-shadow:0 8px 0 #4a0d06;line-height:1">三</span>
  </div>
</div></body></html>`;

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 512, height: 512, show: false, transparent: true, frame: false, webPreferences: { offscreen: true } });
  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  await new Promise((r) => setTimeout(r, 500));
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 512, height: 512 });
  const out = path.join(__dirname, '..', 'build', 'icon.png');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, img.resize({ width: 512, height: 512 }).toPNG());
  console.log('wrote', out);
  app.quit();
});
