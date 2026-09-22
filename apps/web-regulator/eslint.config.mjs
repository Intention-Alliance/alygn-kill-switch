import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

/**
 * Flat config for web-regulator (ESLint 9).
 *
 * The package previously carried no eslint.config.* file, so `eslint .`
 * exited 2 under ESLint 9 and the CI lint job failed for this workspace.
 *
 * `eslint-config-next@15.3.1` is not usable here: it is still published in
 * eslintrc format and its bundled plugin versions do not resolve under
 * ESLint 9's flat config. Rather than pin a mismatched toolchain, this
 * config lints with the TypeScript recommended set plus the React hooks
 * rules — the families that catch real defects in this app. The Next-specific
 * rule set is left to a follow-up once that toolchain is upgraded.
 */
export default tseslint.config(
	{
		ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts', '**/*.config.*'],
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		files: ['**/*.{ts,tsx,js,jsx,mjs,cjs}'],
		plugins: {
			'react-hooks': reactHooks,
		},
		languageOptions: {
			parserOptions: {
				ecmaFeatures: { jsx: true },
			},
			globals: {
				window: 'readonly',
				document: 'readonly',
				console: 'readonly',
				process: 'readonly',
				React: 'readonly',
				JSX: 'readonly',
			},
		},
		rules: {
			...reactHooks.configs.recommended.rules,
			'@typescript-eslint/no-unused-vars': [
				'warn',
				{ argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
			],
			'@typescript-eslint/no-explicit-any': 'warn',
		},
	},
)
