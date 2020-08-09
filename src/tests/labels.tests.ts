
import * as assert from 'assert';
import { Labels } from '../labels/labels';
import { Settings } from '../settings';

suite('Labels', () => {

	setup(() => {
		const cfg: any = {
			remoteType: 'zrcp'
		};
		Settings.Init(cfg, '');
		Labels.init();
	});


	suite('Files/lines vs list file', () => {

		test('getFileAndLineForAddress', () => {
			Labels.loadAsmListFile('./src/tests/data/test1.list', undefined, [""], undefined, "z80asm", 0);
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
			Labels.loadAsmListFile('./src/tests/data/test1.list', undefined, [""], undefined, "z80asm", 0);
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
			Labels.loadAsmListFile('./src/tests/data/test2.list', undefined, [""], undefined, "z80asm", 0);
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
			Labels.loadAsmListFile('./src/tests/data/test2.list', undefined, [""], undefined, "z80asm", 0);
			Labels.finish();

			let labels = Labels.getLabelsForNumber(0x6000);
			assert.equal( labels[0], 'screen_top', "Expected label wrong.");

			labels = Labels.getLabelsForNumber(0x6004);
			assert.equal( labels[0], 'pause_loop_l2', "Expected label wrong.");

			labels = Labels.getLabelsPlusIndexForNumber(0x6008);
			assert.equal( labels[0], 'pause_loop_l1+2', "Expected label+index wrong.");

		});


		test('address offset', () => {
			Labels.loadAsmListFile('./src/tests/data/test2.list', undefined, [""], undefined, "z80asm", 0x1000);
			Labels.finish();

			let value = Labels.getNumberForLabel('pause_loop_l1');
			assert.equal( value, 0x7006, "Expected address wrong.");

			let labels = Labels.getLabelsPlusIndexForNumber(0x7008);
			assert.equal( labels[0], 'pause_loop_l1+2', "Expected label+index wrong.");
		});


		test('sjasmplus labels with ":"', () => {
			const labels = Labels;
			labels.loadAsmListFile('./src/tests/data/sjasm1.list', undefined, [""], undefined, "sjasmplus", 0x0000);
			labels.finish();

			let value = labels.getNumberForLabel('screen_top');
			assert.equal(0x80cb, value, "Expected address wrong.");

			value = labels.getNumberForLabel('PAUSE_TIME');
			assert.equal(5000, value, "Expected address wrong.");

			value = labels.getNumberForLabel('pause');
			assert.equal(0x80cc, value, "Expected address wrong.");

			value = labels.getNumberForLabel('pause_loop_l2');
			assert.equal(0x80cf, value, "Expected address wrong.");

			value = labels.getNumberForLabel('pause_loop_l1');
			assert.equal(0x80d1, value, "Expected address wrong.");

			value = labels.getNumberForLabel('BCKG_LINE_SIZE');
			assert.equal(32, value, "Expected address wrong.");

			value = labels.getNumberForLabel('CBLACK');
			assert.equal(0<<3, value, "Expected address wrong.");

			value = labels.getNumberForLabel('CBLUE');
			assert.equal(1<<3, value, "Expected address wrong.");

			value = labels.getNumberForLabel('CRED');
			assert.equal(2<<3, value, "Expected address wrong.");
		});


		test('sjasmplus labels without ":"', () => {
			const labels = Labels;
			labels.loadAsmListFile('./src/tests/data/sjasm2_wo_colon.list', undefined, [""], undefined, "sjasmplus", 0x0000);
			labels.finish();

			let value = labels.getNumberForLabel('screen_top');
			assert.equal(0x80cb, value, "Expected address wrong.");

			value = labels.getNumberForLabel('PAUSE_TIME');
			assert.equal(5000, value, "Expected address wrong.");

			value = labels.getNumberForLabel('pause');
			assert.equal(0x80cc, value, "Expected address wrong.");

			value = labels.getNumberForLabel('pause_loop_l2');
			assert.equal(0x80cf, value, "Expected address wrong.");

			value = labels.getNumberForLabel('pause_loop_l1');
			assert.equal(0x80d1, value, "Expected address wrong.");

			value = labels.getNumberForLabel('BCKG_LINE_SIZE');
			assert.equal(32, value, "Expected address wrong.");

			value = labels.getNumberForLabel('CBLACK');
			assert.equal(0<<3, value, "Expected address wrong.");

			value = labels.getNumberForLabel('CBLUE');
			assert.equal(1<<3, value, "Expected address wrong.");

			value = labels.getNumberForLabel('CRED');
			assert.equal(2<<3, value, "Expected address wrong.");
		});

	});


	suite('List files', () => {

		test('z80asm.list', () => {
			Labels.loadAsmListFile('./src/tests/data/z80asm.list', undefined, [""], undefined, "z80asm", 0);
			Labels.finish();

			// Checks
			let res = Labels.getNumberForLabel("check_score_for_new_ship");
			assert.equal(0x7015, res, "Label wrong.");

			res = Labels.getNumberForLabel("ltest1");
			assert.equal(0x701C, res, "Label wrong.");

			res = Labels.getNumberForLabel("SCREEN_COLOR");
			assert.equal(0x5800, res, "Label wrong.");

			res = Labels.getNumberForLabel("SCREEN_SIZE");
			assert.equal(0x1800, res, "Label wrong.");
		});

		test('rom.list', () => {
			Labels.loadAsmListFile('./src/tests/data/rom.list', undefined, [""], undefined, "z80asm", 0);
			Labels.finish();

			// Checks
			let res = Labels.getNumberForLabel("L0055");
			assert.equal(0x0055, res, "Label wrong.");

			res = Labels.getNumberForLabel("L022C");
			assert.equal(0x022C, res, "Label wrong.");
		});


		test('z88dk.lis', () => {
			Labels.loadAsmListFile('./src/tests/data/z88dk.lis', undefined, [""], undefined, "z88dk", 0);
			Labels.finish();

			// Checks
			let res=Labels.getNumberForLabel("ct_ui_first_table");
			assert.equal(0x000B, res, "Label wrong.");

			res=Labels.getNumberForLabel("display_hor_zero_markers");
			assert.equal(0x09A7, res, "Label wrong.");

			res=Labels.getNumberForLabel("display_hor_a_address");
			assert.equal(0x09A1, res, "Label wrong.");

			// defc (=equ) is not supported
			res=Labels.getNumberForLabel("MAGENTA");
			assert.notEqual(3, res, "Label wrong.");

			// defc (=equ) is not supported
			res=Labels.getNumberForLabel("CS_ROM_VALUE");
			assert.notEqual(0xF1, res, "Label wrong.");
		});

		test('z88dk map file (currah)', () => {
			Labels.loadAsmListFile('./src/tests/data/currah_uspeech_tests.lis', undefined, [""], undefined, "z88dk", 0, undefined, './src/tests/data/currah_uspeech_tests.map');
			Labels.finish();

			// Checks
			let res=Labels.getNumberForLabel("ct_input_l2");
			assert.equal(0x80A6, res, "Label wrong.");

			res=Labels.getNumberForLabel("main");
			assert.equal(0x8000, res, "Label wrong.");

			// defc (=equ) is not supported
			res=Labels.getNumberForLabel("print_number_address");
			assert.equal(undefined, res, "Label wrong.");

			res=Labels.getNumberForLabel("SCREEN_COLOR");
			assert.equal(undefined, res, "Label wrong.");
		});


	});

});

