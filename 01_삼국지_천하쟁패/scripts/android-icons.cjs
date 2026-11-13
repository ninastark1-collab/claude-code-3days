// 안드로이드 런처 아이콘: build/icon.png(512) → mipmap-*/ic_launcher*.png
//   npx electron scripts/android-icons.cjs
// 적응형 아이콘(xml)은 지우고 일반 PNG 아이콘을 쓴다 (게임 아이콘 전체가 보이게)
const { app, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const RES = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');
const SIZES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
app.whenReady().then(() => {
  const src = nativeImage.createFromPath(path.join(__dirname, '..', 'build', 'icon.png'));
  for (const [d, px] of Object.entries(SIZES)) {
    const png = src.resize({ width: px, height: px, quality: 'best' }).toPNG();
    for (const n of ['ic_launcher.png', 'ic_launcher_round.png']) fs.writeFileSync(path.join(RES, `mipmap-${d}`, n), png);
  }
  fs.rmSync(path.join(RES, 'mipmap-anydpi-v26'), { recursive: true, force: true });
  console.log('icons ok');
  app.quit();
});
