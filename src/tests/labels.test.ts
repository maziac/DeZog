
import assert = require('assert');
//import { Utility } from '../utility';
import { Labels } from '../labels';
import { Settings, SettingsParameters } from '../settings';

suite('Labels', () => {
	var launchCfg: SettingsParameters;

	setup( () => {
		launchCfg = {
			zhostname: "",
			zport: 10000,
			rootFolder: "",
			disassemblies: [],
			listFiles: [ {path: "", useFiles: true} ],
			labelsFiles: [""],
			disableLabelResolutionBelow: 256,
			tmpDir: "",
			topOfStack: "0x10000",
			loadSnap: "",
			startAutomatically: false,
			skipInterrupt: true,
			registerVarFormat: [ "" ],
			registerHoverFormat: [ "" ],
			labelWatchesGeneralFormat: "",
			labelWatchesByteFormat: "",
			labelWatchesWordFormat: "",
			stackVarFormat: "",
			tabSize: 4,
			trace: false,
		}
		Settings.Init(launchCfg);
	});

/*
	teardown( () => dc.stop() );
*/

	suite('Files/lines vs list file', () => {

		test('getFileAndLineForAddress', () => {
			Labels.loadAsmListFile('./src/tests/data/test1.list', true);

			// Checks
			var res = Labels.getFileAndLineForAddress(0x7700);
			assert.equal( res.fileName, 'main.asm', "Path wrong.");
			assert.equal( res.lineNr, 0, "Expected line wrong.");

			var res = Labels.getFileAndLineForAddress(0x7710);
			assert.equal( res.fileName, 'main.asm', "Path wrong.");
			assert.equal( res.lineNr, 1, "Expected line wrong.");

			var res = Labels.getFileAndLineForAddress(0x7720);
			assert.equal( res.fileName, 'main.asm', "Path wrong.");
			assert.equal( res.lineNr, 2, "Expected line wrong.");

			var res = Labels.getFileAndLineForAddress(0x7721);
			assert.equal( res.fileName, 'main.asm', "Path wrong.");
			assert.equal( res.lineNr, 2, "Expected line wrong.");

			var res = Labels.getFileAndLineForAddress(0x7724);
			assert.equal( res.fileName, 'main.asm', "Path wrong.");
			assert.equal( res.lineNr, 2, "Expected line wrong.");



			var res = Labels.getFileAndLineForAddress(0x7740);
			assert.equal( res.fileName, 'zxspectrum.asm', "Path wrong.");
			assert.equal( res.lineNr, 0, "Expected line wrong.");

			var res = Labels.getFileAndLineForAddress(0x8830);
			assert.equal( res.fileName, 'zxspectrum.asm', "Path wrong.");
			assert.equal( res.lineNr, 3, "Expected line wrong.");

			var res = Labels.getFileAndLineForAddress(0x8833);
			assert.equal( res.fileName, 'zxspectrum.asm', "Path wrong.");
			assert.equal( res.lineNr, 3, "Expected line wrong.");

			var res = Labels.getFileAndLineForAddress(0x8834);
			assert.equal( res.fileName, 'zxspectrum.asm', "Path wrong.");
			assert.equal( res.lineNr, 4, "Expected line wrong.");

			var res = Labels.getFileAndLineForAddress(0x8837);
			assert.equal( res.fileName, 'zxspectrum.asm', "Path wrong.");
			assert.equal( res.lineNr, 6, "Expected line wrong.");



			var res = Labels.getFileAndLineForAddress(0x8841);
			assert.equal( res.fileName, 'zxspectrum.asm', "Path wrong.");
			assert.equal( res.lineNr, 9, "Expected line wrong.");


			var res = Labels.getFileAndLineForAddress(0x8843);
			assert.equal( res.fileName, 'main.asm', "Path wrong.");
			assert.equal( res.lineNr, 5, "Expected line wrong.");

		});


		test('getAddrForFileAndLine', () => {
			Labels.loadAsmListFile('./src/tests/data/test1.list', true);

			// main.asm
			var addr = Labels.getAddrForFileAndLine('main.asm', 0);
			assert.equal( addr, 0x7700, "Expected address wrong.");

			addr = Labels.getAddrForFileAndLine('main.asm', 1);
			assert.equal( addr, 0x7710, "Expected address wrong.");

			addr = Labels.getAddrForFileAndLine('main.asm', 2);
			assert.equal( addr, 0x7720, "Expected address wrong.");


			addr = Labels.getAddrForFileAndLine('zxspectrum.asm', 0);
			assert.equal( addr, 0x7740, "Expected address wrong.");

			addr = Labels.getAddrForFileAndLine('zxspectrum.asm', 3);
			assert.equal( addr, 0x8830, "Expected address wrong.");

			addr = Labels.getAddrForFileAndLine('zxspectrum.asm', 4);
			assert.equal( addr, 0x8834, "Expected address wrong.");

			addr = Labels.getAddrForFileAndLine('zxspectrum.asm', 6);
			assert.equal( addr, 0x8836, "Expected address wrong.");

			addr = Labels.getAddrForFileAndLine('zxspectrum.asm', 9);
			assert.equal( addr, 0x8841, "Expected address wrong.");


			addr = Labels.getAddrForFileAndLine('main.asm', 5);
			assert.equal( addr, 0x8843, "Expected address wrong.");
		});


		test('misc getFileAndLineFromListLine', () => {
			Labels.loadAsmListFile('./src/tests/data/starwarrior.list', true);


		});

	});
});

