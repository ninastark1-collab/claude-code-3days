import { useEffect, useRef, type ReactNode } from 'react';
import { canvasPattern, factionColor, inkOn, tokenValue } from '../theme';
import { useViewSize } from '../viewport';
import { BOUNDS, CITY_LONLAT, LAND, MOUNTS, RIVERS } from './geo';

/**
 * 전략 지도 (S04 · S02 미리보기).
 * - 바탕 레이어(한지·세력 수채 칠·먹 점선 경계·산·강): 세력 배치나 색약 모드가 바뀔 때만 다시 그린다.
 * - 위 레이어(도로·도시·이름·위협 화살표): 화면이 바뀔 때마다 그린다 (가볍다).
 * - 조작: 한 손가락/마우스 드래그 = 이동, 두 손가락·휠 = 확대, 두 번 누르기 = 한 단계 확대, 길게 누르기 = 엿보기.
 */

export interface MapCity {
  id: string;
  name: string;
  faction: string | null;
  /** 아군 도시면 군주 성씨 낙관을 찍는다 */
  seal?: string;
  troops?: number | null;
  capital?: boolean;
}

export interface MapProps {
  cities: MapCity[];
  roads: [string, string, 'land' | 'water'][];
  selected?: string | null;
  /** 붉은 위협 화살표 [출발, 도착] */
  threats?: [string, string][];
  colorBlind: boolean;
  onSelect?: (id: string | null) => void;
  onPeek?: (id: string | null, at?: { x: number; y: number }) => void;
  /** 처음/요청 시 이 도시를 중심으로 (오른쪽 시트가 열려 있으면 그만큼 왼쪽으로) */
  focus?: { city: string; nonce: number } | null;
  rightInset?: number;
  initialK?: number;
  interactive?: boolean;
  children?: ReactNode;
}

const K_BASE = 60; // 바탕 레이어 해상도 (1도당 px)
const RES = 1.5;
const K_MIN = 14;
const K_MAX = 96;
const LEVELS = [24, 45, 70]; // 천하 · 주 · 도시

function rnd(s: number): number {
  const t = Math.sin(s * 127.1) * 43758.5453;
  return t - Math.floor(t);
}
function noise(a: number, b: number): number {
  return Math.sin(a * 0.021 + Math.sin(b * 0.017) * 2) * 0.5 + Math.sin(b * 0.033 + a * 0.011) * 0.35 + Math.sin((a + b) * 0.06) * 0.15;
}

