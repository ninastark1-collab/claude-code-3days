// Electron 메인 프로세스: 고정 크기 게임 창을 띄운다.
const { app, BrowserWindow, Menu, screen, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

// ───── 세이브 파일: %APPDATA%\삼국지 천하쟁패\saves\*.json ─────
const saveDir = () => path.join(app.getPath('userData'), 'saves');
// 슬롯 이름만 허용 (경로 조작 방지)
const safeName = (name) => {
  if (!/^[a-z0-9_-]{1,32}$/.test(String(name))) throw new Error('잘못된 세이브 이름');
  return path.join(saveDir(), `${name}.json`);
};
ipcMain.handle('save:dir', () => saveDir());
ipcMain.handle('save:read', (_e, name) => {
  const p = safeName(name);
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
});
ipcMain.handle('save:write', (_e, name, text) => {
  fs.mkdirSync(saveDir(), { recursive: true });
  const p = safeName(name);
  // 임시 파일에 다 쓴 뒤 이름을 바꿔 교체 → 저장 중 강제 종료돼도 기존 파일은 멀쩡함
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, String(text), 'utf8');
  fs.renameSync(tmp, p);
  return true;
});
ipcMain.handle('save:remove', (_e, name) => {
  const p = safeName(name);
  if (fs.existsSync(p)) fs.unlinkSync(p);
  return true;
});

const DEV_URL = process.env.VITE_DEV_SERVER_URL;

const BASE_W = 1280;
const BASE_H = 800;

function createWindow() {
  // 화면(작업 영역)이 1280x800보다 작으면 (예: 1080p 노트북 150% 배율) 게임 전체를 비율대로 축소
  const wa = screen.getPrimaryDisplay().workAreaSize;
  const scale = Math.min(1, (wa.width - 16) / BASE_W, (wa.height - 40) / BASE_H);
  const win = new BrowserWindow({
    width: Math.floor(BASE_W * scale),
    height: Math.floor(BASE_H * scale),
    useContentSize: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    title: '삼국지 천하쟁패',
    backgroundColor: '#1b1410',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      zoomFactor: scale,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });
  // 페이지 이동/새로고침 후에도 배율 유지
  win.webContents.on('did-finish-load', () => win.webContents.setZoomFactor(scale));

  Menu.setApplicationMenu(null);
  win.once('ready-to-show', () => win.show());

  // 점검용: SAMGUKJI_SMOKE=1 로 실행하면 세이브 파일 쓰기/읽기를 확인하고 결과를 userData/smoke.txt에 남긴 뒤 종료
  if (process.env.SAMGUKJI_SMOKE) {
    win.webContents.once('did-finish-load', async () => {
      const out = path.join(app.getPath('userData'), 'smoke.txt');
      try {
        const r = await win.webContents.executeJavaScript(
          `(async () => { await window.saveApi.write('smoke', '{"ok":1}'); const t = await window.saveApi.read('smoke'); await window.saveApi.remove('smoke'); return { t, dir: await window.saveApi.dir(), title: document.title, rendered: !!document.querySelector('.title-screen') }; })()`,
        );
        fs.writeFileSync(out, JSON.stringify(r));
      } catch (e) {
        fs.writeFileSync(out, 'ERROR ' + String(e));
      }
      app.quit();
    });
  }

  if (DEV_URL) {
    win.loadURL(DEV_URL);
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
