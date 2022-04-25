import * as assert from 'assert';
import {LabelsClass} from '../src/labels/labels';
import {Zx128MemoryModel, ZxNextMemoryModel} from '../src/remotes/Paging/memorymodel';
import {Z80RegistersClass} from '../src/remotes/z80registers';
import {Settings} from '../src/settings';

suite('Labels', () => {

	suite('Files/lines vs list file', () => {

		suite('z80asm', () => {

			test('getFileAndLineForAddress', () => {
				const config = {
					z80asm: [{
						path: './tests/data/labels/test1.list',
						srcDirs: [""],	// Sources mode
						excludeFiles: []
					}]
				};
				const lbls = new LabelsClass();
				lbls.readListFiles(config);

				// Checks
				let res = lbls.getFileAndLineForAddress(0x7700);
				assert.equal(res.fileName, 'main.asm', "Path wrong.");
				assert.equal(res.lineNr, 0, "Expected line wrong.");

				res = lbls.getFileAndLineForAddress(0x7710);
				assert.equal(res.fileName, 'main.asm', "Path wrong.");
				assert.equal(res.lineNr, 1, "Expected line wrong.");


				res = lbls.getFileAndLineForAddress(0x7721);
				assert.equal(res.fileName, 'main.asm', "Path wrong.");
				assert.equal(res.lineNr, 2, "Expected line wrong.");

				res = lbls.getFileAndLineForAddress(0x7721);
				assert.equal(res.fileName, 'main.asm', "Path wrong.");
				assert.equal(res.lineNr, 2, "Expected line wrong.");

				res = lbls.getFileAndLineForAddress(0x7723);
				assert.equal(res.fileName, 'main.asm', "Path wrong.");
				assert.equal(res.lineNr, 2, "Expected line wrong.");


				res = lbls.getFileAndLineForAddress(0x8820);
				assert.equal(res.fileName, 'zxspectrum.asm', "Path wrong.");
				assert.equal(res.lineNr, 2, "Expected line wrong.");

				res = lbls.getFileAndLineForAddress(0x8831);
				assert.equal(res.fileName, 'zxspectrum.asm', "Path wrong.");
				assert.equal(res.lineNr, 3, "Expected line wrong.");

				res = lbls.getFileAndLineForAddress(0x8833);
				assert.equal(res.fileName, 'zxspectrum.asm', "Path wrong.");
				assert.equal(res.lineNr, 3, "Expected line wrong.");

				res = lbls.getFileAndLineForAddress(0x8834);
				assert.equal(res.fileName, 'zxspectrum.asm', "Path wrong.");
				assert.equal(res.lineNr, 4, "Expected line wrong.");

				res = lbls.getFileAndLineForAddress(0x8837);
				assert.equal(res.fileName, 'zxspectrum.asm', "Path wrong.");
				assert.equal(res.lineNr, 6, "Expected line wrong.");


				res = lbls.getFileAndLineForAddress(0x8841);
				assert.equal(res.fileName, 'zxspectrum.asm', "Path wrong.");
				assert.equal(res.lineNr, 9, "Expected line wrong.");


				res = lbls.getFileAndLineForAddress(0x8843);
				assert.equal(res.fileName, 'main.asm', "Path wrong.");
				assert.equal(res.lineNr, 5, "Expected line wrong.");

			});


			test('getAddrForFileAndLine', () => {
				const config = {
					z80asm: [{
						path: './tests/data/labels/test1.list',
						srcDirs: [""],	// Sources mode
						excludeFiles: []
					}]
				};
				const labels = new LabelsClass();
				labels.readListFiles(config);

				// main.asm
				let addr = labels.getAddrForFileAndLine('main.asm', 0);
				assert.equal(addr, 0x7700, "Expected address wrong.");

				addr = labels.getAddrForFileAndLine('main.asm', 1);
				assert.equal(addr, 0x7710, "Expected address wrong.");

				addr = labels.getAddrForFileAndLine('main.asm', 2);
				assert.equal(addr, 0x7721, "Expected address wrong.");


				addr = labels.getAddrForFileAndLine('zxspectrum.asm', 2);
				assert.equal(addr, 0x8820, "Expected address wrong.");

				addr = labels.getAddrForFileAndLine('zxspectrum.asm', 4);
				assert.equal(addr, 0x8834, "Expected address wrong.");

				addr = labels.getAddrForFileAndLine('zxspectrum.asm', 6);
				assert.equal(addr, 0x8837, "Expected address wrong.");

				addr = labels.getAddrForFileAndLine('zxspectrum.asm', 9);
				assert.equal(addr, 0x8841, "Expected address wrong.");


				addr = labels.getAddrForFileAndLine('main.asm', 5);
				assert.equal(addr, 0x8843, "Expected address wrong.");
			});


			test('get label values from list file', () => {
				const config = {
					z80asm: [{
						path: './tests/data/labels/test2.list',
						srcDirs: [""],	// Sources mode
						excludeFiles: []
					}]
				};
				const labels = new LabelsClass();
				labels.readListFiles(config);

				let value = labels.getNumberForLabel('screen_top');
				assert.equal(value, 0x6000, "Expected address wrong.");

				value = labels.getNumberForLabel('PAUSE_TIME');
				assert.equal(value, 5000, "Expected value wrong.");

				value = labels.getNumberForLabel('pause_loop_l2');
				assert.equal(value, 0x6004, "Expected address wrong.");

				value = labels.getNumberForLabel('pause_loop_l1');
				assert.equal(value, 0x6006, "Expected address wrong.");

				value = labels.getNumberForLabel('BCKG_LINE_SIZE');
				assert.equal(value, 32, "Expected value wrong.");

				value = labels.getNumberForLabel('BLACK');
				assert.equal(value, 0, "Expected value wrong.");

				value = labels.getNumberForLabel('MAGENTA');
				assert.equal(value, 3 << 3, "Expected address wrong.");	// NOSONAR

			});


			test('get labels for a value from list file', () => {
				const config = {
					z80asm: [{
						path: './tests/data/labels/test2.list',
						srcDirs: [""],	// Sources mode
						excludeFiles: []
					}]
				};
				const lbls = new LabelsClass();
				lbls.readListFiles(config);

				let labels = lbls.getLabelsForNumber64k(0x6000);
				assert.equal(labels[0], 'screen_top', "Expected label wrong.");

				labels = lbls.getLabelsForNumber64k(0x6004);
				assert.equal(labels[0], 'pause_loop_l2', "Expected label wrong.");

				labels = lbls.getLabelsPlusIndexForNumber64k(0x6008);
				assert.equal(labels[0], 'pause_loop_l1+2', "Expected label+index wrong.");

			});


		});	// z80asm

	});


	suite('List files', () => {

		suite('z80asm', () => {

			test('z80asm.list', () => {
				const config = {
					z80asm: [{
						path: './tests/data/labels/z80asm.list', srcDirs: [""],	// Sources mode
						excludeFiles: []
					}]
				};
				const labels = new LabelsClass();
				labels.readListFiles(config);

				// Checks
				let res = labels.getNumberForLabel("check_score_for_new_ship");
				assert.equal(0x7015, res, "Label wrong.");

				res = labels.getNumberForLabel("ltest1");
				assert.equal(0x701C, res, "Label wrong.");

				res = labels.getNumberForLabel("SCREEN_COLOR");
				assert.equal(0x5800, res, "Label wrong.");

				res = labels.getNumberForLabel("SCREEN_SIZE");
				assert.equal(0x1800, res, "Label wrong.");
			});

			test('rom.list', () => {
				const config = {z80asm: [{path: './tests/data/labels/rom.list', srcDirs: []}]};
				const labels = new LabelsClass();
				labels.readListFiles(config);

				// Checks
				let res = labels.getNumberForLabel("L0055");
				assert.equal(0x0055, res, "Label wrong.");

				res = labels.getNumberForLabel("L022C");
				assert.equal(0x022C, res, "Label wrong.");
			});
		});


		suite('z88dk', () => {

			test('z88dk.lis', () => {
				const config = {
					z88dk: [{
						path: './tests/data/labels/z88dk.lis',
						mapFile: './tests/data/labels/z88dk_empty.map',
						srcDirs: [""],	// Sources mode
						excludeFiles: []
					}]
				};
				const labels = new LabelsClass();
				labels.readListFiles(config);

				// Checks
				let res = labels.getNumberForLabel("ct_ui_first_table");
				assert.equal(0x000B, res, "Label wrong.");

				res = labels.getNumberForLabel("display_hor_zero_markers");
				assert.equal(0x09A7, res, "Label wrong.");

				res = labels.getNumberForLabel("display_hor_a_address");
				assert.equal(0x09A1, res, "Label wrong.");

				// defc (=equ) is not supported
				res = labels.getNumberForLabel("MAGENTA");
				assert.notEqual(3, res, "Label wrong.");

				// defc (=equ) is not supported
				res = labels.getNumberForLabel("CS_ROM_VALUE");
				assert.notEqual(0xF1, res, "Label wrong.");
			});


			test('z88dk map file (currah)', () => {
				const config = {
					z88dk: [{
						path: './tests/data/labels/currah_uspeech_tests.lis', mapFile: './tests/data/labels/currah_uspeech_tests.map',
						srcDirs: [""],	// Sources mode
						excludeFiles: []
					}]
				};
				const labels = new LabelsClass();
				labels.readListFiles(config);

				// Checks
				let res = labels.getNumberForLabel("ct_input_l2");
				assert.equal(0x80A6, res, "Label wrong.");

				res = labels.getNumberForLabel("main");
				assert.equal(0x8000, res, "Label wrong.");

				// defc (=equ) is not supported
				res = labels.getNumberForLabel("print_number_address");
				assert.equal(undefined, res, "Label wrong.");

				res = labels.getNumberForLabel("SCREEN_COLOR");
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
				Settings.launch = Settings.Init({} as any);
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
				Settings.launch = Settings.Init({} as any);
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

	suite('Misc', () => {

		suite('calculateLabelDistances', () => {

			let labels;

			setup(() => {
				labels = new LabelsClass();
			});

			function initNumberforLabels(addresses: Array<number>) {
				labels.numberForLabel = new Map<string, number>();
				labels.distanceForLabelAddress = new Map<number, number>();
				for (let address of addresses) {
					// LAbel name does not matter
					labels.numberForLabel.set("does_not_matter_"+address, address);
				}
				labels.calculateLabelDistances();
			}

			test('64k addresses', () => {
				// Test empty array (no labels)
				initNumberforLabels([]);
				assert.equal(labels.distanceForLabelAddress.size, 0);

				// Test one label
				initNumberforLabels([0x8000]);
				assert.equal(labels.distanceForLabelAddress.size, 0);

				// Test two label
				initNumberforLabels([0x8000, 0x8001]);
				assert.equal(labels.distanceForLabelAddress.size, 1);
				assert.equal(labels.distanceForLabelAddress.get(0x8000).distance, 1);

				// Test several labels
				initNumberforLabels([0x8000, 0x8001, 0x8003, 0x8006, 0x8106]);
				assert.equal(labels.distanceForLabelAddress.size, 4);
				assert.equal(labels.distanceForLabelAddress.get(0x8000).distance, 1);
				assert.equal(labels.distanceForLabelAddress.get(0x8001).distance, 2);
				assert.equal(labels.distanceForLabelAddress.get(0x8003).distance, 3);
				assert.equal(labels.distanceForLabelAddress.get(0x8006).distance, 0x100);
				assert.equal(labels.distanceForLabelAddress.get(0x8106), undefined);

				// Test same bank, lower (e.g. an EQU). Is not the correct size but may happen.
				initNumberforLabels([0x8000, 0x8003, 0x7000, 0x8004]);
				assert.equal(labels.distanceForLabelAddress.size, 2);
				assert.equal(labels.distanceForLabelAddress.get(0x8000).distance, 3);
				assert.equal(labels.distanceForLabelAddress.get(0x7000).distance, 0x1004);
			});

			test('long addresses', () => {
				// Test one label
				initNumberforLabels([0x018000]);
				assert.equal(labels.distanceForLabelAddress.size, 0);

				// Test two label
				initNumberforLabels([0x018000, 0x018001]);
				assert.equal(labels.distanceForLabelAddress.size, 1);
				assert.equal(labels.distanceForLabelAddress.get(0x018000).distance, 1);

				// Test several labels
				initNumberforLabels([0x028000, 0x028001, 0x028003, 0x028006, 0x028106]);
				assert.equal(labels.distanceForLabelAddress.size, 4);
				assert.equal(labels.distanceForLabelAddress.get(0x028000).distance, 1);
				assert.equal(labels.distanceForLabelAddress.get(0x028001).distance, 2);
				assert.equal(labels.distanceForLabelAddress.get(0x028003).distance, 3);
				assert.equal(labels.distanceForLabelAddress.get(0x028006).distance, 0x100);
				assert.equal(labels.distanceForLabelAddress.get(0x028106), undefined);

				// Different banks (consecutive)
				initNumberforLabels([0x018000, 0x028001, 0x038003, 0x048006, 0x058106]);
				assert.equal(labels.distanceForLabelAddress.size, 4);
				assert.equal(labels.distanceForLabelAddress.get(0x018000).distance, 1);
				assert.equal(labels.distanceForLabelAddress.get(0x028001).distance, 2);
				assert.equal(labels.distanceForLabelAddress.get(0x038003).distance, 3);
				assert.equal(labels.distanceForLabelAddress.get(0x048006).distance, 0x100);
				assert.equal(labels.distanceForLabelAddress.get(0x058106), undefined);

				// Different banks (lower). Note: this results in incorrect sizes. E.g.
				// If an equ was defined between the labels.
				initNumberforLabels([0x018000, 0x028001, 0x037000, 0x028004]);
				assert.equal(labels.distanceForLabelAddress.size, 2);
				assert.equal(labels.distanceForLabelAddress.get(0x018000).distance, 1);
				assert.equal(labels.distanceForLabelAddress.get(0x028001), undefined);
				assert.equal(labels.distanceForLabelAddress.get(0x037000).distance, 0x1004);
				assert.equal(labels.distanceForLabelAddress.get(0x028004), undefined);
			});

		});

	});

});
