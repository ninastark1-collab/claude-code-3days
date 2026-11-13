import type { CapacitorConfig } from "@capacitor/cli";

// Server address baked into the app at build time (see scripts/build-apk.mjs).
const serverUrl = process.env.VITE_SERVER_URL ?? "";
const insecure = serverUrl.startsWith("ws://"); // local-network test builds only

const config: CapacitorConfig = {
  // Placeholder id: change to a domain you own before publishing to a store (it can't change afterwards).
  appId: "com.breakfort.monsterclass",
  appName: "몬스터 클래스",
  webDir: "dist",
  server: { androidScheme: "https", cleartext: insecure },
  android: { allowMixedContent: insecure },
};

export default config;
