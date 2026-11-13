/**
 * 실행 환경별 차이를 한 곳에 모은다 (Electron 설치판 / 웹 / 폰 앱).
 * 게임 코드(src/engine, src/ui, src/render3d)는 Electron·Node·Capacitor 기능을 직접 쓰지 않고, 필요하면 여기를 거친다.
 * - Electron: preload 가 넣어 주는 globalThis.saveApi (파일 저장) — electron/preload.cjs
 * - 폰 앱(Capacitor): IndexedDB 저장, 가로 고정, 앱 종료·뒤로 가기
 * - 웹(개발·QA): localStorage (QA 프로브가 localStorage 를 직접 읽으므로 그대로 둔다)
 */
import { App as CapApp } from '@capacitor/app';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { setSaveBackend } from '../engine/save';
import { idbBackend } from './idb';

export type Platform = 'electron' | 'native' | 'web';

export function platform(): Platform {
  const g = globalThis as { saveApi?: unknown; Capacitor?: { isNativePlatform?: () => boolean } };
  if (g.saveApi) return 'electron';
  if (g.Capacitor?.isNativePlatform?.()) return 'native';
  return 'web';
}

/** 앱 시작 때 한 번: 환경에 맞는 저장소를 고르고, 폰이면 가로로 고정한다 */
export function installPlatform(): void {
  if (platform() !== 'native') return;
  if (typeof indexedDB !== 'undefined') setSaveBackend(idbBackend());
  // 가로 고정 (QA-DEV-07): 안드로이드는 AndroidManifest 의 sensorLandscape 가 먼저 막고, 여기서 한 번 더 잠근다
  ScreenOrientation.lock({ orientation: 'landscape' }).catch(() => undefined);
}

/** "종료" 버튼을 보일지 (QA-DEV-08): PC 창과 안드로이드 앱만. iOS 는 앱이 스스로 끝나면 안 되고(심사 지침), 웹 탭은 닫을 수 없다 */
export function canQuit(): boolean {
  const p = platform();
  if (p === 'electron') return true;
  if (p === 'native') return (globalThis as { Capacitor?: { getPlatform?: () => string } }).Capacitor?.getPlatform?.() === 'android';
  return false;
}

/** 게임 종료 (QA-DEV-08) */
export function quitApp(): void {
  if (platform() === 'native') void CapApp.exitApp();
  else window.close();
}

/**
 * 안드로이드 뒤로 가기 (QA-DEV-08, 모바일 M17): handler 가 true 를 돌려주면 처리한 것(열린 창 닫기 등),
 * false 면 타이틀에서는 앱을 종료한다. 웹·PC 에서는 아무 일도 하지 않는다.
 */
export function onBackButton(handler: () => boolean): void {
  if (platform() !== 'native') return;
  void CapApp.addListener('backButton', () => {
    if (!handler()) void CapApp.exitApp();
  });
}

/**
 * 폰 웹앱(PWA)으로 열렸을 때: 오프라인 캐시(sw.js)를 켜고, 저장이 지워지지 않게 영구 저장소를 요청한다.
 * Electron(file://)·개발 서버(http://localhost)에서는 아무것도 하지 않는다.
 */
export function installWebApp(): void {
  if (platform() !== 'web' || typeof location === 'undefined' || location.protocol !== 'https:') return;
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  navigator.storage?.persist?.().catch(() => undefined);
}