/** 바탕 레이어 (월드 좌표, 캐시) */
function buildBase(cities: MapCity[], colorBlind: boolean): HTMLCanvasElement {
  const K = K_BASE * RES;
  const W = Math.ceil((BOUNDS.lonMax - BOUNDS.lonMin) * K);
  const H = Math.ceil((BOUNDS.latMax - BOUNDS.latMin) * K);
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const x = cv.getContext('2d')!;
  const px = (lon: number) => (lon - BOUNDS.lonMin) * K;
  const py = (lat: number) => (BOUNDS.latMax - lat) * K;
  const land = () => {
    x.beginPath();
    LAND.forEach(([lo, la], i) => (i ? x.lineTo(px(lo), py(la)) : x.moveTo(px(lo), py(la))));
    x.closePath();
  };
  // 바다
  x.fillStyle = tokenValue('--g-sea');
  x.fillRect(0, 0, W, H);
  for (let i = 0; i < 6000; i++) {
    x.fillStyle = `rgba(255,255,255,${rnd(i) * 0.025})`;
    x.fillRect(rnd(i + 1) * W, rnd(i + 2) * H, 1 + rnd(i + 3) * 3, 1.5);
  }
  // 땅: 한지
  x.save();
  land();
  x.shadowColor = 'rgba(0,0,0,.45)';
  x.shadowBlur = 30;
  x.fillStyle = tokenValue('--g-paper');
  x.fill();
  x.restore();
  x.save();
  land();
  x.clip();
  for (let i = 0; i < 40000; i++) {
    x.fillStyle = `rgba(70,64,48,${rnd(i * 3) * 0.06})`;
    x.fillRect(rnd(i * 3 + 1) * W, rnd(i * 3 + 2) * H, 1.5, 1.5 + rnd(i) * 4);
  }
  // 세력 칠: 경위도 0.1도 격자에서 가장 가까운 도시(+번짐 잡음)
  const STEP = 0.1;
  const gw = Math.ceil((BOUNDS.lonMax - BOUNDS.lonMin) / STEP);
  const gh = Math.ceil((BOUNDS.latMax - BOUNDS.latMin) / STEP);
  const own = new Int16Array(gw * gh).fill(-1);
  const pts: [number, number][] = cities.map((c) => CITY_LONLAT[c.id] ?? [0, 0]);
  for (let gy = 0; gy < gh; gy++) {
    const lat = BOUNDS.latMax - (gy + 0.5) * STEP;
    for (let gx = 0; gx < gw; gx++) {
      const lon = BOUNDS.lonMin + (gx + 0.5) * STEP;
      let best = -1;
      let bd = 1e9;
      for (let k = 0; k < pts.length; k++) {
        const pk = pts[k]!;
        const d = Math.hypot(lon - pk[0], lat - pk[1]) + noise(lon * 42 + k * 37, lat * 42 - k * 19) * 0.62;
        if (d < bd) (bd = d), (best = k);
      }
      own[gy * gw + gx] = bd < 3.6 ? best : -1;
    }
  }
  const fac = (i: number) => (own[i]! < 0 ? '' : cities[own[i]!]!.faction ?? '__none');
  const off = document.createElement('canvas');
  off.width = gw;
  off.height = gh;
  const oc = off.getContext('2d')!;
  const img = oc.createImageData(gw, gh);
  const rgbCache = new Map<string, number[]>();
  for (let i = 0; i < own.length; i++) {
    if (own[i]! < 0) continue;
    const f = cities[own[i]!]!.faction;
    const key = f ?? '__none';
    let rgb = rgbCache.get(key);
    if (!rgb) {
      const h = factionColor(f).replace('#', '');
      rgb = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
      rgbCache.set(key, rgb);
    }
    const a = 125 + noise((i % gw) * 9, ((i / gw) | 0) * 7) * 40;
    img.data[i * 4] = rgb[0]!;
    img.data[i * 4 + 1] = rgb[1]!;
    img.data[i * 4 + 2] = rgb[2]!;
    img.data[i * 4 + 3] = a;
  }
  oc.putImageData(img, 0, 0);
  x.imageSmoothingEnabled = true;
  x.globalCompositeOperation = 'multiply';
  x.drawImage(off, 0, 0, gw * STEP * K, gh * STEP * K);
  x.globalCompositeOperation = 'source-over';
  const cell = STEP * K;
  // 색약 모드: 세력마다 무늬
  if (colorBlind) {
    const pats = new Map<string, CanvasPattern | null>();
    x.globalAlpha = 0.9;
    for (let i = 0; i < own.length; i++) {
      if (own[i]! < 0) continue;
      const f = cities[own[i]!]!.faction;
      const key = f ?? '__none';
      if (!pats.has(key)) pats.set(key, canvasPattern(x, f));
      const p = pats.get(key);
      if (!p) continue;
      x.fillStyle = p;
      x.fillRect((i % gw) * cell, ((i / gw) | 0) * cell, cell + 0.5, cell + 0.5);
    }
    x.globalAlpha = 1;
  }
  // 세력 경계: 먹 점선
  for (let gy = 1; gy < gh - 1; gy++)
    for (let gx = 1; gx < gw - 1; gx++) {
      const id = gy * gw + gx;
      const f0 = fac(id);
      if (!f0) continue;
      const f1 = fac(id + 1);
      const f2 = fac(id + gw);
      if ((f1 && f1 !== f0) || (f2 && f2 !== f0)) {
        x.fillStyle = `rgba(26,25,22,${0.35 + rnd(id) * 0.3})`;
        x.fillRect(gx * cell, gy * cell, cell * 0.45, cell * 0.45);
      }
    }
  // 산: 붓 획
  x.lineCap = 'round';
  const ms = K / 42;
  MOUNTS.forEach(([lo, la], mi) => {
    const cx = px(lo);
    const cy = py(la);
    for (let j = 0; j < 4; j++) {
      const ox = cx + (j - 1.5) * 15 * ms + rnd(mi * 9 + j) * 6;
      const oy = cy + rnd(mi * 7 + j) * 8 * ms;
      const hg = (9 + rnd(mi + j * 3) * 8) * ms;
      x.strokeStyle = `rgba(26,25,22,${0.35 + rnd(j + mi) * 0.25})`;
      x.lineWidth = 1.6 * RES;
      x.beginPath();
      x.moveTo(ox - 9 * ms, oy + 4 * ms);
      x.quadraticCurveTo(ox - 2 * ms, oy - hg, ox + ms, oy - hg + ms);
      x.quadraticCurveTo(ox + 4 * ms, oy - hg + 4 * ms, ox + 10 * ms, oy + 4 * ms);
      x.stroke();
    }
  });
  // 강: 두 번 겹친 먹 선
  RIVERS.forEach((r) => {
    ([[4 + K / 30, 'rgba(216,214,193,.55)'], [1.6 + K / 40, 'rgba(47,72,82,.75)']] as const).forEach(([lw, col]) => {
      x.lineWidth = lw;
      x.strokeStyle = col;
      x.beginPath();
      r.pts.forEach(([lo, la], j) => {
        if (!j) return x.moveTo(px(lo), py(la));
        const [qlo, qla] = r.pts[j - 1]!;
        x.quadraticCurveTo(px(qlo), py(qla), (px(qlo) + px(lo)) / 2, (py(qla) + py(la)) / 2);
      });
      const last = r.pts[r.pts.length - 1]!;
      x.lineTo(px(last[0]), py(last[1]));
      x.stroke();
    });
  });
  x.restore();
  x.save();
  land();
  x.lineWidth = 1.4 * RES;
  x.strokeStyle = 'rgba(26,25,22,.7)';
  x.stroke();
  x.restore();
  x.font = `${15 * RES}px "Song Myung", serif`;
  x.fillStyle = 'rgba(47,72,82,.9)';
  RIVERS.forEach((r) => x.fillText(r.name, px(r.at[0]), py(r.at[1])));
  return cv;
}

