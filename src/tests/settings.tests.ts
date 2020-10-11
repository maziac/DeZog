
import * as assert from 'assert';
import { Settings } from '../settings';

suite('Settings', () => {

	setup( () => {
	});

	suite('CheckSettings', () => {

		test('CheckSettings - remoteType none', () => {
			const cfgEmpty: any = {
			};
			Settings.Init(cfgEmpty, '');
			assert.throws(() => {
				Settings.CheckSettings();
			}, "Should fail without remoteType.");

			const cfg: any = {
				remoteType: 'something'
			};
			Settings.Init(cfg, '');
			assert.throws(() => {
				Settings.CheckSettings();
			}, "Should fail with wrong remoteType.");
		});


		test('CheckSettings - remoteType=zesarux', () => {
			const cfg: any = {
				remoteType: 'zrcp'
			};
			Settings.Init(cfg, '');
			assert.doesNotThrow(() => {
				Settings.CheckSettings();
			}, "Should not fail with remoteType=zesarux.");
		});


		test('CheckSettings - remoteType=zxnext', () => {
			const cfg: any={
				remoteType: 'zxnext'
			};
			Settings.Init(cfg, '');
			assert.doesNotThrow(() => {
				Settings.CheckSettings();
			}, "Should not fail with remoteType=zxnext.");
		});


		test('CheckSettings - remoteType=zsim', () => {
			const cfg: any={
				remoteType: 'zsim'
			};
			Settings.Init(cfg, '');
			assert.doesNotThrow(() => {
				Settings.CheckSettings();
			}, "Should not fail with remoteType=zsim.");
		});


		test('CheckSettings - Default', () => {
			const cfg: any = {
				remoteType: 'zrcp'
			};
			Settings.Init(cfg, '');
			assert.doesNotThrow(() => {
				Settings.CheckSettings();
			}, "Should not fail with default config.");
		});


		test('CheckSettings - listFiles 1', () => {
			const cfg: any = {
				remoteType: 'zrcp',
				sjasmplus: [
					{ path: "./src/tests/data/settings/filenotexists.list" }
				]
			};

			// File does not exist -> Exception
			Settings.Init(cfg, '');
			assert.throws(() => {
				Settings.CheckSettings();
			}, "Check failed: file does not exist.");
		});


		test('CheckSettings - listFiles 2', () => {
			const cfg: any = {
				remoteType: 'zrcp',
				sjasmplus: [
					{ path: "./src/tests/data/settings/file.list" }
				]
			};

			// File does exist -> No exception
			Settings.Init(cfg, '');
			assert.doesNotThrow(() => {
				Settings.CheckSettings();
			}, "Check failed: file does exist.");
		});


		test('CheckSettings - load 1', () => {
			const cfg: any = {
				remoteType: 'zrcp',
				load: "./src/tests/data/settings/filenotexists.sna"
			};

			// File does not exist -> Exception
			Settings.Init(cfg, '');
			assert.throws(() => {
				Settings.CheckSettings();
			}, "Check failed: file does not exist.");
		});


		test('CheckSettings - load 2', () => {
			const cfg: any = {
				remoteType: 'zrcp',
				load: "./src/tests/data/settings/file.sna"
			};

			// File does exist -> No exception
			Settings.Init(cfg, '');
			assert.doesNotThrow(() => {
				Settings.CheckSettings();
			}, "Check failed: file does exist.");
		});


		test('CheckSettings - load and execAddress', () => {
			const cfg: any = {
				remoteType: 'zrcp',
				load: "./src/tests/data/settings/file.sna",
				execAddress: "1234"
			};

			// File does exist -> No exception
			Settings.Init(cfg, '');
			assert.throws(() => {
				Settings.CheckSettings();
			}, "Check failed: There should be an exception if 'load' and 'execAddress' are used together.");
		});


		test('CheckSettings - loadObj 1', () => {
			const cfg: any = {
				remoteType: 'zrcp',
				loadObjs: [
					{ path: "./src/tests/data/settings/file1.obj", start: "1234" },
					{ path: "./src/tests/data/settings/file2notexists.obj", start: "1234" }
				]
			};

			// File 2 does not exist -> Exception
			Settings.Init(cfg, '');
			assert.throws(() => {
				Settings.CheckSettings();
			}, "Check failed: file does not exist.");
		});


		test('CheckSettings - loadObj 2', () => {
			const cfg: any = {
				remoteType: 'zrcp',
				loadObjs: [
					{ path: "./src/tests/data/settings/file1.obj", start: "1234" },
					{ path: "./src/tests/data/settings/file2.obj", start: "1234" }
				]
			};

			// File does exist -> No exception
			Settings.Init(cfg, '');
			assert.doesNotThrow(() => {
				Settings.CheckSettings();
			}, "Check failed: files do exist.");
		});



		test('CheckSettings - loadObj start', () => {
			const cfg: any = {
				remoteType: 'zrcp',
				loadObjs: [
					{ path: "./src/tests/data/settings/file1.obj", start: "1234" },
					{ path: "./src/tests/data/settings/file2.obj" }
				]
			};

			// File does exist -> No exception
			Settings.Init(cfg, '');
			assert.throws(() => {
				Settings.CheckSettings();
			}, "Check failed: 'start' should be defined.");
		});

	});
});

