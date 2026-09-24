// @ts-check
import {defineConfig} from 'eslint/config';
import tseslint from 'typescript-eslint';


export default defineConfig(
	{
		ignores: ['out/**', 'node_modules/**', 'src/3rdparty/**']
	},
	{
		files: ['**/*.ts'],
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: {
				// Type information is required e.g. for 'no-floating-promises'
				projectService: true,
				tsconfigRootDir: import.meta.dirname
			}
		},
		plugins: {
			'@typescript-eslint': tseslint.plugin
		},
		rules: {
			// Promises that are neither awaited nor handled (e.g. a missing 'await')
			'@typescript-eslint/no-floating-promises': 'error',
			// Promises passed where no promise is expected (e.g. async callback for 'if' condition)
			'@typescript-eslint/no-misused-promises': 'error',

			// Taken over from the former src/tslint.json.
			// Not taken over: 'no-bitwise', 'triple-equals', 'curly', 'semicolon' and 'class-name'
			// (do not match the code base, e.g. class 'MemoryModelZX81_1k').
			'@typescript-eslint/no-unused-expressions': 'error',
			'no-var': 'error'
		}
	}
);