export function MapCanvas(p: MapProps) {
  const view = useViewSize();
  const canvas = useRef<HTMLCanvasElement>(null);
  const cam = useRef({ lon: 113, lat: 33, K: p.initialK ?? 55 });
  const base = useRef<{ key: string; cv: HTMLCanvasElement } | null>(null);
  const props = useRef(p);
  props.current = p;
  const raf = useRef(0);
  const ptrs = useRef(new Map<number, { x: number; y: number }>());
  const drag = useRef<{ moved: boolean; startK?: number; startDist?: number; downAt: number; hitCity: string | null; longTimer?: number; long?: boolean } | null>(null);
  const lastTap = useRef(0);

  const ownersKey = p.cities.map((c) => c.faction ?? '-').join(',') + (p.colorBlind ? '|cb' : '');

  const toScreen = (lon: number, lat: number) => {
    const c = cam.current;
    return { x: (lon - c.lon) * c.K + view.w / 2, y: (c.lat - lat) * c.K + view.h / 2 };
  };
  const toLonLat = (x: number, y: number) => {
    const c = cam.current;
    return { lon: (x - view.w / 2) / c.K + c.lon, lat: c.lat - (y - view.h / 2) / c.K };
  };
  const clampCam = () => {
    const c = cam.current;
    const fitK = Math.min(view.w / (BOUNDS.lonMax - BOUNDS.lonMin), view.h / (BOUNDS.latMax - BOUNDS.latMin));
    c.K = Math.max(Math.max(K_MIN, fitK * 0.9), Math.min(K_MAX, c.K));
    // 화면 가운데가 지도 범위 밖으로 나가지 않을 만큼만 제한
    c.lon = Math.max(BOUNDS.lonMin, Math.min(BOUNDS.lonMax, c.lon));
    c.lat = Math.max(BOUNDS.latMin, Math.min(BOUNDS.latMax, c.lat));
  };

  const draw = () => {
    raf.current = 0;
    const cv = canvas.current;
    if (!cv) return;
    const pp = props.current;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const pxW = Math.round(view.w * view.scale * dpr);
    const pxH = Math.round(view.h * view.scale * dpr);
    if (cv.width !== pxW || cv.height !== pxH) {
      cv.width = pxW;
      cv.height = pxH;
    }
    const x = cv.getContext('2d')!;
    x.setTransform(view.scale * dpr, 0, 0, view.scale * dpr, 0, 0);
    if (!base.current || base.current.key !== ownersKey) base.current = { key: ownersKey, cv: buildBase(pp.cities, pp.colorBlind) };
    const c = cam.current;
    x.fillStyle = tokenValue('--g-sea');
    x.fillRect(0, 0, view.w, view.h);
    const o = toScreen(BOUNDS.lonMin, BOUNDS.latMax);
    x.imageSmoothingEnabled = true;
    x.drawImage(base.current.cv, o.x, o.y, (BOUNDS.lonMax - BOUNDS.lonMin) * c.K, (BOUNDS.latMax - BOUNDS.latMin) * c.K);

    const pos = new Map<string, { x: number; y: number }>();
    for (const city of pp.cities) {
      const ll = CITY_LONLAT[city.id];
      if (ll) pos.set(city.id, toScreen(ll[0], ll[1]));
    }
    // 도로: 먹 점선 (주 단계 이상)
    if (c.K >= 30) {
      x.lineWidth = 1;
      for (const [a, b, kind] of pp.roads) {
        const pa = pos.get(a);
        const pb = pos.get(b);
        if (!pa || !pb) continue;
        x.setLineDash(kind === 'water' ? [6, 4] : [3, 4]);
        x.strokeStyle = kind === 'water' ? 'rgba(47,72,82,.6)' : 'rgba(26,25,22,.45)';
        x.beginPath();
        x.moveTo(pa.x, pa.y);
        x.lineTo(pb.x, pb.y);
        x.stroke();
      }
      x.setLineDash([]);
    }
    // 위협 화살표
    for (const [from, to] of pp.threats ?? []) {
      const a = pos.get(from);
      const b = pos.get(to);
      if (!a || !b) continue;
      const mx = (a.x + b.x) / 2 + (b.y - a.y) * 0.25;
      const my = (a.y + b.y) / 2 - (b.x - a.x) * 0.25;
      x.lineWidth = 3;
      x.strokeStyle = 'rgba(181,56,42,.85)';
      x.beginPath();
      x.moveTo(a.x, a.y);
      x.quadraticCurveTo(mx, my, b.x, b.y);
      x.stroke();
      const an = Math.atan2(b.y - my, b.x - mx);
      x.fillStyle = 'rgba(181,56,42,.85)';
      x.beginPath();
      x.moveTo(b.x, b.y);
      x.lineTo(b.x - 12 * Math.cos(an - 0.45), b.y - 12 * Math.sin(an - 0.45));
      x.lineTo(b.x - 12 * Math.cos(an + 0.45), b.y - 12 * Math.sin(an + 0.45));
      x.closePath();
      x.fill();
    }
    // 도시: 사각 표시
    const ink = tokenValue('--g-ink');
    const gold = tokenValue('--g-gold');
    for (const city of pp.cities) {
      const q = pos.get(city.id);
      if (!q || q.x < -30 || q.y < -30 || q.x > view.w + 30 || q.y > view.h + 30) continue;
      const sel = pp.selected === city.id;
      const s = c.K >= 60 ? (sel ? 18 : 14) : c.K >= 38 ? (sel ? 14 : 10) : sel ? 9 : 6;
      if (sel) {
        x.strokeStyle = gold;
        x.lineWidth = 2;
        x.beginPath();
        x.arc(q.x, q.y, s + 7, 0, Math.PI * 2);
        x.stroke();
        x.strokeStyle = 'rgba(195,161,92,.4)';
        x.lineWidth = 1;
        x.beginPath();
        x.arc(q.x, q.y, s + 13, 0, Math.PI * 2);
        x.stroke();
      }
      const col = factionColor(city.faction);
      x.fillStyle = ink;
      x.fillRect(q.x - s / 2 - 1.5, q.y - s / 2 - 1.5, s + 3, s + 3);
      x.fillStyle = col;
      x.fillRect(q.x - s / 2, q.y - s / 2, s, s);
      if (pp.colorBlind) {
        const pat = canvasPattern(x, city.faction);
        if (pat) {
          x.fillStyle = pat;
          x.fillRect(q.x - s / 2, q.y - s / 2, s, s);
        }
      }
      if (city.capital && s >= 10) {
        x.strokeStyle = gold;
        x.lineWidth = 1.5;
        x.strokeRect(q.x - s / 2 - 3.5, q.y - s / 2 - 3.5, s + 7, s + 7);
      }
      if (city.seal && c.K >= 60) {
        x.fillStyle = inkOn(col);
        x.font = `900 ${(s * 0.62) | 0}px "Noto Serif KR", serif`;
        x.textAlign = 'center';
        x.fillText(city.seal, q.x, q.y + s * 0.22);
        x.textAlign = 'left';
      }
      if (c.K >= 38 || sel) {
        const fs = c.K >= 60 ? (sel ? 19 : 15) : 13;
        x.font = `${fs}px "Song Myung", serif`;
        const tx = q.x + s / 2 + 6;
        const ty = q.y + fs * 0.35;
        x.lineWidth = 3.5;
        x.strokeStyle = 'rgba(216,214,193,.92)';
        x.strokeText(city.name, tx, ty);
        x.fillStyle = ink;
        x.fillText(city.name, tx, ty);
        if (c.K >= 60 && city.troops != null && city.troops > 0) {
          x.font = '600 11px "IBM Plex Sans KR", sans-serif';
          const t = `${(city.troops / 10000).toFixed(1)}만`;
          x.lineWidth = 3;
          x.strokeText(t, tx, ty + 14);
          x.fillStyle = ink;
          x.fillText(t, tx, ty + 14);
        }
      }
    }
    // 가장자리 비네트
    const g = x.createRadialGradient(view.w / 2, view.h / 2, Math.min(view.w, view.h) * 0.4, view.w / 2, view.h / 2, Math.max(view.w, view.h) * 0.7);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,.4)');
    x.fillStyle = g;
    x.fillRect(0, 0, view.w, view.h);
  };
  const redraw = () => {
    if (!raf.current) raf.current = requestAnimationFrame(draw);
  };

  // 초점 도시로 이동 (시트가 열려 있으면 시트 왼쪽 공간의 가운데로)
  useEffect(() => {
    if (!p.focus) return;
    const ll = CITY_LONLAT[p.focus.city];
    if (!ll) return;
    const c = cam.current;
    c.lon = ll[0] + (p.rightInset ?? 0) / 2 / c.K;
    c.lat = ll[1];
    clampCam();
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.focus?.nonce]);

  useEffect(() => {
    clampCam();
    redraw();
    // 글꼴이 늦게 오면 한 번 더
    document.fonts?.ready.then(redraw);
  });

  useEffect(
    () => () => {
      cancelAnimationFrame(raf.current);
      raf.current = 0; // StrictMode 재마운트 뒤에도 다시 그릴 수 있도록
    },
    [],
  );

  const hitCity = (lx: number, ly: number): string | null => {
    let best: string | null = null;
    let bd = 18;
    for (const city of props.current.cities) {
      const ll = CITY_LONLAT[city.id];
      if (!ll) continue;
      const q = toScreen(ll[0], ll[1]);
      const d = Math.hypot(q.x - lx, q.y - ly);
      if (d < bd) (bd = d), (best = city.id);
    }
    return best;
  };
  const local = (e: React.PointerEvent | React.WheelEvent | React.MouseEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * view.w, y: ((e.clientY - r.top) / r.height) * view.h };
  };
  const zoomAt = (lx: number, ly: number, factor: number) => {
    const before = toLonLat(lx, ly);
    cam.current.K *= factor;
    clampCam();
    const after = toLonLat(lx, ly);
    cam.current.lon += before.lon - after.lon;
    cam.current.lat += before.lat - after.lat;
    clampCam();
    redraw();
  };

  if (p.interactive === false) {
    return (
      <div className="map-wrap">
        <canvas ref={canvas} className="map-canvas" />
        {p.children}
      </div>
    );
  }

  return (
    <div className="map-wrap">
      <canvas
        ref={canvas}
        className="map-canvas"
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture(e.pointerId);
          const q = local(e);
          ptrs.current.set(e.pointerId, q);
          if (ptrs.current.size === 2) {
            const [a, b] = [...ptrs.current.values()];
            drag.current = { moved: true, startK: cam.current.K, startDist: Math.hypot(a!.x - b!.x, a!.y - b!.y), downAt: Date.now(), hitCity: null };
            return;
          }
          const hc = hitCity(q.x, q.y);
          const d = { moved: false, downAt: Date.now(), hitCity: hc } as NonNullable<typeof drag.current>;
          if (hc)
            d.longTimer = window.setTimeout(() => {
              d.long = true;
              props.current.onPeek?.(hc, q);
            }, 350);
          drag.current = d;
        }}
        onPointerMove={(e) => {
          const q = local(e);
          const prev = ptrs.current.get(e.pointerId);
          if (!prev) {
            // 마우스 올리기 = 엿보기 (PC)
            if (e.pointerType === 'mouse') {
              const hc = hitCity(q.x, q.y);
              props.current.onPeek?.(hc, q);
            }
            return;
          }
          ptrs.current.set(e.pointerId, q);
          const d = drag.current;
          if (!d) return;
          if (ptrs.current.size === 2 && d.startDist) {
            const [a, b] = [...ptrs.current.values()];
            const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
            const mid = { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 };
            zoomAt(mid.x, mid.y, (d.startK! * dist) / d.startDist / cam.current.K);
            return;
          }
          const dx = q.x - prev.x;
          const dy = q.y - prev.y;
          if (!d.moved && Math.hypot(dx, dy) < 2) return;
          if (!d.moved) {
            d.moved = true;
            window.clearTimeout(d.longTimer);
          }
          cam.current.lon -= dx / cam.current.K;
          cam.current.lat += dy / cam.current.K;
          clampCam();
          redraw();
        }}
        onPointerUp={(e) => {
          const q = local(e);
          ptrs.current.delete(e.pointerId);
          const d = drag.current;
          if (!d) return;
          window.clearTimeout(d.longTimer);
          if (d.long) {
            props.current.onPeek?.(null);
            drag.current = null;
            return;
          }
          if (!d.moved && ptrs.current.size === 0) {
            const now = Date.now();
            if (now - lastTap.current < 300) {
              // 두 번 누르기: 한 단계 확대
              const next = LEVELS.find((k) => k > cam.current.K + 1) ?? LEVELS[0]!;
              zoomAt(q.x, q.y, next / cam.current.K);
            } else props.current.onSelect?.(d.hitCity);
            lastTap.current = now;
          }
          if (ptrs.current.size === 0) drag.current = null;
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === 'mouse' && !ptrs.current.size) props.current.onPeek?.(null);
        }}
        onWheel={(e) => {
          const q = local(e);
          zoomAt(q.x, q.y, e.deltaY < 0 ? 1.15 : 1 / 1.15);
        }}
        onContextMenu={(e) => e.preventDefault()}
      />
      {p.children}
    </div>
  );
}

/** 도시 화면 좌표 (엿보기 카드 위치용) — 지도 밖에서는 쓰지 않음 */
export function cityLonLat(id: string): [number, number] | undefined {
  return CITY_LONLAT[id];
}
