/**
 * 모바일 프로브 (폰 우선 검증). 설치된 Electron(크로미움)으로 폰 화면·터치·저사양 CPU를 흉내 내고,
 * 손가락 탭(터치 이벤트)만으로 게임을 돌아다니며 화면마다 검사한다. 마우스 클릭은 쓰지 않는다.
 *
 * 사용: npx electron qa/scripts/probe-mobile.cjs <빌드폴더|URL> [기기목록=all] [출력폴더]
 *   예: npx electron qa/scripts/probe-mobile.cjs "%LOCALAPPDATA%/Temp/samgukji-qa/snapshots/<시각>" all qa/results/<시각>
 *
 * 검사: 터치 영역 크기, 안전 영역, 실제 글자 크기, 잘림·넘침, 겹친 버튼, 마우스 올리기 전용 표현,
 *       첫 화면 시간, 턴 처리 시간, 지도·전투 프레임(저사양 CPU 배율), 긴 작업, 메모리,
 *       백그라운드 전환(자동 저장·전투 일시정지), 세로 화면, 새로고침 후 세이브 유지, 저장소 용량.
 * 결과: <출력>/probe-mobile.md + <출력>/mobile/<기기>/<단계>.png
 */
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const [target, devArg = 'all', outArg] = process.argv.slice(process.defaultApp ? 2 : 1).filter((a) => !a.startsWith('--'));
const OUT = path.resolve(outArg || process.env.QA_OUT || path.join('qa', 'results', 'adhoc'));
fs.mkdirSync(OUT, { recursive: true });

/** 가로 화면 기준 CSS 크기. cpu = 저사양 흉내 배율 (Chrome DevTools 기준 4배 ≈ 보급형 안드로이드) */
const DEVICES = [
  { id: 'iphone14', name: 'iPhone 14 (기준 844×390)', w: 844, h: 390, dpr: 3, cpu: 2, inset: 47, ua: 'ios' },
  { id: 'iphoneSE', name: 'iPhone SE (작은 화면 667×375)', w: 667, h: 375, dpr: 2, cpu: 3, inset: 0, ua: 'ios' },
  { id: 'galaxyA', name: '보급형 갤럭시 (740×360, CPU 4배 느림)', w: 740, h: 360, dpr: 3, cpu: 4, inset: 24, ua: 'android' },
  { id: 'pixel7', name: 'Pixel 7 (915×412)', w: 915, h: 412, dpr: 2.625, cpu: 2, inset: 24, ua: 'android' },
  { id: 'promax', name: 'iPhone Pro Max (932×430)', w: 932, h: 430, dpr: 3, cpu: 1, inset: 59, ua: 'ios' },
  { id: 'tablet', name: '태블릿 (1024×768)', w: 1024, h: 768, dpr: 2, cpu: 2, inset: 0, ua: 'ios' },
];
const UA = {
  ios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 14; SM-A145N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
};
const devices = devArg === 'all' ? DEVICES : DEVICES.filter((d) => devArg.split(',').includes(d.id));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ───────────── 보고서 ─────────────
const rows = [];
const add = (kind, id, sev, owner, msg, detail) => rows.push({ kind, id, sev: sev || '', owner: owner || '', msg, detail });
const pass = (id, msg) => add('PASS', id, '', '', msg);
const fail = (id, sev, owner, msg, detail) => add('FAIL', id, sev, owner, msg, detail);
const warn = (id, owner, msg, detail) => add('WARN', id, '', owner, msg, detail);
const info = (id, msg, detail) => add('INFO', id, '', '', msg, detail);
const skip = (id, msg) => add('SKIP', id, '', '', msg);
function writeReport(started) {
  const c = (k) => rows.filter((r) => r.kind === k).length;
  const order = { FAIL: 0, WARN: 1, SKIP: 2, INFO: 3, PASS: 4 };
  const sorted = rows.slice().sort((a, b) => order[a.kind] - order[b.kind]);
  const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const text = `# probe-mobile\n\n실행 시간 ${((Date.now() - started) / 1000).toFixed(1)}s · PASS ${c('PASS')} · FAIL ${c('FAIL')} · WARN ${c('WARN')} · SKIP ${c('SKIP')} · INFO ${c('INFO')}\n\n` +
    `> 에뮬레이션 결과다. 실제 폰(특히 iOS WKWebView·보급형 안드로이드)에서 플레이테스트 S9로 반드시 다시 확인한다.\n\n` +
    ['| 결과 | ID | 심각도 | 담당 | 내용 |', '|---|---|---|---|---|', ...sorted.map((r) => `| ${r.kind} | ${r.id} | ${r.sev} | ${r.owner} | ${esc(r.msg)} |`)].join('\n') +
    '\n\n## 상세\n\n' + sorted.filter((r) => r.detail).map((r) => `### ${r.kind} ${r.id}\n\n\`\`\`\n${r.detail}\n\`\`\``).join('\n\n') + '\n';
  fs.writeFileSync(path.join(OUT, 'probe-mobile.md'), text, 'utf8');
  console.log(`[probe-mobile] PASS ${c('PASS')} FAIL ${c('FAIL')} WARN ${c('WARN')} SKIP ${c('SKIP')} → ${path.join(OUT, 'probe-mobile.md')}`);
  return c('FAIL');
}

