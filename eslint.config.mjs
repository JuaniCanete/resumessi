import js from "@eslint/js";
import ts from "@typescript-eslint/eslint-plugin";
import parser from "@typescript-eslint/parser";
import globals from "globals";
import importPlugin from "eslint-plugin-import-x";
import playwright from "eslint-plugin-playwright";
import noOnlyTests from "eslint-plugin-no-only-tests";
import prettierPlugin from "eslint-plugin-prettier";

// TODO (post-migration): Change all "warn" rules below to "error" once full repo is formatted.
// Run: npx prettier --write . && npm run lint -- --fix
// Then update rule severities in this file.

export default [
  js.configs.recommended,
  {
    ignores: [
      "tests/test-results/**",
      "playwright-report/**",
      "node_modules/**",
      "public/dist/**",
      ".kilo/**",
    ],
  },
  importPlugin.flatConfigs.recommended,
  {
    ...playwright.configs["flat/recommended"],
    files: ["**/*.ts", "**/*.js", "**/*.spec.ts", "**/*.test.ts"],
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
      "no-only-tests": noOnlyTests,
      playwright,
      prettier: prettierPlugin,
    },
    rules: {
      ...ts.configs.recommended.rules,
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-undef": "error",
      "semi": ["error", "always"],
      "quotes": ["error", "single", { avoidEscape: true }],
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-var-requires": "off",

      // --- ADOPTED FROM REFERENCE (progressive: warn first) ---
      "array-bracket-newline": ["warn", "consistent"],
      "arrow-body-style": ["warn", "as-needed"],
      "arrow-parens": ["warn", "as-needed"],
      "arrow-spacing": "warn",
      "brace-style": "warn",
      "camelcase": ["warn", { properties: "never", ignoreGlobals: true }],
      "comma-dangle": ["warn", "only-multiline"],
      "comma-spacing": "warn",
      "comma-style": "warn",
      "default-case": "warn",
      "default-case-last": "warn",
      "eol-last": "warn",
      "eqeqeq": ["warn", "always"],
      "prefer-arrow-callback": "warn",
      "func-call-spacing": ["warn", "never"],
      "generator-star-spacing": "warn",
      "indent": "off",
      "import-x/extensions": ["warn", "ignorePackages", { js: "always", ts: "never", tsx: "never" }],
      "import-x/no-unresolved": "warn",
      "lines-between-class-members": ["warn", "always", { exceptAfterSingleLine: true }],
      "object-shorthand": "warn",
      "object-curly-spacing": ["warn", "always"],
      "max-len": ["warn", { code: 120, ignoreStrings: true }],
      "no-console": ["warn", { allow: ["info", "error", "warn"] }],
      "no-const-assign": "warn",
      "no-duplicate-imports": "warn",
      "no-multi-spaces": "warn",
      "no-only-tests/no-only-tests": ["error", { block: ["test", "test.describe"], fix: true }],
      "no-return-await": "warn",
      "no-template-curly-in-string": "warn",
      "no-trailing-spaces": "warn",
      "no-useless-catch": "warn",
      "no-useless-escape": "warn",
      "no-useless-concat": "warn",
      "no-var": "warn",
      "no-whitespace-before-property": "warn",
      "playwright/no-conditional-in-test": "off",
      "playwright/no-skipped-test": "off",
      "playwright/no-focused-test": "off",
      "playwright/no-wait-for-timeout": "warn",
      "prefer-const": "warn",
      "prefer-spread": "warn",
      "prefer-template": "warn",
      "require-await": "warn",
"sort-imports": ["warn", { ignoreCase: false, ignoreDeclarationSort: false, ignoreMemberSort: true, memberSyntaxSortOrder: ["none", "all", "single", "multiple"], allowSeparatedGroups: true }],
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