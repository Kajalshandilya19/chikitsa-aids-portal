import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

/** A permission code written as a string. Code refers to permissions through `P.*` only (R-RBAC-1). */
const PERMISSION_LITERAL = "/^pension:[a-z_]+\\.[a-z_]+\\.[a-z_]+$/";
const PERMISSION_MESSAGE = "Use P.* from @/lib/shared/permission-codes, never a permission string literal.";

export default defineConfig(
  { ignores: [".next/**", "node_modules/**", "out/**", "next-env.d.ts", "public/**"] },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,mjs}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "no-console": ["error", { allow: ["warn", "error"] }],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" }],
      "no-restricted-syntax": [
        "error",
        { selector: `Literal[value=${PERMISSION_LITERAL}]`, message: PERMISSION_MESSAGE },
        { selector: `TemplateElement[value.cooked=${PERMISSION_LITERAL}]`, message: PERMISSION_MESSAGE },
      ],
    },
  },
  // The one place permission codes are spelled out.
  { files: ["src/lib/shared/permission-codes.ts"], rules: { "no-restricted-syntax": "off" } },
);
