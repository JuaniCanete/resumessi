import js from "@eslint/js";
import ts from "@typescript-eslint/eslint-plugin";
import parser from "@typescript-eslint/parser";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    ignores: [
      "tests/test-results/**",
      "playwright-report/**",
      "node_modules/**",
      "public/dist/**",
    ],
  },
  {
    files: ["**/*.ts", "**/*.js"],
    languageOptions: {
      parser,
      parserOptions: { ecmaVersion: 2022, sourceType: "module" },
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2022,
      },
    },
    plugins: {
      "@typescript-eslint": ts,
    },
    rules: {
      ...ts.configs.recommended.rules,
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-undef": "error",
      "semi": ["error", "always"],
      "quotes": ["error", "single", { avoidEscape: true }],
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-var-requires": "off",
    },
  },
  {
    files: ["**/*.js"],
    languageOptions: {
      parserOptions: { ecmaVersion: 2022, sourceType: "commonjs" },
    },
    rules: {
      "no-unused-vars": "warn",
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
];
