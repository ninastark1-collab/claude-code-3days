// 자동 테스트 설정 (Vitest): `npm test`로 핵심 계산 함수들이 맞게 동작하는지 확인해요.
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["src/**/*.test.ts"], environment: "node" },
});