// ───────────── 페이지 안에서 돌리는 검사 ─────────────
/** 화면 하나 감사: 문자열로 넘겨 page 안에서 실행 */
const AUDIT = `(() => {
  const W = innerWidth, H = innerHeight;
  const vp = document.querySelector('.viewport');
  const scale = vp ? vp.getBoundingClientRect().width / (vp.offsetWidth || 1) : 1;
  const vis = (el) => { const s = getComputedStyle(el); if (s.visibility === 'hidden' || s.display === 'none' || +s.opacity === 0) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const label = (el) => (el.getAttribute('aria-label') || el.innerText || el.value || el.className || el.tagName).toString().trim().replace(/\\s+/g, ' ').slice(0, 24);
  const sel = 'button, [role=button], a[href], input, select, textarea, label, [tabindex]:not([tabindex="-1"]), .pick-row, .chip';
  const set = new Set([...document.querySelectorAll(sel)]);
  for (const el of document.querySelectorAll('body *')) { if (getComputedStyle(el).cursor === 'pointer' && !(el.parentElement && getComputedStyle(el.parentElement).cursor === 'pointer')) set.add(el); }
  // 클릭 가능한 요소 안에 또 클릭 가능한 요소가 있으면 바깥 것만 (행 전체가 눌리는 경우)
  let items = [...set].filter(vis).filter((el) => !(el.tagName === 'INPUT' && el.type === 'checkbox' && el.closest('.pick-row,label')));
  items = items.filter((el) => ![...set].some((o) => o !== el && o.contains(el) && vis(o)));
  const canvases = [...document.querySelectorAll('canvas')].filter(vis).map((c) => { const r = c.getBoundingClientRect(); return { cls: c.className, w: Math.round(r.width), h: Math.round(r.height) }; });
  const tgt = items.map((el) => { const r = el.getBoundingClientRect(); return { label: label(el), x: r.left, y: r.top, w: r.width, h: r.height, disabled: !!el.disabled }; });
  const small = tgt.filter((t) => Math.min(t.w, t.h) < 44 && !t.disabled);
  const offscreen = tgt.filter((t) => t.x + t.w < 1 || t.y + t.h < 1 || t.x > W - 1 || t.y > H - 1 || t.x < -1 || t.y < -1 || t.x + t.w > W + 1 || t.y + t.h > H + 1);
  const overlap = [];
  for (let i = 0; i < tgt.length && i < 250; i++) for (let j = i + 1; j < tgt.length && j < 250; j++) {
    const a = tgt[i], b = tgt[j];
    const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    if (ix > 2 && iy > 2) { const inside = (p, q) => p.x >= q.x - 1 && p.y >= q.y - 1 && p.x + p.w <= q.x + q.w + 1 && p.y + p.h <= q.y + q.h + 1; if (!inside(a, b) && !inside(b, a)) overlap.push(a.label + ' ↔ ' + b.label); }
  }
  const tight = [];
  for (let i = 0; i < tgt.length && i < 250; i++) for (let j = i + 1; j < tgt.length && j < 250; j++) {
    const a = tgt[i], b = tgt[j];
    const gx = Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w), gy = Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h);
    if (gx < 0 && gy >= 0 && gy < 4 || gy < 0 && gx >= 0 && gx < 4) if (Math.min(a.w, a.h, b.w, b.h) < 48) tight.push(a.label + ' | ' + b.label);
  }
  // 실제 글자 크기 (확대·축소 배율 반영)
  const texts = new Map();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let n; let textCount = 0;
  while ((n = walker.nextNode())) {
    const t = n.textContent.trim(); if (!t) continue;
    const el = n.parentElement; if (!el || !vis(el)) continue;
    textCount++;
    const px = parseFloat(getComputedStyle(el).fontSize) * scale;
    if (px < 11) texts.set(t.slice(0, 20), Math.round(px * 10) / 10);
  }
  // 잘린 글자 (줄임표 없이 넘침)
  const clipped = [];
  for (const el of document.querySelectorAll('body *')) {
    if (!vis(el) || !el.childNodes.length || ![...el.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim())) continue;
    const s = getComputedStyle(el);
    if ((el.scrollWidth > el.clientWidth + 1 && s.overflowX !== 'visible' && s.textOverflow !== 'ellipsis' && !/auto|scroll/.test(s.overflowX)) ||
        (el.scrollHeight > el.clientHeight + 2 && s.overflowY === 'hidden' && el.clientHeight > 0)) clipped.push(el.innerText.trim().slice(0, 24));
  }
  // 마우스 올리기 전용 표현
  let hoverRules = 0; const hoverSamples = [];
  for (const sh of document.styleSheets) { let rules; try { rules = sh.cssRules; } catch { continue; }
    for (const r of rules) { if (r.selectorText && r.selectorText.includes(':hover') && /display|visibility|opacity/.test(r.cssText)) { hoverRules++; if (hoverSamples.length < 8) hoverSamples.push(r.selectorText); } } }
  const titled = [...document.querySelectorAll('[title]')].filter(vis).map((e) => e.getAttribute('title')).slice(0, 10);
  const sa = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sa')) || 0;
  const edge = tgt.filter((t) => t.x < 16 || t.x + t.w > W - 16).map((t) => t.label);
  const body = getComputedStyle(document.body);
  return { W, H, scale: Math.round(scale * 1000) / 1000, nInteractive: tgt.length, small: small.map((t) => t.label + ' ' + Math.round(t.w) + '×' + Math.round(t.h)), offscreen: offscreen.map((t) => t.label + ' @' + Math.round(t.x) + ',' + Math.round(t.y)),
    overlap, tight: tight.slice(0, 20), smallText: [...texts].map(([t, px]) => t + ' (' + px + 'px)'), textCount, clipped: [...new Set(clipped)].slice(0, 20),
    hoverRules, hoverSamples, titled, sa, edge, canvases, pageOverflow: document.documentElement.scrollWidth > W + 1 || document.documentElement.scrollHeight > H + 1,
    meta: document.querySelector('meta[name=viewport]')?.content || '', touchAction: body.touchAction, userSelect: body.userSelect || body.webkitUserSelect,
    dom: document.getElementsByTagName('*').length, heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null,
    modal: !!document.querySelector('.modal, [role=dialog], .scrim'), title: document.title, bodyText: document.body.innerText.slice(0, 120).replace(/\\s+/g, ' ') };
})()`;

