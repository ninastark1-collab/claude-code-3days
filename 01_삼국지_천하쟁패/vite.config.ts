/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { copyFileSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string };

/** 글꼴 라이선스 (SIL OFL 1.1) 원문을 배포본 dist/licenses/ 에 넣는다 (QA-DEV-05). PC 설치판·폰 앱 모두 dist 를 감싼다 */
function copyLicenses(): Plugin {
  return {
    name: 'copy-licenses',
    apply: 'build',
    closeBundle() {
      mkdirSync('dist/licenses', { recursive: true });
      for (const f of readdirSync('assets/fonts')) if (f.startsWith('LICENSE-')) copyFileSync(`assets/fonts/${f}`, `dist/licenses/${f}`);
    },
  };
}

export default defineConfig({
  plugins: [react(), copyLicenses()],
  // Electron이 file:// 로 dist/index.html을 열 수 있도록 상대 경로 사용
  base: './',
  // 게임 버전 주입 (QA-DEV-10): 타이틀·오류 기록에 package.json 버전을 쓴다
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  // 무장·시나리오 데이터가 번들에 포함되어 크지만, 로컬 데스크톱 앱이라 분할할 필요 없음
  build: { chunkSizeWarningLimit: 2500 },
  server: {
    // 설치파일 빌드 중 release/ 임시 파일 감시로 개발 서버가 죽지 않도록 제외
    watch: { ignored: ['**/release/**', '**/build/**', '**/dist/**', '**/android/**', '**/ios/**'] },
  },
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
  },
});
