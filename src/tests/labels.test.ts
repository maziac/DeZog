
import * as assert from 'assert';
import { Labels } from '../labels';
import { Settings } from '../settings';

suite('Labels', () => {

	setup( () => {
		Settings.Init(<any>undefined, '');
	});

/*
	teardown( () => dc.stop() );
*/

	suite('Files/lines vs list file', () => {

		test('getFileAndLineForAddress', () => {
			Labels.loadAsmListFile('./src/tests/data/test1.list', [""], undefined, "z80asm", 0);
			Labels.finish();

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
			Labels.loadAsmListFile('./src/tests/data/test1.list', [""], undefined, "z80asm", 0);
			Labels.finish();

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


		test('get label values from list file', () => {
			Labels.loadAsmListFile('./src/tests/data/test2.list', [""], undefined, "z80asm", 0);
			Labels.finish();

			let value = Labels.getNumberForLabel('screen_top');
			assert.equal( value, 0x6000, "Expected address wrong.");

			value = Labels.getNumberForLabel('PAUSE_TIME');
			assert.equal( value, 5000, "Expected value wrong.");

			value = Labels.getNumberForLabel('pause_loop_l2');
			assert.equal( value, 0x6004, "Expected address wrong.");

			value = Labels.getNumberForLabel('pause_loop_l1');
			assert.equal( value, 0x6006, "Expected address wrong.");

			value = Labels.getNumberForLabel('BCKG_LINE_SIZE');
			assert.equal( value, 32, "Expected value wrong.");

			value = Labels.getNumberForLabel('BLACK');
			assert.equal( value, 0, "Expected value wrong.");

			value = Labels.getNumberForLabel('MAGENTA');
			assert.equal( value, 3<<3, "Expected address wrong.");

		});


		test('get labels for a value from list file', () => {
			Labels.loadAsmListFile('./src/tests/data/test2.list', [""], undefined, "z80asm", 0);
			Labels.finish();

			let labels = Labels.getLabelsForNumber(0x6000);
			assert.equal( labels[0], 'screen_top', "Expected label wrong.");

			labels = Labels.getLabelsForNumber(0x6004);
			assert.equal( labels[0], 'pause_loop_l2', "Expected label wrong.");

			labels = Labels.getLabelsPlusIndexForNumber(0x6008);
			assert.equal( labels[0], 'pause_loop_l1+2', "Expected label+index wrong.");

		});


		test('address offset', () => {
			Labels.loadAsmListFile('./src/tests/data/test2.list', [""], undefined, "z80asm", 0x1000);
			Labels.finish();

			let value = Labels.getNumberForLabel('pause_loop_l1');
			assert.equal( value, 0x7006, "Expected address wrong.");

			let labels = Labels.getLabelsPlusIndexForNumber(0x7008);
			assert.equal( labels[0], 'pause_loop_l1+2', "Expected label+index wrong.");
		});

	});
});

