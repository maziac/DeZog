
import * as assert from 'assert';
import {suite, test} from 'mocha';
import {WorkspacePaths} from '../src/misc/workspacepaths';


suite('WorkspacePaths', () => {

	suite('getRelFilePath', () => {
		suite('unix', () => {
			test('rootpath part of file path', () => {
				WorkspacePaths.setRootPath('/abc');
				assert.equal(WorkspacePaths.getRelFilePath('/abc/file'), 'file');

				WorkspacePaths.setRootPath('/');
				assert.equal(WorkspacePaths.getRelFilePath('/abc/file'), 'abc/file');

				WorkspacePaths.setRootPath('/abc/def');
				assert.equal(WorkspacePaths.getRelFilePath('/abc/def/file'), 'file');

				WorkspacePaths.setRootPath('/abc/def/');
				assert.equal(WorkspacePaths.getRelFilePath('/abc/def/file'), 'file');
			});

			test('..', () => {
				WorkspacePaths.setRootPath('/abcd');
				assert.equal(WorkspacePaths.getRelFilePath('/abc/file'), '../abc/file');

				WorkspacePaths.setRootPath('/abc/def/ghi');
				assert.equal(WorkspacePaths.getRelFilePath('/abc/file'), '../../file');
			});
		});

		suite('windows', () => {
			test('rootpath part of file path', () => {
				WorkspacePaths.setRootPath('c:/abc');
				assert.equal(WorkspacePaths.getRelFilePath('c:/abc/file'), 'file');

				WorkspacePaths.setRootPath('c:/');
				assert.equal(WorkspacePaths.getRelFilePath('c:/abc/file'), 'abc/file');

				WorkspacePaths.setRootPath('c:');
				assert.equal(WorkspacePaths.getRelFilePath('c:/abc/file'), 'abc/file');

				WorkspacePaths.setRootPath('c:/abc/def');
				assert.equal(WorkspacePaths.getRelFilePath('c:/abc/def/file'), 'file');

				WorkspacePaths.setRootPath('c:/abc/def/');
				assert.equal(WorkspacePaths.getRelFilePath('c:/abc/def/file'), 'file');
			});

			test('..', () => {
				WorkspacePaths.setRootPath('c:/abcd');
				assert.equal(WorkspacePaths.getRelFilePath('c:/abc/file'), '../abc/file');

				WorkspacePaths.setRootPath('c:/abc/def/ghi');
				assert.equal(WorkspacePaths.getRelFilePath('c:/abc/file'), '../../file');
			});

			test('mixed drive letters', () => {
				WorkspacePaths.setRootPath('c:/abcd');
				assert.equal(WorkspacePaths.getRelFilePath('C:/abc/file'), '../abc/file');

				WorkspacePaths.setRootPath('C:/abc/def/');
				assert.equal(WorkspacePaths.getRelFilePath('c:/abc/def/file'), 'file');
			});
		});
	});


	suite('escapePathForGlob', () => {
		test('escape special characters', () => {
			const input = 'path/to/[file]*.js';
			const expected = 'path/to/\\[file\\]\\*.js';
			const result = WorkspacePaths.escapePathForGlob(input);
			assert.equal(result, expected, `Expected "${expected}" but got "${result}"`);
		});

		test('no special characters', () => {
			const input = 'path/to/file.js';
			const expected = 'path/to/file.js';
			const result = WorkspacePaths.escapePathForGlob(input);
			assert.equal(result, expected, `Expected "${expected}" but got "${result}"`);
		});

		test('empty string', () => {
			const input = '';
			const expected = '';
			const result = WorkspacePaths.escapePathForGlob(input);
			assert.equal(result, expected, `Expected "${expected}" but got "${result}"`);
		});

		test('only special characters', () => {
			const input = '*?[]{}()!';
			const expected = '\\*\\?\\[\\]\\{\\}\\(\\)\\!';
			const result = WorkspacePaths.escapePathForGlob(input);
			assert.equal(result, expected, `Expected "${expected}" but got "${result}"`);
		});
	});
});
