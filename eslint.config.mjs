import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The Claude Design handoff bundle (prototype source, not app code).
    "project/**",
    // Vendored third-party bundles: minified upstream code we do not author
    // and cannot fix, so linting it only produces noise.
    "public/vendor/**",
  ]),
]);

export default eslintConfig;
