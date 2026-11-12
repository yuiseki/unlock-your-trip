import { defineConfig } from "vitest/config";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";

export default defineConfig({
  test: {
    projects: [
      { test: { name: "app", include: ["src/**/*.test.ts"] } },
      {
        plugins: [
          cloudflareTest(async () => ({
            wrangler: { configPath: "./wrangler.jsonc" },
            miniflare: { bindings: {
              CLERK_PUBLISHABLE_KEY: `pk_test_${btoa("test.clerk.accounts.dev$")}`,
              CLERK_AUTHORIZED_PARTIES: "https://unlock.example",
              TEST_MIGRATIONS: await readD1Migrations("migrations") } },
          })),
        ],
        test: { name: "worker", include: ["worker/**/*.test.ts"], setupFiles: ["worker/test/apply-migrations.ts"] },
      },
    ],
  },
});
