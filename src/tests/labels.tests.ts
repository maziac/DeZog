
import * as assert from 'assert';
import { Labels, LabelsClass } from '../labels/labels';
import {Zx128MemoryModel, ZxNextMemoryModel} from '../remotes/Paging/memorymodel';
import {Z80RegistersClass} from '../remotes/z80registers';
import {Settings} from '../settings';

suite('Labels', () => {

	setup(() => {
		Labels.init(250);
	});


	suite('Files/lines vs list file', () => {

		suite('z80asm', () => {

			test('getFileAndLineForAddress', () => {
				const config = {
					z80asm: [{
						path: './src/tests/data/labels/test1.list',
						srcDirs: [""],	// Sources mode
						excludeFiles: []
					}]
				};
				Labels.readListFiles(config);

				// Checks
				let res = Labels.getFileAndLineForAddress(0x7700);
				assert.equal(res.fileName, 'main.asm', "Path wrong.");
				assert.equal(res.lineNr, 0, "Expected line wrong.");

				res = Labels.getFileAndLineForAddress(0x7710);
				assert.equal(res.fileName, 'main.asm', "Path wrong.");
				assert.equal(res.lineNr, 1, "Expected line wrong.");


				res = Labels.getFileAndLineForAddress(0x7721);
				assert.equal(res.fileName, 'main.asm', "Path wrong.");
				assert.equal(res.lineNr, 2, "Expected line wrong.");

				res = Labels.getFileAndLineForAddress(0x7721);
				assert.equal(res.fileName, 'main.asm', "Path wrong.");
				assert.equal(res.lineNr, 2, "Expected line wrong.");

				res = Labels.getFileAndLineForAddress(0x7723);
				assert.equal(res.fileName, 'main.asm', "Path wrong.");
				assert.equal(res.lineNr, 2, "Expected line wrong.");


				res = Labels.getFileAndLineForAddress(0x8820);
				assert.equal(res.fileName, 'zxspectrum.asm', "Path wrong.");
				assert.equal(res.lineNr, 2, "Expected line wrong.");

				res = Labels.getFileAndLineForAddress(0x8831);
				assert.equal(res.fileName, 'zxspectrum.asm', "Path wrong.");
				assert.equal(res.lineNr, 3, "Expected line wrong.");

				res = Labels.getFileAndLineForAddress(0x8833);
				assert.equal(res.fileName, 'zxspectrum.asm', "Path wrong.");
				assert.equal(res.lineNr, 3, "Expected line wrong.");

				res = Labels.getFileAndLineForAddress(0x8834);
				assert.equal(res.fileName, 'zxspectrum.asm', "Path wrong.");
				assert.equal(res.lineNr, 4, "Expected line wrong.");

				res = Labels.getFileAndLineForAddress(0x8837);
				assert.equal(res.fileName, 'zxspectrum.asm', "Path wrong.");
				assert.equal(res.lineNr, 6, "Expected line wrong.");


				res = Labels.getFileAndLineForAddress(0x8841);
				assert.equal(res.fileName, 'zxspectrum.asm', "Path wrong.");
				assert.equal(res.lineNr, 9, "Expected line wrong.");


				res = Labels.getFileAndLineForAddress(0x8843);
				assert.equal(res.fileName, 'main.asm', "Path wrong.");
				assert.equal(res.lineNr, 5, "Expected line wrong.");

			});


			test('getAddrForFileAndLine', () => {
				const config = {
					z80asm: [{
						path: './src/tests/data/labels/test1.list',
						srcDirs: [""],	// Sources mode
						excludeFiles: []
					}]
				};
				Labels.readListFiles(config);

				// main.asm
				let addr = Labels.getAddrForFileAndLine('main.asm', 0);
				assert.equal(addr, 0x7700, "Expected address wrong.");

				addr = Labels.getAddrForFileAndLine('main.asm', 1);
				assert.equal(addr, 0x7710, "Expected address wrong.");

				addr = Labels.getAddrForFileAndLine('main.asm', 2);
				assert.equal(addr, 0x7721, "Expected address wrong.");


				addr = Labels.getAddrForFileAndLine('zxspectrum.asm', 2);
				assert.equal(addr, 0x8820, "Expected address wrong.");

				addr = Labels.getAddrForFileAndLine('zxspectrum.asm', 4);
				assert.equal(addr, 0x8834, "Expected address wrong.");

				addr = Labels.getAddrForFileAndLine('zxspectrum.asm', 6);
				assert.equal(addr, 0x8837, "Expected address wrong.");

				addr = Labels.getAddrForFileAndLine('zxspectrum.asm', 9);
				assert.equal(addr, 0x8841, "Expected address wrong.");


				addr = Labels.getAddrForFileAndLine('main.asm', 5);
				assert.equal(addr, 0x8843, "Expected address wrong.");
			});


			test('get label values from list file', () => {
				const config = {
					z80asm: [{
						path: './src/tests/data/labels/test2.list',
						srcDirs: [""],	// Sources mode
						excludeFiles: []
					}]
				};
				Labels.readListFiles(config);

				let value = Labels.getNumberForLabel('screen_top');
				assert.equal(value, 0x6000, "Expected address wrong.");

				value = Labels.getNumberForLabel('PAUSE_TIME');
				assert.equal(value, 5000, "Expected value wrong.");

				value = Labels.getNumberForLabel('pause_loop_l2');
				assert.equal(value, 0x6004, "Expected address wrong.");

				value = Labels.getNumberForLabel('pause_loop_l1');
				assert.equal(value, 0x6006, "Expected address wrong.");

				value = Labels.getNumberForLabel('BCKG_LINE_SIZE');
				assert.equal(value, 32, "Expected value wrong.");

				value = Labels.getNumberForLabel('BLACK');
				assert.equal(value, 0, "Expected value wrong.");

				value = Labels.getNumberForLabel('MAGENTA');
				assert.equal(value, 3 << 3, "Expected address wrong.");

			});


			test('get labels for a value from list file', () => {
				const config = {
					z80asm: [{
						path: './src/tests/data/labels/test2.list',
						srcDirs: [""],	// Sources mode
						excludeFiles: []
					}]
				};
				Labels.readListFiles(config);

				let labels = Labels.getLabelsForNumber64k(0x6000);
				assert.equal(labels[0], 'screen_top', "Expected label wrong.");

				labels = Labels.getLabelsForNumber64k(0x6004);
				assert.equal(labels[0], 'pause_loop_l2', "Expected label wrong.");

				labels = Labels.getLabelsPlusIndexForNumber64k(0x6008);
				assert.equal(labels[0], 'pause_loop_l1+2', "Expected label+index wrong.");

			});


		});	// z80asm

	});


	suite('List files', () => {

		suite('z80asm', () => {

			test('z80asm.list', () => {
				const config = {
					z80asm: [{
						path: './src/tests/data/labels/z80asm.list', srcDirs: [""],	// Sources mode
						excludeFiles: []
					}]
				};
				Labels.readListFiles(config);

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
				const config = {z80asm: [{path: './src/tests/data/labels/rom.list', srcDirs: []}]};
				Labels.readListFiles(config);

				// Checks
				let res = Labels.getNumberForLabel("L0055");
				assert.equal(0x0055, res, "Label wrong.");

				res = Labels.getNumberForLabel("L022C");
				assert.equal(0x022C, res, "Label wrong.");
			});
		});


		suite('z88dk', () => {

			test('z88dk.lis', () => {
				const config = {
					z88dk: [{
						path: './src/tests/data/labels/z88dk.lis',
						mapFile: './src/tests/data/labels/z88dk_empty.map',
						srcDirs: [""],	// Sources mode
						excludeFiles: []
					}]
				};
				Labels.readListFiles(config);

				// Checks
				let res = Labels.getNumberForLabel("ct_ui_first_table");
				assert.equal(0x000B, res, "Label wrong.");

				res = Labels.getNumberForLabel("display_hor_zero_markers");
				assert.equal(0x09A7, res, "Label wrong.");

				res = Labels.getNumberForLabel("display_hor_a_address");
				assert.equal(0x09A1, res, "Label wrong.");

				// defc (=equ) is not supported
				res = Labels.getNumberForLabel("MAGENTA");
				assert.notEqual(3, res, "Label wrong.");

				// defc (=equ) is not supported
				res = Labels.getNumberForLabel("CS_ROM_VALUE");
				assert.notEqual(0xF1, res, "Label wrong.");
			});


			test('z88dk map file (currah)', () => {
				const config = {
					z88dk: [{
						path: './src/tests/data/labels/currah_uspeech_tests.lis', mapFile: './src/tests/data/labels/currah_uspeech_tests.map',
						srcDirs: [""],	// Sources mode
						excludeFiles: []
					}]
				};
				Labels.readListFiles(config);

				// Checks
				let res = Labels.getNumberForLabel("ct_input_l2");
				assert.equal(0x80A6, res, "Label wrong.");

				res = Labels.getNumberForLabel("main");
				assert.equal(0x8000, res, "Label wrong.");

				// defc (=equ) is not supported
				res = Labels.getNumberForLabel("print_number_address");
				assert.equal(undefined, res, "Label wrong.");

				res = Labels.getNumberForLabel("SCREEN_COLOR");
				assert.equal(undefined, res, "Label wrong.");
			});
		});
	});



	suite('Long Addresses', () => {

		suite('Long convertLabelsToBankSize', () => {

			/*
			|             | Target 64k | Target long |
			|-------------|------------|-------------|
			| Labels 64k  |    OK      |    OK       |
			| Labels long | Not OK 1)  | Depends 2)  |
			*/

			test('Labels64k', () => {
				const labels = new LabelsClass() as any;
				labels.init();
				assert.equal(labels.bankSize, 0);

				// Fill a few address
				labels.fileLineNrs.set(0x7FFF, {fileName: 'a.asm', lineNr: 50});
				labels.fileLineNrs.set(0xF000, {fileName: 'a.asm', lineNr: 100});

				labels.lineArrays.set('a.asm;50', [0x7FFF]);
				labels.lineArrays.set('a.asm;100', [0xF000, 0xF001]);

				// Do not convert
				labels.convertLabelsToBankSize(0);

				// Test
				assert.deepEqual(labels.fileLineNrs.get(0x7FFF), {fileName: 'a.asm', lineNr: 50});
				assert.deepEqual(labels.fileLineNrs.get(0xF000), {fileName: 'a.asm', lineNr: 100});
				assert.deepEqual(labels.lineArrays.get('a.asm;50'), [0x7FFF]);
				assert.deepEqual(labels.lineArrays.get('a.asm;100'), [0xF000, 0xF001]);
			});


			test('LabelsLong to Target64k', () => {
				const labels = new LabelsClass() as any;
				labels.init();
				labels.bankSize = 8192

				// Fill a few long address
				labels.fileLineNrs.set(0x017FFF, {fileName: 'a.asm', lineNr: 50});
				labels.fileLineNrs.set(0x02F000, {fileName: 'a.asm', lineNr: 100});

				labels.lineArrays.set('a.asm;50', [0x017FFF]);
				labels.lineArrays.set('a.asm;100', [0x02F000, 0x02F001]);

				// Convert to 64k
				labels.convertLabelsToBankSize(0);

				// Test
				assert.deepEqual(labels.fileLineNrs.get(0x7FFF), {fileName: 'a.asm', lineNr: 50});
				assert.deepEqual(labels.fileLineNrs.get(0xF000), {fileName: 'a.asm', lineNr: 100});
				assert.deepEqual(labels.lineArrays.get('a.asm;50'), [0x7FFF]);
				assert.deepEqual(labels.lineArrays.get('a.asm;100'), [0xF000, 0xF001]);

				// Test that old addresses do not exist anymore
				assert.equal(labels.fileLineNrs.size, 2);
				assert.equal(labels.lineArrays.size, 2);
			});

			test('LabelsLong (16384) to TargetLong (8192)', () => {
				const labels = new LabelsClass() as any;
				labels.init();
				labels.bankSize = 16384

				// Is used during conversion (Z80Registers.getBankFromAddress)
				Settings.Init({} as any, '');
				Z80RegistersClass.createRegisters();
				const memMdl = new ZxNextMemoryModel();
				memMdl.init();
				const targetBankSize = memMdl.getBankSize();
				assert.equal(targetBankSize, 8192);

				// Fill a few long address
				labels.fileLineNrs.set(0x027FFF, {fileName: 'a.asm', lineNr: 50});
				labels.fileLineNrs.set(0x038001, {fileName: 'a.asm', lineNr: 75});
				labels.fileLineNrs.set(0x04F000, {fileName: 'a.asm', lineNr: 100});

				labels.lineArrays.set('a.asm;50', [0x027FFF]);
				labels.lineArrays.set('a.asm;75', [0x038001]);
				labels.lineArrays.set('a.asm;100', [0x04F000, 0x04F001]);

				// Convert 16k to 8k
				labels.convertLabelsToBankSize(8192);

				// Test
				assert.deepEqual(labels.fileLineNrs.get(0x037FFF), {fileName: 'a.asm', lineNr: 50});
				assert.deepEqual(labels.fileLineNrs.get(0x058001), {fileName: 'a.asm', lineNr: 75});
				assert.deepEqual(labels.fileLineNrs.get(0x07F000), {fileName: 'a.asm', lineNr: 100});
				assert.deepEqual(labels.lineArrays.get('a.asm;50'), [0x037FFF]);
				assert.deepEqual(labels.lineArrays.get('a.asm;75'), [0x058001]);
				assert.deepEqual(labels.lineArrays.get('a.asm;100'), [0x07F000, 0x07F001]);

				// Test that size of tables have not changed
				assert.equal(labels.fileLineNrs.size, 3);
				assert.equal(labels.lineArrays.size, 3);
			});

			test('LabelsLong (8192) to TargetLong (16384)', () => {
				const labels = new LabelsClass() as any;
				labels.init();
				labels.bankSize = 8192

				// Is used during conversion (Z80Registers.getBankFromAddress)
				Settings.Init({} as any, '');
				Z80RegistersClass.createRegisters();
				const memMdl = new Zx128MemoryModel();
				memMdl.init();
				const targetBankSize = memMdl.getBankSize();
				assert.equal(targetBankSize, 16384);

				// Fill a few long address
				labels.fileLineNrs.set(0x037FFF, {fileName: 'a.asm', lineNr: 50});
				labels.fileLineNrs.set(0x058001, {fileName: 'a.asm', lineNr: 75});
				labels.fileLineNrs.set(0x07F000, {fileName: 'a.asm', lineNr: 100});

				labels.lineArrays.set('a.asm;50', [0x037FFF]);
				labels.lineArrays.set('a.asm;75', [0x058001]);
				labels.lineArrays.set('a.asm;100', [0x07F000, 0x07F001]);

				// Convert to 8k to 16k (maybe no real use case)
				labels.convertLabelsToBankSize(16384);

				// Test
				assert.deepEqual(labels.fileLineNrs.get(0x027FFF), {fileName: 'a.asm', lineNr: 50});
				assert.deepEqual(labels.fileLineNrs.get(0x038001), {fileName: 'a.asm', lineNr: 75});
				assert.deepEqual(labels.fileLineNrs.get(0x04F000), {fileName: 'a.asm', lineNr: 100});
				assert.deepEqual(labels.lineArrays.get('a.asm;50'), [0x027FFF]);
				assert.deepEqual(labels.lineArrays.get('a.asm;75'), [0x038001]);
				assert.deepEqual(labels.lineArrays.get('a.asm;100'), [0x04F000, 0x04F001]);

				// Test that size of tables have not changed
				assert.equal(labels.fileLineNrs.size, 3);
				assert.equal(labels.lineArrays.size, 3);
			});

		});

	});

});