const FPS = (ms) => `new Promise((res) => { const t0 = performance.now(); let n = 0; const ft = []; let last = t0;
  const lt = []; let obs; try { obs = new PerformanceObserver((l) => lt.push(...l.getEntries().map((e) => e.duration))); obs.observe({ type: 'longtask', buffered: false }); } catch {}
  const f = (t) => { n++; ft.push(t - last); last = t; if (t - t0 < ${ms}) requestAnimationFrame(f); else { obs && obs.disconnect(); ft.sort((a, b) => a - b);
    res({ fps: Math.round(n / ((t - t0) / 1000)), p95: Math.round(ft[Math.floor(ft.length * 0.95)] || 0), longTasks: lt.length, longMs: Math.round(lt.reduce((a, b) => a + b, 0)) }); } };
  requestAnimationFrame(f); })`;

// ───────────── 기기 하나 돌리기 ─────────────
async function runDevice(dev, url) {
  const dir = path.join(OUT, 'mobile', dev.id);
  fs.mkdirSync(dir, { recursive: true });
  const win = new BrowserWindow({ show: false, width: dev.w, height: dev.h, useContentSize: true, webPreferences: { offscreen: true, backgroundThrottling: false, partition: `qa-${dev.id}-${Date.now()}` } }); // 기기마다 빈 저장소
  win.webContents.setFrameRate(60);
  const dbg = win.webContents.debugger;
  dbg.attach('1.3');
  // 주의: 페이지가 하나도 없을 때 보낸 CDP 명령은 응답이 오지 않는다 → 빈 페이지부터 연다
  await win.loadURL('data:text/html,<meta charset=utf-8>').catch(() => {});
  const send = (m, p = {}) => Promise.race([dbg.sendCommand(m, p), sleep(20000).then(() => { throw new Error(`CDP 응답 없음: ${m}`); })]);
  const consoleErrors = [];
  win.webContents.on('console-message', (_e, level, msg) => { if (level >= 3) consoleErrors.push(msg.slice(0, 200)); });
  win.webContents.on('render-process-gone', (_e, d) => consoleErrors.push('렌더러 종료: ' + d.reason));
  let curW = dev.w, curH = dev.h;
  const metrics = async (w, h, orient = 'landscapePrimary', angle = 90) => {
    curW = w; curH = h;
    win.setContentSize(w, h);
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: dev.dpr, mobile: true, screenOrientation: { type: orient, angle } });
  };
  await metrics(dev.w, dev.h);
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Emulation.setUserAgentOverride', { userAgent: UA[dev.ua], platform: dev.ua === 'ios' ? 'iPhone' : 'Linux armv8l' });
  try { await send('Emulation.setSafeAreaInsetsOverride', { insets: { left: dev.inset, right: dev.inset, top: 0, bottom: 0 } }); } catch { /* 구버전 크로미움 */ }
  await send('Emulation.setCPUThrottlingRate', { rate: dev.cpu });
  const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result.value;
  const shot = async (name) => { try { const img = await win.webContents.capturePage(); fs.writeFileSync(path.join(dir, `${name}.png`), img.toPNG()); } catch { /* 무시 */ } };
  const tap = async (x, y, holdMs = 70) => {
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, radiusX: 6, radiusY: 6, force: 1 }] });
    await sleep(holdMs);
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(250);
  };
  const drag = async (x1, y1, x2, y2, steps = 12) => {
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x1, y: y1 }] });
    for (let i = 1; i <= steps; i++) { await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x1 + ((x2 - x1) * i) / steps, y: y1 + ((y2 - y1) * i) / steps }] }); await sleep(16); }
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };
  /** 보이는 글자로 요소 찾기 (가장 작은 일치 요소). 정규식 문자열 가능 */
  const find = (pattern, scope = 'body') => ev(`(() => { const re = new RegExp(${JSON.stringify(pattern)});
    const els = [...document.querySelectorAll(${JSON.stringify(scope)} + ' *')].filter((e) => { const s = getComputedStyle(e); const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && re.test((e.innerText || '').trim()) && !e.disabled; });
    els.sort((a, b) => a.getBoundingClientRect().width * a.getBoundingClientRect().height - b.getBoundingClientRect().width * b.getBoundingClientRect().height);
    const e = els.find((x) => x.closest('button, [role=button], .pick-row, .chip, a, label, tr')) || els[0];
    if (!e) return null; const t = e.closest('button, [role=button], .pick-row, .chip, a, label, tr') || e; const r = t.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, text: (t.innerText || '').trim().slice(0, 30) }; })()`);
  const offView = (p) => p.x < 0 || p.y < 0 || p.x > curW || p.y > curH;
  /** 버튼 요소만 대상으로, 패턴 우선순위대로 찾기 (목록 문구가 '…시작'으로 끝나도 오인하지 않게) */
  const findButton = (patterns) => ev(`(() => { const pats = ${JSON.stringify(patterns)}.map((x) => new RegExp(x));
    const bs = [...document.querySelectorAll('button, [role=button]')].filter((e) => { const r = e.getBoundingClientRect(); const st = getComputedStyle(e); return r.width > 0 && r.height > 0 && !e.disabled && st.visibility !== 'hidden'; });
    for (const re of pats) { const e = bs.find((b) => re.test((b.innerText || '').trim())); if (e) { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, text: (e.innerText || '').trim().slice(0, 30) }; } }
    return null; })()`);
  const tapText = async (pattern, scope) => { const p = await find(pattern, scope); if (!p) return null; if (offView(p)) { fail(D('M3-누를수없음'), 'S1', '디자인', '"' + p.text + '" 버튼이 화면 밖(' + Math.round(p.x) + ',' + Math.round(p.y) + ')에 있어 손가락으로 누를 수 없음'); return null; } await tap(p.x, p.y); return p; };
  const waitFor = async (expr, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(expr)) return Date.now() - t0; await sleep(100); } return -1; };
  const dismiss = async (max = 10) => { let n = 0; for (; n < max; n++) { const p = (await find('^(확인|닫기|계속|위임 \\(자동 전투\\)|넘기기|건너뛰기)$', '.modal, [role=dialog], .scrim')) || (await find('^✕$', '.modal, [role=dialog], .scrim')); if (!p) break; await tap(p.x, p.y); await sleep(200); } return n; };
  const D = (id) => `${id} [${dev.id}]`;

  /** 감사 결과를 판정으로 바꾸기 */
  const judge = async (screen) => {
    console.log('  · ' + screen);
    const a = await ev(AUDIT);
    await shot(screen);
    if (!a) return skip(D(`M-${screen}`), '감사 실패');
    const tag = `${screen}`;
    if (a.small.length) {
      const tiny = a.small.filter((s) => { const m = s.match(/(\d+)×(\d+)$/); return m && Math.min(+m[1], +m[2]) < 36; });
      (tiny.length ? fail : (id, sev, own, msg, det) => warn(id, own, msg, det))(D(`M1-터치크기 ${tag}`), 'S2', '디자인', `44px 미만 터치 영역 ${a.small.length}개 (36px 미만 ${tiny.length}개, 배율 ${a.scale})`, a.small.join('\n'));
    } else pass(D(`M1-터치크기 ${tag}`), `터치 영역 ${a.nInteractive}개 모두 44px 이상 (배율 ${a.scale})`);
    if (a.overlap.length) fail(D(`M2-겹침 ${tag}`), 'S2', '디자인', `서로 겹친 터치 영역 ${a.overlap.length}쌍 — 손가락으로 원하는 걸 못 누름`, a.overlap.slice(0, 20).join('\n'));
    if (a.tight.length) warn(D(`M2-간격 ${tag}`), '디자인', `간격 4px 미만으로 붙은 작은 버튼 ${a.tight.length}쌍 (오터치)`, a.tight.join('\n'));
    if (a.offscreen.length) fail(D(`M3-화면밖 ${tag}`), 'S2', '디자인', `화면 밖으로 나간 조작 요소 ${a.offscreen.length}개`, a.offscreen.join('\n'));
    if (a.pageOverflow) fail(D(`M3-넘침 ${tag}`), 'S3', '디자인', '페이지가 화면보다 커서 스크롤/흔들림 발생');
    if (a.smallText.length) {
      const nine = a.smallText.filter((s) => parseFloat(s.match(/\(([\d.]+)px\)/)[1]) < 9);
      (nine.length ? fail : (id, sev, own, msg, det) => warn(id, own, msg, det))(D(`M4-글자 ${tag}`), 'S3', '디자인', `실제 11px 미만 글자 ${a.smallText.length}종 (9px 미만 ${nine.length}종)`, a.smallText.slice(0, 40).join('\n'));
    } else pass(D(`M4-글자 ${tag}`), `글자 ${a.textCount}개 모두 실제 11px 이상`);
    if (a.clipped.length) warn(D(`M5-잘림 ${tag}`), '디자인', `넘쳐서 잘린 글자 ${a.clipped.length}곳`, a.clipped.join('\n'));
    if (dev.inset && a.edge.length) warn(D(`M6-안전영역 ${tag}`), '디자인', `화면 가장자리 16px 안의 조작 요소 ${a.edge.length}개 — 노치·둥근 모서리에 가려질 수 있음`, a.edge.join('\n'));
    if (a.titled.length) warn(D(`M7-title ${tag}`), '디자인', `title 속성 툴팁 ${a.titled.length}개 — 터치에서는 안 보임`, a.titled.join('\n'));
    return a;
  };

  const t0 = Date.now();
  console.log('  · load ' + url);
  win.loadURL(url).catch((e) => console.log('  load err', e.message));
  const tTitle = await waitFor(`!!document.querySelector('button')`, 20000);
  const coldMs = Date.now() - t0;
  if (tTitle < 0) { fail(D('M0-실행'), 'S1', '개발', '20초 안에 첫 화면 버튼이 나타나지 않음', consoleErrors.join('\n')); await shot('00-blank'); win.destroy(); return; }
  coldMs > 3000 ? fail(D('M8-첫화면'), 'S3', '개발', `첫 화면까지 ${coldMs}ms (CPU ×${dev.cpu}, 목표 3초)`) : pass(D('M8-첫화면'), `첫 화면 ${coldMs}ms (CPU ×${dev.cpu})`);
  const title = await judge('01-title');
  if (dev.id === devices[0].id) {
    // 페이지 전역 설정 (한 번만)
    /viewport-fit=cover/.test(title.meta) ? pass('M6-viewport', title.meta) : fail('M6-viewport', 'S2', '개발', `meta viewport에 viewport-fit=cover 없음 → iOS에서 env(safe-area-inset-*)가 0이라 노치 대응이 동작하지 않음 (현재 "${title.meta}")`);
    /user-scalable=no|maximum-scale=1/.test(title.meta) ? pass('M6-zoom', '두 번 탭/핀치 페이지 확대 차단') : warn('M6-zoom', '개발', 'meta viewport에 확대 차단이 없음 — touch-action으로 막더라도 iOS Safari·일부 WebView는 두 번 탭 확대가 생길 수 있음');
    title.touchAction === 'none' || title.touchAction === 'manipulation' ? pass('M6-touch-action', `body touch-action: ${title.touchAction}`) : warn('M6-touch-action', '개발', `body touch-action: ${title.touchAction} — 당겨서 새로고침·확대 제스처 충돌 가능`);
    title.userSelect === 'none' ? pass('M6-select', '글자 선택(길게 누르기 돋보기) 차단') : warn('M6-select', '개발', '길게 누르면 글자 선택·돋보기가 뜸');
    title.hoverRules ? warn('M7-hover', '디자인', `:hover로만 보이거나 바뀌는 CSS 규칙 ${title.hoverRules}개 — 터치에서는 볼 수 없음`, title.hoverSamples.join('\n')) : pass('M7-hover', ':hover 전용 표시 규칙 없음');
  }

  // 새 게임 → (시나리오 → 군주 → 시작) : 화면 흐름이 바뀌어도 따라가도록 "앞으로 가는 버튼"을 찾아 최대 6단계 진행
  if (!(await tapText('^새 게임$'))) { fail(D('M0-흐름'), 'S1', '개발', '"새 게임"을 손가락으로 누를 수 없음'); win.destroy(); return; }
  await sleep(500);
  const ON_MAP = `!!document.querySelector('.endturn, [aria-label="다음 달"]') || /턴 종료/.test(document.body.innerText)`;
  let tStart = Date.now(); let stepNo = 0; let reached = false;
  for (; stepNo < 6; stepNo++) {
    if (await ev(ON_MAP)) { reached = true; break; }
    await judge(`02-newgame-${stepNo + 1}`);
    // 군주 고르는 화면이면 세력 하나를 먼저 고른다 ("…군" 으로 끝나는 카드/행)
    if (/군주|세력/.test(await ev(`document.body.innerText.slice(0, 400)`)) && stepNo > 0) { const c = await find('군$'); if (c) await tap(c.x, c.y); }
    const fwd = await findButton(['→\s*$', '시작\s*$', '(출사|결정|확인)\s*$']);
    if (!fwd) { fail(D('M0-흐름'), 'S1', '개발', `새 게임 ${stepNo + 1}번째 화면에서 앞으로 갈 버튼을 못 찾음`); await shot('02x-stuck'); win.destroy(); return; }
    if (offView(fwd)) { fail(D('M3-누를수없음'), 'S1', '디자인', `"${fwd.text}" 버튼이 화면 밖`); await shot('02x-offview'); win.destroy(); return; }
    if (/시작|출사/.test(fwd.text)) tStart = Date.now();
    await tap(fwd.x, fwd.y);
    await sleep(600);
  }
  const mapMs = reached ? 0 : await waitFor(ON_MAP, 30000);
  const startMs = Date.now() - tStart;
  if (mapMs < 0) { fail(D('M0-흐름'), 'S1', '개발', '시작 후 30초 안에 지도 화면이 안 나옴'); await shot('03-nomap'); win.destroy(); return; }
  info(D('M-흐름'), `새 게임 → 지도까지 ${stepNo}번 화면 넘김 (위시리스트: 3클릭 이내 명령)`);
  startMs > 3000 ? fail(D('M8-게임시작'), 'S3', '개발', `시작 → 지도 ${startMs}ms (CPU ×${dev.cpu}, 목표 3초, 로딩 표시 필요)`) : pass(D('M8-게임시작'), `시작 → 지도 ${startMs}ms`);
  await sleep(600);
  await shot('03-intro');
  await dismiss();
  const map = await judge('04-map');
  map.canvases.length ? info(D('M-지도'), `지도 캔버스 ${map.canvases.map((c) => c.cls + ' ' + c.w + '×' + c.h).join(', ')}`) : warn(D('M-지도'), '개발', '지도 캔버스를 찾지 못함 (DOM 지도?)');

  // 성능: 가만히 / 드래그 중
  const idle = await ev(FPS(3000));
  info(D('M9-대기프레임'), `지도 가만히 3초: ${idle.fps}fps · 긴 작업 ${idle.longTasks}회 — 아무것도 안 할 때 계속 그리면 배터리 소모`);
  const drawing = idle.fps >= 50;
  if (drawing) warn(D('M9-대기프레임'), '개발', `아무 조작 없는데 ${idle.fps}fps로 계속 그림 → 폰 배터리·발열 (변화 있을 때만 그리기 권장)`);
  const cx = dev.w / 2, cy = dev.h / 2;
  const fpsP = ev(FPS(2500));
  await drag(cx - 120, cy, cx + 120, cy + 40, 40); await drag(cx + 100, cy + 30, cx - 100, cy - 30, 40);
  const pan = await fpsP;
  pan.fps < 30 ? fail(D('M9-지도드래그'), 'S2', '개발', `지도 끌기 중 ${pan.fps}fps (CPU ×${dev.cpu}, 목표 30 이상) p95 ${pan.p95}ms`) : pass(D('M9-지도드래그'), `지도 끌기 ${pan.fps}fps · p95 ${pan.p95}ms`);
  await shot('05-map-dragged');
  // 두 손가락 확대
  try {
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx - 40, y: cy, id: 1 }, { x: cx + 40, y: cy, id: 2 }] });
    for (let i = 1; i <= 10; i++) { await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx - 40 - i * 8, y: cy, id: 1 }, { x: cx + 40 + i * 8, y: cy, id: 2 }] }); await sleep(16); }
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(300); await shot('06-map-pinch');
    info(D('M10-핀치'), '두 손가락 확대 실행 → 06-map-pinch.png 와 05 비교해 확대됐는지 사람이 확인');
  } catch (e) { skip(D('M10-핀치'), String(e)); }
  // 길게 누르기: 지도 가운데 0.6초
  const before = await ev(`document.body.innerText.length`);
  await tap(cx, cy, 600);
  const after = await ev(`document.body.innerText.length`);
  await shot('07-longpress');
  info(D('M10-길게누르기'), `지도 가운데 0.6초 누름 → 화면 글자 ${before}→${after} (정보가 열렸는지 07-longpress.png 확인)`);
  await dismiss();

  // 화면 안의 버튼 돌아보기 (위험한 버튼 제외): 패널·모달을 열고 감사
  const DANGER = /턴 종료|다음 달|종료|타이틀|출진!|실행|저장|불러오기|삭제|처형|항복|퇴각|확인|시작|새 게임|위임/;
  const labels = await ev(`[...document.querySelectorAll('button, [role=button], .chip')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && !e.disabled; }).map((e) => (e.innerText || '').trim()).filter((t) => t && t.length < 12)`);
  const uniq = [...new Set(labels)].filter((t) => !DANGER.test(t)).slice(0, 18);
  let opened = 0;
  for (const lb of uniq) {
    const p = await find(`^${lb.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
    if (!p) continue;
    await tap(p.x, p.y); await sleep(300);
    const isModal = await ev(`!!document.querySelector('.modal, [role=dialog], .scrim')`);
    if (isModal) { opened++; await judge(`10-${String(opened).padStart(2, '0')}-${lb.replace(/[^\w가-힣]/g, '')}`); await dismiss(3); if (await ev(`!!document.querySelector('.modal, .scrim')`)) { const s = await ev(`(() => { const e = document.querySelector('.scrim'); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + 5, y: r.top + 5 }; })()`); if (s) await tap(s.x, s.y); } }
  }
  info(D('M-둘러보기'), `버튼 ${uniq.length}개 눌러 창 ${opened}개 열고 감사`, uniq.join(', '));
  await dismiss();

  // 턴 넘기기 3회 (처리 시간)
  const turns = [];
  for (let i = 0; i < 3; i++) {
    const p = await find('턴 종료|다음 달');
    if (!p) { skip(D('M11-턴'), '턴 종료 버튼을 찾지 못함'); break; }
    const tt = Date.now();
    await tap(p.x, p.y);
    await sleep(250);
    const confirm = await find('^다음 달$', '.modal, [role=dialog], .scrim');
    if (confirm) await tap(confirm.x, confirm.y);
    await sleep(150);
    await dismiss(12);
    const waited = await waitFor(ON_MAP, 15000);
    await dismiss(12);
    turns.push(Date.now() - tt);
    if (waited < 0) { fail(D('M11-턴'), 'S1', '개발', '턴 종료 후 15초 안에 조작 가능한 상태로 안 돌아옴'); break; }
  }
  if (turns.length) Math.max(...turns) > 5000 ? fail(D('M11-턴'), 'S3', '개발', `턴 처리(팝업 닫기 포함) 최대 ${Math.max(...turns)}ms (CPU ×${dev.cpu}, 목표 5초)`, turns.join(', ')) : pass(D('M11-턴'), `턴 3회 ${turns.join(' / ')}ms`);
  await judge('11-after-turns');

  // 전투 시도: 군사 → 출진 → 첫 무장 → 출진!
  let inBattle = false;
  if (await tapText('^군사$')) {
    await sleep(300);
    if (await tapText('^출진$')) {
      await sleep(400);
      await judge('12-sortie');
      const pr = await find('통솔|병 [0-9]', '.modal, [role=dialog], .scrim');
      if (pr) await tap(pr.x, pr.y);
      const go = await tapText('^출진!?$', '.modal, [role=dialog], .scrim');
      if (go) { await sleep(1200); inBattle = await ev(`!!document.querySelector('.battle-canvas') || /전투/.test(document.body.innerText.slice(0, 200))`); }
    }
  }
  if (inBattle) {
    await dismiss(2);
    await judge('13-battle');
    const bf = await ev(FPS(4000));
    bf.fps < 30 ? fail(D('M9-전투프레임'), 'S2', '개발', `전투 ${bf.fps}fps (CPU ×${dev.cpu}, 목표 30) · 긴 작업 ${bf.longTasks}회 ${bf.longMs}ms`) : pass(D('M9-전투프레임'), `전투 ${bf.fps}fps · p95 ${bf.p95}ms · 긴 작업 ${bf.longTasks}회`);
    // 백그라운드 전환: 전투가 멈추는가
    const dayText = () => ev(`(document.body.innerText.match(/(\\d+)일째/) || [])[1] || null`);
    const d0 = await dayText();
    await ev(`Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('blur')); true`);
    await sleep(3000);
    const d1 = await dayText();
    await ev(`Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); true`);
    if (d0 && d1) d0 !== d1 ? fail(D('M12-백그라운드전투'), 'S2', '개발', `앱이 백그라운드로 가도 전투가 계속 진행 (${d0}일째 → ${d1}일째) — 전화·알림 한 번에 전투가 끝나 버림. visibilitychange에서 일시정지 필요`) : pass(D('M12-백그라운드전투'), `백그라운드 3초 동안 전투 정지 (${d0}일째 유지)`);
    else skip(D('M12-백그라운드전투'), '전투 경과일 표시를 찾지 못함');
    const del = await tapText('^위임$');
    if (del) { await waitFor(`/승리|패배|결과/.test(document.body.innerText)`, 60000); await shot('14-battle-result'); await judge('14-battle-result'); await dismiss(6); }
  } else skip(D('M-전투'), '터치만으로 출진→전투 화면에 들어가지 못함 (출진 대상·무장이 없을 수도 있음 — 수동 확인)');

  // 백그라운드 전환 시 자동 저장
  const keysBefore = await ev(`JSON.stringify(Object.keys(localStorage).map((k) => [k, (localStorage.getItem(k) || '').length]))`);
  await ev(`Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('pagehide')); true`);
  await sleep(1500);
  const autosaved = await ev(`(() => { const a = Object.keys(localStorage).filter((k) => /auto/.test(k)).map((k) => { try { return JSON.parse(localStorage.getItem(k)).meta.savedAt; } catch { return 0; } }); return Math.max(0, ...a); })()`);
  await ev(`Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); true`);
  Date.now() - autosaved < 5000 ? pass(D('M12-백그라운드저장'), '백그라운드 전환 직후 자동 저장') : fail(D('M12-백그라운드저장'), 'S2', '개발', '앱이 백그라운드로 가도 자동 저장하지 않음 — 폰은 백그라운드 앱을 언제든 강제 종료하므로 마지막 자동 저장 이후 진행이 사라짐', keysBefore);
  const storeKB = await ev(`Math.round(Object.keys(localStorage).reduce((s, k) => s + k.length + (localStorage.getItem(k) || '').length, 0) * 2 / 1024)`);
  info(D('M13-저장소'), `localStorage 사용 ${storeKB}KB (UTF-16 기준). 웹뷰 한도 보통 5MB — 1,000턴 세이브 크기(probe-save D6-03) × 6칸과 비교`);

  // 새로고침해도 세이브가 남는가 (앱 재시작 흉내)
  await win.webContents.reload();
  await waitFor(`!!document.querySelector('button')`, 20000);
  if (await tapText('^불러오기$')) {
    await sleep(500);
    const hasSave = await ev(`/자동 저장|슬롯/.test(document.body.innerText) && !/비어 있음[\\s\\S]*비어 있음[\\s\\S]*비어 있음[\\s\\S]*비어 있음[\\s\\S]*비어 있음[\\s\\S]*비어 있음/.test(document.body.innerText)`);
    await judge('15-load');
    hasSave ? pass(D('M13-재시작'), '다시 켠 뒤 불러오기 목록에 세이브 존재') : fail(D('M13-재시작'), 'S1', '개발', '다시 켠 뒤 세이브가 사라짐');
    await dismiss(2);
  } else skip(D('M13-재시작'), '타이틀 "불러오기" 없음');

  // 세로 화면
  await metrics(dev.h, dev.w, 'portraitPrimary', 0);
  await sleep(700);
  const port = await ev(AUDIT);
  await shot('16-portrait');
  const rotateMsg = /가로|회전|돌려/.test(port.bodyText + (await ev(`document.body.innerText`)));
  if (rotateMsg) pass(D('M14-세로'), '세로로 들면 "가로로 돌려 주세요" 안내');
  else if (port.scale < 0.6) fail(D('M14-세로'), 'S2', '디자인', `세로 화면에서 전체가 ${port.scale}배로 줄어 글자·버튼이 읽을 수 없는 크기 (안내 화면 또는 방향 고정 필요)`);
  else warn(D('M14-세로'), '디자인', `세로 화면 배율 ${port.scale} — 16-portrait.png 확인`);
  await metrics(dev.w, dev.h);

  // 메모리·콘솔
  const mem = await ev(`performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null`);
  info(D('M15-메모리'), `JS 힙 ${mem}MB · DOM ${map.dom}개 (보급형 폰 웹뷰는 수백 MB에서 강제 종료될 수 있음)`);
  if (mem && mem > 300) fail(D('M15-메모리'), 'S2', '개발', `JS 힙 ${mem}MB`);
  consoleErrors.length ? fail(D('M16-콘솔'), 'S2', '개발', `콘솔 오류 ${consoleErrors.length}건`, [...new Set(consoleErrors)].slice(0, 20).join('\n')) : pass(D('M16-콘솔'), '콘솔 오류 없음');
  try { dbg.detach(); } catch { /* */ }
  win.destroy();
}

app.commandLine.appendSwitch('enable-precise-memory-info');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.whenReady().then(async () => {
  const started = Date.now();
  if (!target) { console.error('사용: npx electron qa/scripts/probe-mobile.cjs <빌드폴더|URL> [기기] [출력]'); app.exit(2); return; }
  const url = /^https?:|^file:/.test(target) ? target : pathToFileURL(path.join(path.resolve(target), 'index.html')).href;
  info('대상', `${url} · 기기 ${devices.map((d) => d.id).join(', ')}`);
  for (const d of devices) {
    console.log(`▶ ${d.name}`);
    try { await Promise.race([runDevice(d, url), sleep(240000).then(() => { throw new Error('기기 하나에 4분 넘게 걸림 (멈춤)'); })]); } catch (e) { fail(`M-예외 [${d.id}]`, 'S2', '개발', `프로브 진행 중 예외: ${e && e.message}`, e && e.stack); }
  }
  const fails = writeReport(started);
  app.exit(fails ? 1 : 0);
});
