import * as assert from 'assert';
import {LabelsClass, SourceFileEntry} from '../src/labels/labels';
import {MemoryModelAllRam, MemoryModelUnknown, MemoryModelZx128k, MemoryModelZx48k, MemoryModelZxNext} from '../src/remotes/MemoryModel/predefinedmemorymodels';
import {Z80RegistersClass} from '../src/remotes/z80registers';
import {Settings} from '../src/settings';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {LabelParserBase} from '../src/labels/labelparserbase';
import {MemoryModel} from '../src/remotes/MemoryModel/memorymodel';


suite('Labels', () => {

	suite('Files/lines vs list file', () => {

		suite('z80asm', () => {

			test('getFileAndLineForAddress', () => {
				const config: any = {
					z80asm: [{
						path: './tests/data/labels/test1.list',
						srcDirs: [""],	// Sources mode
						excludeFiles: []
					}]
				};
				const lbls = new LabelsClass();
				lbls.readListFiles(config, new MemoryModelAllRam());

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
				const config: any = {
					z80asm: [{
						path: './tests/data/labels/test1.list',
						srcDirs: [""],	// Sources mode
						excludeFiles: []
					}]
				};
				const labels = new LabelsClass();
				labels.readListFiles(config, new MemoryModelAllRam());

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
				const config: any = {
					z80asm: [{
						path: './tests/data/labels/test2.list',
						srcDirs: [""],	// Sources mode
						excludeFiles: []
					}]
				};
				const labels = new LabelsClass();
				labels.readListFiles(config, new MemoryModelAllRam());

				let value = labels.getNumberForLabel('screen_top');
				assert.equal(value, 0x16000, "Expected address wrong.");

				value = labels.getNumberForLabel('PAUSE_TIME');
				assert.equal(value, 5000, "Expected value wrong.");

				value = labels.getNumberForLabel('pause_loop_l2');
				assert.equal(value, 0x16004, "Expected address wrong.");

				value = labels.getNumberForLabel('pause_loop_l1');
				assert.equal(value, 0x16006, "Expected address wrong.");

				value = labels.getNumberForLabel('BCKG_LINE_SIZE');
				assert.equal(value, 32, "Expected value wrong.");

				value = labels.getNumberForLabel('BLACK');
				assert.equal(value, 0, "Expected value wrong.");

				value = labels.getNumberForLabel('MAGENTA');
				assert.equal(value, 3 << 3, "Expected address wrong.");	// NOSONAR

			});


			test('get labels for a value from list file', () => {
				const config: any = {
					z80asm: [{
						path: './tests/data/labels/test2.list',
						srcDirs: [""],	// Sources mode
						excludeFiles: []
					}]
				};
				const lbls = new LabelsClass();
				lbls.readListFiles(config, new MemoryModelAllRam());

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
				const config: any = {
					z80asm: [{
						path: './tests/data/labels/z80asm.list', srcDirs: [""],	// Sources mode
						excludeFiles: []
					}]
				};
				const labels = new LabelsClass();
				labels.readListFiles(config, new MemoryModelAllRam());

				// Checks
				let res = labels.getNumberForLabel("check_score_for_new_ship");
				assert.equal(0x17015, res, "Label wrong.");

				res = labels.getNumberForLabel("ltest1");
				assert.equal(0x1701C, res, "Label wrong.");

				res = labels.getNumberForLabel("SCREEN_COLOR");
				assert.equal(0x15800, res, "Label wrong.");

				res = labels.getNumberForLabel("SCREEN_SIZE");
				assert.equal(0x1800, res, "Label wrong.");
			});

			test('rom.list', () => {
				const config: any = {z80asm: [{path: './tests/data/labels/rom.list', srcDirs: []}]};
				const labels = new LabelsClass();
				labels.readListFiles(config, new MemoryModelAllRam());

				// Checks
				let res = labels.getNumberForLabel("L0055");
				assert.equal(0x10055, res, "Label wrong.");

				res = labels.getNumberForLabel("L022C");
				assert.equal(0x1022C, res, "Label wrong.");
			});
		});


		suite('z88dk', () => {

			test('z88dk.lis', () => {
				const config: any = {
					z88dk: [{
						path: './tests/data/labels/z88dk.lis',
						mapFile: './tests/data/labels/z88dk_empty.map',
						srcDirs: [""],	// Sources mode
						excludeFiles: []
					}]
				};
				const labels = new LabelsClass();
				labels.readListFiles(config, new MemoryModelAllRam());

				// Checks
				let res = labels.getNumberForLabel("ct_ui_first_table");
				assert.equal(0x1000B, res, "Label wrong.");

				res = labels.getNumberForLabel("display_hor_zero_markers");
				assert.equal(0x109A7, res, "Label wrong.");

				res = labels.getNumberForLabel("display_hor_a_address");
				assert.equal(0x109A1, res, "Label wrong.");

				// defc (=equ) is not supported
				res = labels.getNumberForLabel("MAGENTA");
				assert.notEqual(3, res, "Label wrong.");

				// defc (=equ) is not supported
				res = labels.getNumberForLabel("CS_ROM_VALUE");
				assert.notEqual(0xF1, res, "Label wrong.");
			});


			test('z88dk map file (currah)', () => {
				const config: any = {
					z88dk: [{
						path: './tests/data/labels/currah_uspeech_tests.lis', mapFile: './tests/data/labels/currah_uspeech_tests.map',
						srcDirs: [""],	// Sources mode
						excludeFiles: []
					}]
				};
				const labels = new LabelsClass();
				labels.readListFiles(config, new MemoryModelAllRam());

				// Checks
				let res = labels.getNumberForLabel("ct_input_l2");
				assert.equal(0x180A6, res, "Label wrong.");

				res = labels.getNumberForLabel("main");
				assert.equal(0x18000, res, "Label wrong.");

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

				// Is used during conversion (Z80RegistersClass.getBankFromAddress)
				Settings.launch = Settings.Init({} as any);
				Z80RegistersClass.createRegisters();
				const memMdl = new MemoryModelZxNext();
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

				// Is used during conversion (Z80RegistersClass.getBankFromAddress)
				Settings.launch = Settings.Init({} as any);
				Z80RegistersClass.createRegisters();
				const memMdl = new MemoryModelZx128k();
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


	suite('checkMappingToTargetMemoryModel', () => {
		class MockLabelParserBase extends LabelParserBase {
			protected parseLabelAndAddress(line: string) {
				//
			}
			protected parseFileAndLineNumber(line: string) {
				//
			}
		}

		let tmpFile;
		let parser: any;

		setup(() => {
			// File path for a temporary file.
			tmpFile = path.join(os.tmpdir(), 'dezog_labels_test_empty.list');
			// Write empty file. We just need n empty file no labels.
			fs.writeFileSync(tmpFile, "");
		});

		function createParser(mm: MemoryModel) {
			// Read the empty list file
			const config: any = {
				path: tmpFile,
				srcDirs: [""],	// Sources mode
				excludeFiles: []
			};
			parser = new MockLabelParserBase(
				mm,
				new Map<number, SourceFileEntry>(),
				new Map<string, Array<number>>(),
				new Array<any>(),
				new Map<number, Array<string>>(),
				new Map<string, number>(),
				new Map<string, {file: string, lineNr: number, address: number}>(),
				new Array<{address: number, line: string}>(),
				new Array<{address: number, line: string}>(),
				new Array<{address: number, line: string}>(),
				(issue) => {});	// NOSONAR
			parser.loadAsmListFile(config);
		}

		// Cleanup
		teardown(() => {
			fs.unlinkSync(tmpFile);
		});


		test('Target: MemoryModelUnknown', () => {
			const mm = new MemoryModelUnknown();
			createParser(mm);

			assert.equal(parser.createLongAddress(0x0000, 0), 0x10000);
			assert.equal(parser.createLongAddress(0x2000, 0), 0x12000);
			assert.equal(parser.createLongAddress(0x4000, 0), 0x14000);
			assert.equal(parser.createLongAddress(0x6000, 0), 0x16000);
			assert.equal(parser.createLongAddress(0x8000, 0), 0x18000);
			assert.equal(parser.createLongAddress(0xA000, 0), 0x1A000);
			assert.equal(parser.createLongAddress(0xC000, 0), 0x1C000);
			assert.equal(parser.createLongAddress(0xE000, 0), 0x1E000);
		});

		test('Target: MemoryModelAll', () => {
			const mm = new MemoryModelAllRam();
			createParser(mm);

			assert.equal(parser.createLongAddress(0x0000, 0), 0x10000);
			assert.equal(parser.createLongAddress(0x2000, 0), 0x12000);
			assert.equal(parser.createLongAddress(0x4000, 0), 0x14000);
			assert.equal(parser.createLongAddress(0x6000, 0), 0x16000);
			assert.equal(parser.createLongAddress(0x8000, 0), 0x18000);
			assert.equal(parser.createLongAddress(0xA000, 0), 0x1A000);
			assert.equal(parser.createLongAddress(0xC000, 0), 0x1C000);
			assert.equal(parser.createLongAddress(0xE000, 0), 0x1E000);
		});

		test('Target: MemoryModelZx48k', () => {
			const mm = new MemoryModelZx48k();
			createParser(mm);

			assert.equal(parser.createLongAddress(0x0000, 0), 0x10000);
			assert.equal(parser.createLongAddress(0x2000, 0), 0x12000);
			assert.equal(parser.createLongAddress(0x4000, 0), 0x24000);
			assert.equal(parser.createLongAddress(0x6000, 0), 0x26000);
			assert.equal(parser.createLongAddress(0x8000, 0), 0x28000);
			assert.equal(parser.createLongAddress(0xA000, 0), 0x2A000);
			assert.equal(parser.createLongAddress(0xC000, 0), 0x2C000);
			assert.equal(parser.createLongAddress(0xE000, 0), 0x2E000);
		});


		test('Target: MemoryModelZx128k', () => {
			const mm = new MemoryModelZx128k();
			createParser(mm);

			assert.equal(parser.createLongAddress(0x0000, 0), 0xA0000);
			assert.equal(parser.createLongAddress(0x2000, 0), 0xA2000);
			assert.equal(parser.createLongAddress(0x4000, 0), 0x64000);
			assert.equal(parser.createLongAddress(0x6000, 0), 0x66000);
			assert.equal(parser.createLongAddress(0x8000, 0), 0x38000);
			assert.equal(parser.createLongAddress(0xA000, 0), 0x3A000);
			assert.equal(parser.createLongAddress(0xC000, 0), 0x1C000);
			assert.equal(parser.createLongAddress(0xE000, 0), 0x1E000);
		});

		test('Target: MemoryModelZxNext', () => {
			const mm = new MemoryModelZxNext();
			createParser(mm);

			assert.equal(parser.createLongAddress(0x0000, 0), 0x0FF0000);
			assert.equal(parser.createLongAddress(0x2000, 0), 0x1002000);
			assert.equal(parser.createLongAddress(0x4000, 0), 0x00B4000);
			assert.equal(parser.createLongAddress(0x6000, 0), 0x00C6000);
			assert.equal(parser.createLongAddress(0x8000, 0), 0x0058000);
			assert.equal(parser.createLongAddress(0xA000, 0), 0x006A000);
			assert.equal(parser.createLongAddress(0xC000, 0), 0x001C000);
			assert.equal(parser.createLongAddress(0xE000, 0), 0x002E000);
		});
	});

});
