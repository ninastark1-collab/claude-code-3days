/**
 * 폰 빌드 (QA-DEV-01): Vite 빌드(dist) → Capacitor 동기화 → Gradle 로 APK/AAB.
 *   node scripts/mobile-build.mjs apk   → release/samgukji-<버전>-debug.apk  (실기기 테스트용)
 *   node scripts/mobile-build.mjs aab   → release/samgukji-<버전>.aab        (스토어 업로드용, 서명 설정 필요)
 * 필요: JDK 21, Android SDK (Android Studio 설치 시 함께 설치됨). ANDROID_HOME 또는 android/local.properties 의 sdk.dir.
 * iOS: macOS + Xcode 에서 `npx cap add ios` 한 번 → `npm run ios:sync` → Xcode 로 Archive.
 */
import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';

const kind = process.argv[2] ?? 'apk';
const { version } = JSON.parse(readFileSync('package.json', 'utf-8'));
const run = (cmd, cwd = '.') => execSync(cmd, { stdio: 'inherit', cwd });

run('npm run build');
run('npx cap sync android');
const gradlew = process.platform === 'win32' ? '.\\gradlew.bat' : './gradlew';
run(`${gradlew} ${kind === 'aab' ? 'bundleRelease' : 'assembleDebug'}`, 'android');
const out = kind === 'aab' ? 'android/app/build/outputs/bundle/release/app-release.aab' : 'android/app/build/outputs/apk/debug/app-debug.apk';
if (!existsSync(out)) throw new Error(`결과물이 없습니다: ${out}`);
mkdirSync('release', { recursive: true });
const dest = `release/samgukji-${version}${kind === 'aab' ? '.aab' : '-debug.apk'}`;
copyFileSync(out, dest);
console.log(`완료: ${dest}`);
