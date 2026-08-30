import js from '@eslint/js';
import ts from '@typescript-eslint/eslint-plugin';
import parser from '@typescript-eslint/parser';
import globals from 'globals';
import { flatConfigs } from 'eslint-plugin-import-x';
import playwright from 'eslint-plugin-playwright';
import noOnlyTests from 'eslint-plugin-no-only-tests';
import prettierPlugin from 'eslint-plugin-prettier';
import { configs as ymlConfigs } from 'eslint-plugin-yml';

export default [
	js.configs.recommended,
        ...ymlConfigs['flat/recommended'],
	{
		ignores: [
			'tests/test-results/**',
			'playwright-report/**',
			'node_modules/**',
			'public/dist/**',
			'.kilo/**',
		],
	},
	flatConfigs.recommended,
	{
		...playwright.configs['flat/recommended'],
		files: ['**/*.ts', '**/*.js', '**/*.spec.ts', '**/*.test.ts'],
		languageOptions: {
			parser,
			parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
			globals: {
				...globals.browser,
				...globals.node,
				...globals.es2022,
			},
		},
		plugins: {
			'@typescript-eslint': ts,
			'no-only-tests': noOnlyTests,
			playwright,
			prettier: prettierPlugin,
		},
		rules: {
			...ts.configs.recommended.rules,
			'no-unused-vars': 'off',
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
			'no-undef': 'error',
			'semi': ['error', 'always'],
			'quotes': ['error', 'single', { avoidEscape: true }],
			'@typescript-eslint/no-require-imports': 'off',
			'@typescript-eslint/no-var-requires': 'off',

			'array-bracket-newline': ['error', 'consistent'],
			'arrow-body-style': ['error', 'as-needed'],
			'arrow-parens': ['error', 'as-needed'],
			'arrow-spacing': 'error',
			'brace-style': 'error',
			'camelcase': ['error', { properties: 'never', ignoreGlobals: true }],
			'comma-dangle': ['error', 'only-multiline'],
			'comma-spacing': 'error',
			'comma-style': 'error',
			'default-case': 'error',
			'default-case-last': 'error',
			'eol-last': 'error',
			'eqeqeq': ['error', 'always'],
			'prefer-arrow-callback': 'error',
			'func-call-spacing': ['error', 'never'],
			'generator-star-spacing': 'error',
			'indent': 'off',
			// import-x/extensions and import-x/no-unresolved produce false positives for TS files.
			// TypeScript handles module resolution; ESLint's resolver is not TS-aware without extra config.
			'import-x/extensions': 'off',
			'import-x/no-unresolved': 'off',
			'lines-between-class-members': ['error', 'always', { exceptAfterSingleLine: true }],
			'object-shorthand': 'error',
			'object-curly-spacing': ['error', 'always'],
			'max-len': ['error', { code: 150, ignoreStrings: true }],
			'no-console': ['error', { allow: ['info', 'error', 'warn'] }],
			'no-const-assign': 'error',
			'no-duplicate-imports': 'error',
			'no-multi-spaces': 'error',
			'no-only-tests/no-only-tests': ['error', { block: ['test', 'test.describe'], fix: true }],
			'no-return-await': 'error',
			'no-template-curly-in-string': 'error',
			'no-trailing-spaces': 'error',
			'no-useless-catch': 'error',
			'no-useless-escape': 'error',
			'no-useless-concat': 'error',
			'no-var': 'error',
			'no-whitespace-before-property': 'error',
			'playwright/no-conditional-in-test': 'off',
			'playwright/no-skipped-test': 'off',
			'playwright/no-focused-test': 'off',
			'playwright/no-wait-for-timeout': 'error',
			'prefer-const': 'error',
			'prefer-spread': 'error',
			'prefer-template': 'error',
			// require-await fires on test mock stubs that intentionally return sync values inside async fns.
			'require-await': 'error',
'sort-imports': [
			'error',
			{
				ignoreCase: false,
				ignoreDeclarationSort: false,
				ignoreMemberSort: true,
				memberSyntaxSortOrder: ['none', 'all', 'single', 'multiple'],
				allowSeparatedGroups: true,
			},
		],
		},
	},
	{
		files: ['**/*.js'],
		languageOptions: {
			parserOptions: { ecmaVersion: 2022, sourceType: 'commonjs' },
		},
		rules: {
			'no-unused-vars': 'error',
			'@typescript-eslint/no-unused-vars': 'off',
		},
	},
];
