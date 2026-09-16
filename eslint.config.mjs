import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Public pages must query through getPublicPayload(), which enforces access control.
  // A raw Payload client in a page would return drafts and scheduled posts to visitors.
  {
    files: ["src/app/(frontend)/**/*.{ts,tsx}", "src/components/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "payload",
              importNames: ["getPayload"],
              message:
                "Use getPublicPayload() from @/lib/public-payload on public pages — it keeps access control on, so drafts stay hidden.",
            },
            {
              name: "@payload-config",
              message:
                "Use getPublicPayload() from @/lib/public-payload on public pages instead of building your own Payload client.",
            },
          ],
          patterns: [
            {
              group: ["@/lib/payload", "**/lib/payload"],
              message:
                "getPayloadClient() skips access control. Public pages use getPublicPayload() from @/lib/public-payload.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
