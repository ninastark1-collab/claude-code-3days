/** 게임 버전: 빌드 때 package.json 의 version 을 주입한다 (vite.config.ts define). 버그 보고·회신 추적용 */
declare const __APP_VERSION__: string | undefined;
export const APP_VERSION: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
