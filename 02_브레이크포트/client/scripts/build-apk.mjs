/**
 * Builds the installable Android app (debug-signed APK) with the battle server address baked in.
 *   node client/scripts/build-apk.mjs --server wss://your-app.onrender.com
 * Output: apk/monster-class.apk
 * Needs: Android SDK (ANDROID_HOME or %LOCALAPPDATA%/Android/Sdk), JDK 21 (JAVA_HOME or ~/.jdks/jdk-21*).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const client = path.join(root, "client");
const android = path.join(client, "android");

const arg = process.argv.indexOf("--server");
const server = arg > 0 ? process.argv[arg + 1] : process.env.VITE_SERVER_URL;
if (!server || !/^wss?:\/\//.test(server)) {
  console.error("Usage: node client/scripts/build-apk.mjs --server wss://<your server host>");
  process.exit(1);
}

const javaHome = process.env.JAVA_HOME && fs.existsSync(process.env.JAVA_HOME) ? process.env.JAVA_HOME : (() => {
  const dir = path.join(os.homedir(), ".jdks");
  const jdk = fs.existsSync(dir) && fs.readdirSync(dir).find((n) => n.startsWith("jdk-21"));
  return jdk ? path.join(dir, jdk) : null;
})();
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || path.join(process.env.LOCALAPPDATA ?? "", "Android", "Sdk");
if (!javaHome) { console.error("JDK 21 not found (set JAVA_HOME)."); process.exit(1); }
if (!fs.existsSync(sdk)) { console.error(`Android SDK not found at ${sdk} (set ANDROID_HOME).`); process.exit(1); }

const env = { ...process.env, VITE_SERVER_URL: server, JAVA_HOME: javaHome, ANDROID_HOME: sdk };
const run = (cmd, cwd) => { console.log(`\n> ${cmd}`); execSync(cmd, { cwd, env, stdio: "inherit" }); };

console.log(`server: ${server}\nJDK: ${javaHome}\nSDK: ${sdk}`);
run("npm run build", client);
run("npx cap sync android", client);
run("node client/scripts/android-res.mjs", root);
fs.writeFileSync(path.join(android, "local.properties"), `sdk.dir=${sdk.replace(/\\/g, "\\\\").replace(/:/g, "\\:")}\n`);
const gradlew = path.join(android, process.platform === "win32" ? "gradlew.bat" : "gradlew");
run(`"${gradlew}" assembleDebug`, android);

const built = path.join(android, "app/build/outputs/apk/debug/app-debug.apk");
const out = path.join(root, "apk", "monster-class.apk");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.copyFileSync(built, out);
console.log(`\nAPK: ${out} (${(fs.statSync(out).size / 1048576).toFixed(1)} MB)`);
