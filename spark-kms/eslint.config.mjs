import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import tseslint from "typescript-eslint";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Type-aware linting, scoped to the business logic for now. These rules need
  // full type information (slower than syntactic rules), so they run only where
  // correctness matters most. Widen the `files` glob as the codebase catches up.
  {
    files: ["src/services/**/*.ts"],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // `async` without `await` is how we conform to Promise-returning
      // signatures (the Embedder interface, Next route handlers). Requiring an
      // await would mean distorting the code to satisfy the linter.
      "@typescript-eslint/require-await": "off",
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
