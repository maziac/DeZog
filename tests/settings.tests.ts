
import * as assert from 'assert';
import { Settings } from '../src/settings/settings';

suite('Settings', () => {

	suite('CheckSettings', () => {

		test('remoteType none', () => {
			const cfgEmpty: any = {
			};
			Settings.launch = Settings.Init(cfgEmpty);
			assert.throws(() => {
				Settings.CheckSettings();
			}, "Should fail without remoteType.");

			const cfg: any = {
				remoteType: 'something'
			};
			Settings.launch = Settings.Init(cfg);
			assert.throws(() => {
				Settings.CheckSettings();
			}, "Should fail with wrong remoteType.");
		});


		test('remoteType=zesarux', () => {
			const cfg: any = {
				remoteType: 'zrcp',
				rootFolder: './tests/data',
			};
			Settings.launch = Settings.Init(cfg);
			assert.doesNotThrow(() => {
				Settings.CheckSettings();
			}, "Should not fail with remoteType=zesarux.");
		});



		suite('remoteType=zxnext', () => {

			test('empty', () => {
				const cfg: any = {
					remoteType: 'zxnext',
					rootFolder: './tests/data',
				};
				Settings.launch = Settings.Init(cfg);
				assert.throws(() => {
					Settings.CheckSettings();
				}, "Should fail with remoteType=zxnext and serial not set.");
			});

			test('serial', () => {
				const cfg: any = {
					remoteType: 'zxnext',
					zxnext: {
						serial: 'COM8'
					},
					rootFolder: './tests/data',
				};
				Settings.launch = Settings.Init(cfg);
				assert.doesNotThrow(() => {
					Settings.CheckSettings();
				}, "Should not fail with remoteType=zxnext.");
			});

			test('hostname obsolete', () => {
				const cfg: any = {
					remoteType: 'zxnext',
					zxnext: {
						serial: 'COM8',
						hostname: 'hname'
					},
					rootFolder: './tests/data',
				};
				Settings.launch = Settings.Init(cfg);
				assert.throws(() => {
					Settings.CheckSettings();
				}, "Should fail with remoteType=zxnext and old parameters used.");
			});

			test('port obsolete', () => {
				const cfg: any = {
					remoteType: 'zxnext',
					zxnext: {
						serial: 'COM8',
						port: 'port'
					},
					rootFolder: './tests/data',
				};
				Settings.launch = Settings.Init(cfg);
				assert.throws(() => {
					Settings.CheckSettings();
				}, "Should fail with remoteType=zxnext and old parameters used.");
			});

			test('socketTimeout obsolete', () => {
				const cfg: any = {
					remoteType: 'zxnext',
					zxnext: {
						serial: 'COM8',
						socketTimeout: 500
					},
					rootFolder: './tests/data',
				};
				Settings.launch = Settings.Init(cfg);
				assert.throws(() => {
					Settings.CheckSettings();
				}, "Should fail with remoteType=zxnext and old parameters used.");
			});

		});


		test('remoteType=zsim', () => {
			const cfg: any={
				remoteType: 'zsim',
				rootFolder: './tests/data',
			};
			Settings.launch = Settings.Init(cfg);
			assert.doesNotThrow(() => {
				Settings.CheckSettings();
			}, "Should not fail with remoteType=zsim.");
		});


		test('Default', () => {
			const cfg: any = {
				remoteType: 'zrcp',
				rootFolder: './tests/data',
			};
			Settings.launch = Settings.Init(cfg);
			assert.doesNotThrow(() => {
				Settings.CheckSettings();
			}, "Should not fail with default config.");
		});


		test('No rootFolder', () => {
			const cfg: any = {
				remoteType: 'zrcp',
				sjasmplus: [
					{path: "./tests/data/settings/file.list"}
				]
			};
			Settings.launch = Settings.Init(cfg);
			assert.throws(() => {
				Settings.CheckSettings();
			}, "Exception expected (because no rootFolder given).");
		});


		test('listFiles 1', () => {
			const cfg: any = {
				remoteType: 'zrcp',
				rootFolder: './tests/data',
				sjasmplus: [
					{ path: "./settings/filenotexists.list" }
				]
			};

			// File does not exist -> Exception
			Settings.launch = Settings.Init(cfg);
			assert.throws(() => {
				Settings.CheckSettings();
			}, "Check failed: file does not exist.");
		});


		test('listFiles 2', () => {
			const cfg: any = {
				remoteType: 'zrcp',
				rootFolder: './tests/data',
				sjasmplus: [
					{ path: "./settings/file.list" }
				]
			};

			// File does exist -> No exception
			Settings.launch = Settings.Init(cfg);
			assert.doesNotThrow(() => {
				Settings.CheckSettings();
			}, "Check failed: file does exist.");
		});


		test('load 1', () => {
			const cfg: any = {
				remoteType: 'zrcp',
				rootFolder: './tests/data',
				load: "./settings/filenotexists.sna"
			};

			// File does not exist -> Exception
			Settings.launch = Settings.Init(cfg);
			assert.throws(() => {
				Settings.CheckSettings();
			}, "Check failed: file does not exist.");
		});


		test('load 2', () => {
			const cfg: any = {
				remoteType: 'zrcp',
				rootFolder: './tests/data',
				load: "./settings/file.sna"
			};

			// File does exist -> No exception
			Settings.launch = Settings.Init(cfg);
			assert.doesNotThrow(() => {
				Settings.CheckSettings();
			}, "Check failed: file does exist.");
		});


		test('load and execAddress', () => {
			const cfg: any = {
				remoteType: 'zrcp',
				rootFolder: './tests/data',
				load: "./settings/file.sna",
				execAddress: "1234"
			};

			// File does exist -> No exception
			Settings.launch = Settings.Init(cfg);
			assert.throws(() => {
				Settings.CheckSettings();
			}, "Check failed: There should be an exception if 'load' and 'execAddress' are used together.");
		});


		test('loadObj 1', () => {
			const cfg: any = {
				remoteType: 'zrcp',
				rootFolder: './tests/data',
				loadObjs: [
					{ path: "./settings/file1.obj", start: "1234" },
					{ path: "./settings/file2notexists.obj", start: "1234" }
				]
			};

			// File 2 does not exist -> Exception
			Settings.launch = Settings.Init(cfg);
			assert.throws(() => {
				Settings.CheckSettings();
			}, "Check failed: file does not exist.");
		});


		test('loadObj 2', () => {
			const cfg: any = {
				remoteType: 'zrcp',
				rootFolder: './tests/data',
				loadObjs: [
					{ path: "./settings/file1.obj", start: "1234" },
					{ path: "./settings/file2.obj", start: "1234" }
				]
			};

			// File does exist -> No exception
			Settings.launch = Settings.Init(cfg);
			assert.doesNotThrow(() => {
				Settings.CheckSettings();
			}, "Check failed: files do exist.");
		});



		test('loadObj start', () => {
			const cfg: any = {
				remoteType: 'zrcp',
				rootFolder: './tests/data',
				loadObjs: [
					{ path: "./settings/file1.obj", start: "1234" },
					{ path: "./settings/file2.obj" }
				]
			};

			// File does exist -> No exception
			Settings.launch = Settings.Init(cfg);
			assert.throws(() => {
				Settings.CheckSettings();
			}, "Check failed: 'start' should be defined.");
		});

	});


	suite('Init', () => {
		suite('paths escaped for globbing', () => {

			test('sjasmplus', () => {
				const cfg: any = {
					rootFolder: 'abc/*_[_]_(_)_!_?_/def',
					sjasmplus: [
						{path: "settings/file*.obj"}
					]
				};
				Settings.launch = Settings.Init(cfg);
				assert.strictEqual(Settings.launch.sjasmplus[0].path, "abc/\\*_\\[_\\]_\\(_\\)_\\!_\\?_/def/settings/file*.obj");
			});

			test('z80asm', () => {
				const cfg: any = {
					rootFolder: 'abc/*_[_]_(_)_!_?_/def',
					z80asm: [
						{path: "settings/file*.obj"}
					]
				};
				Settings.launch = Settings.Init(cfg);
				assert.strictEqual(Settings.launch.z80asm[0].path, "abc/\\*_\\[_\\]_\\(_\\)_\\!_\\?_/def/settings/file*.obj");
			});

			test('z88dk', () => {
				const cfg: any = {
					rootFolder: 'abc/*_[_]_(_)_!_?_/def',
					z88dk: [
						{path: "settings/file*.obj"}
					]
				};
				Settings.launch = Settings.Init(cfg);
				assert.strictEqual(Settings.launch.z88dk[0].path, "abc/\\*_\\[_\\]_\\(_\\)_\\!_\\?_/def/settings/file*.obj");
			});

			test('z88dkv2', () => {
				const cfg: any = {
					rootFolder: 'abc/*_[_]_(_)_!_?_/def',
					z88dkv2: [
						{path: "settings/file*.obj"}
					]
				};
				Settings.launch = Settings.Init(cfg);
				assert.strictEqual(Settings.launch.z88dkv2[0].path, "abc/\\*_\\[_\\]_\\(_\\)_\\!_\\?_/def/settings/file*.obj");
			});

			test('sjasmplus', () => {
				const cfg: any = {
					rootFolder: 'abc/*_[_]_(_)_!_?_/def',
					revEng: [
						{path: "settings/file*.obj"}
					]
				};
				Settings.launch = Settings.Init(cfg);
				assert.strictEqual(Settings.launch.revEng[0].path, "abc/\\*_\\[_\\]_\\(_\\)_\\!_\\?_/def/settings/file*.obj");
			});
		});
	});

});

