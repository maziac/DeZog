
import * as assert from 'assert';
import { Settings } from '../settings';

suite('Settings', () => {

	setup( () => {
	});

/*
	teardown( () => dc.disconnect() );
*/

	suite('CheckSettings', () => {

		test('CheckSettings - Default', () => {
			Settings.Init(<any>undefined, '');
			assert.doesNotThrow(() => {
				Settings.CheckSettings();
			}, "Should not fail with default config.");
		});


		test('CheckSettings - listFiles 1', () => {
			const cfg = {
				listFiles: [
					{ path: "./src/tests/data/settings/filenotexists.list" }
				]
			};

			// File does not exist -> Exception
			Settings.Init(cfg as any, '');
			assert.throws(() => {
				Settings.CheckSettings();
			}, "Check failed: file does not exist.");
		});


		test('CheckSettings - listFiles 2', () => {
			const cfg = {
				listFiles: [
					{ path: "./src/tests/data/settings/file.list" }
				]
			};

			// File does exist -> No exception
			Settings.Init(cfg as any, '');
			assert.doesNotThrow(() => {
				Settings.CheckSettings();
			}, "Check failed: file does exist.");
		});


		test('CheckSettings - load 1', () => {
			const cfg = {
				load: "./src/tests/data/settings/filenotexists.sna"
			};

			// File does not exist -> Exception
			Settings.Init(cfg as any, '');
			assert.throws(() => {
				Settings.CheckSettings();
			}, "Check failed: file does not exist.");
		});


		test('CheckSettings - load 2', () => {
			const cfg = {
				load: "./src/tests/data/settings/file.sna"
			};

			// File does exist -> No exception
			Settings.Init(cfg as any, '');
			assert.doesNotThrow(() => {
				Settings.CheckSettings();
			}, "Check failed: file does exist.");
		});


		test('CheckSettings - load and execAddress', () => {
			const cfg = {
				load: "./src/tests/data/settings/file.sna",
				execAddress: "1234"
			};

			// File does exist -> No exception
			Settings.Init(cfg as any, '');
			assert.throws(() => {
				Settings.CheckSettings();
			}, "Check failed: There should be an exception if 'load' and 'execAddress' are used together.");
		});


		test('CheckSettings - loadObj 1', () => {
			const cfg = {
				loadObjs: [
					{ path: "./src/tests/data/settings/file1.obj", start: "1234" },
					{ path: "./src/tests/data/settings/file2notexists.obj", start: "1234" }
				]
			};

			// File 2 does not exist -> Exception
			Settings.Init(cfg as any, '');
			assert.throws(() => {
				Settings.CheckSettings();
			}, "Check failed: file does not exist.");
		});


		test('CheckSettings - loadObj 2', () => {
			const cfg = {
				loadObjs: [
					{ path: "./src/tests/data/settings/file1.obj", start: "1234" },
					{ path: "./src/tests/data/settings/file2.obj", start: "1234" }
				]
			};

			// File does exist -> No exception
			Settings.Init(cfg as any, '');
			assert.doesNotThrow(() => {
				Settings.CheckSettings();
			}, "Check failed: files do exist.");
		});



		test('CheckSettings - loadObj start', () => {
			const cfg = {
				loadObjs: [
					{ path: "./src/tests/data/settings/file1.obj", start: "1234" },
					{ path: "./src/tests/data/settings/file2.obj" }
				]
			};

			// File does exist -> No exception
			Settings.Init(cfg as any, '');
			assert.throws(() => {
				Settings.CheckSettings();
			}, "Check failed: 'start' should be defined.");
		});

	});
});

