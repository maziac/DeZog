import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {LabelsClass, SourceFileEntry} from '../src/labels/labels';
import {MemoryModelAllRam, MemoryModelUnknown, MemoryModelZx128k, MemoryModelZx48k, MemoryModelZxNext} from '../src/remotes/MemoryModel/predefinedmemorymodels';
import {MemoryModel} from '../src/remotes/MemoryModel/memorymodel';
import {ReverseEngineeringLabelParser} from '../src/labels/reverseengineeringlabelparser';

suite('Labels (revEng)', () => {

	let lbls: LabelsClass;

	setup(() => {
		lbls = new LabelsClass();
	});

	suite('Labels', () => {

		const config: any = {
			revEng: [{
				path: 'tests/data/labels/projects/revEng/main.list'
			}]
		};

		test('labels equ', () => {
			lbls.readListFiles(config, new MemoryModelUnknown());

			// Check
			let res = lbls.getNumberForLabel("label_equ1");
			assert.equal(res, 100);

			res = lbls.getNumberForLabel("label_equ2");
			assert.equal(res, 200);
		});

		test('labels location', () => {
			lbls.readListFiles(config, new MemoryModelUnknown());
			const fname = config.revEng[0].path;

			// Test
			let res = lbls.getLocationOfLabel('label1')!;
			assert.equal(res.address, 0);
			assert.equal(res.file, fname);
			assert.equal(res.lineNr, 3);	// line number starts at 0

			res = lbls.getLocationOfLabel('label2')!;
			assert.equal(res.address, 1);
			assert.equal(res.file, fname);
			assert.equal(res.lineNr, 6);	// line number starts at 0

			res = lbls.getLocationOfLabel('long_label1')!;
			assert.equal(res.address, 0xC1AA + (3 + 1) * 0x10000);
			assert.equal(res.file, fname);
			assert.equal(res.lineNr, 35);	// line number starts at 0

			res = lbls.getLocationOfLabel('long_label2')!;
			assert.equal(res.address, 0xC1AB + (44 + 1) * 0x10000);
			assert.equal(res.file, fname);
			assert.equal(res.lineNr, 37);	// line number starts at 0
		});

		test('local labels', () => {
			lbls.readListFiles(config, new MemoryModelUnknown());

			let addr = lbls.getNumberForLabel('label2')!;
			assert.equal(addr, 1);

			addr = lbls.getNumberForLabel('label2.locala')!;
			assert.equal(addr, 3);

			addr = lbls.getNumberForLabel('label2.localb')!;
			assert.equal(addr, 5);

			addr = lbls.getNumberForLabel('label6.locala')!;
			assert.equal(addr, 7);
		});

		test('address -> file/line', () => {
			lbls.readListFiles(config, new MemoryModelUnknown());
			const fname = config.revEng[0].path;

			// label2
			let res = lbls.getFileAndLineForAddress(0x0001);
			assert.equal(res.fileName, fname);
			assert.equal(res.lineNr, 6);
			res = lbls.getFileAndLineForAddress(0x0002);
			assert.equal(res.fileName, fname);
			assert.equal(res.lineNr, 6);

			// label2.locala
			res = lbls.getFileAndLineForAddress(0x0003);
			assert.equal(res.fileName, fname);
			assert.equal(res.lineNr, 8);
			res = lbls.getFileAndLineForAddress(0x0004);
			assert.equal(res.fileName, fname);
			assert.equal(res.lineNr, 8);

			// label2.localb
			res = lbls.getFileAndLineForAddress(0x0003);
			assert.equal(res.fileName, fname);
			assert.equal(res.lineNr, 8);
			res = lbls.getFileAndLineForAddress(0x0004);
			assert.equal(res.fileName, fname);
			assert.equal(res.lineNr, 8);

			// no bytes -> file association, but size == 0
			res = lbls.getFileAndLineForAddress(0x0015);
			//assert.equal(res.fileName, '');
			assert.equal(res.fileName, 'tests/data/labels/projects/revEng/main.list');
			assert.equal(res.size, 0);

			// long label: C1AC@3 FA
			res = lbls.getFileAndLineForAddress(0xC1AC + (3 + 1) * 0x10000);
			assert.equal(res.fileName, fname);
			assert.equal(res.lineNr, 39);

			// IM 2: bytes stopped by 2 character instruction
			res = lbls.getFileAndLineForAddress(0x0020);
			assert.equal(res.fileName, fname);
			assert.equal(res.lineNr, 41);
			res = lbls.getFileAndLineForAddress(0x00021);
			assert.equal(res.fileName, fname);
			assert.equal(res.lineNr, 41);
			res = lbls.getFileAndLineForAddress(0x00022);
			assert.equal(res.fileName, '');

			// 01 02  03  ; Byte separated with 2 spaces does not belong to bytes
			res = lbls.getFileAndLineForAddress(0x0030);
			assert.equal(res.fileName, fname);
			assert.equal(res.lineNr, 43);
			res = lbls.getFileAndLineForAddress(0x00031);
			assert.equal(res.fileName, fname);
			assert.equal(res.lineNr, 43);
			res = lbls.getFileAndLineForAddress(0x00032);
			assert.equal(res.fileName, '');

			// 01 02 03  , empty line after bytes
			res = lbls.getFileAndLineForAddress(0x0040);
			assert.equal(res.fileName, fname);
			assert.equal(res.lineNr, 44);
			res = lbls.getFileAndLineForAddress(0x00041);
			assert.equal(res.fileName, fname);
			assert.equal(res.lineNr, 44);
			res = lbls.getFileAndLineForAddress(0x00042);
			assert.equal(res.fileName, fname);
			assert.equal(res.lineNr, 44);
			res = lbls.getFileAndLineForAddress(0x00043);
			assert.equal(res.fileName, '');
		});


		test('file/line -> address', () => {
			lbls.readListFiles(config, new MemoryModelUnknown());
			const fname = config.revEng[0].path;

			// label2
			let addr = lbls.getAddrForFileAndLine(fname, 6);
			assert.equal(addr, 0x0001);
			addr = lbls.getAddrForFileAndLine(fname, 7);
			assert.equal(addr, -1);

			// label2.locala
			addr = lbls.getAddrForFileAndLine(fname, 8);
			assert.equal(addr, 0x003);

			// label2.localb
			addr = lbls.getAddrForFileAndLine(fname, 9);
			//assert.equal(addr, -1);
			assert.equal(addr, 5);

			// label4
			addr = lbls.getAddrForFileAndLine(fname, 14);
			assert.equal(addr, 0x006);
			addr = lbls.getAddrForFileAndLine(fname, 15);
			assert.equal(addr, 0x006);
			addr = lbls.getAddrForFileAndLine(fname, 16);
			assert.equal(addr, 0x006);

			// long address
			addr = lbls.getAddrForFileAndLine(fname, 39);
			assert.equal(addr, 0xC1AC + (3 + 1) * 0x10000);
		});
	});


	suite('Warnings', () => {

		test('expression wrong in equ', () => {
			const config: any = {
				revEng: [{
					path: 'tests/data/labels/projects/revEng/wrong1.list'
				}]
			};
			lbls.readListFiles(config, new MemoryModelUnknown());

			// Check
			const warnings = lbls.getWarnings();
			assert.notEqual(warnings, undefined);
			const warning = warnings.split('\n')[1];
			assert.ok(warning.startsWith('Could not evaluate expression'));
		});

		test('line ignored', () => {
			const config: any = {
				revEng: [{
					path: 'tests/data/labels/projects/revEng/wrong2.list'
				}]
			};
			lbls.readListFiles(config, new MemoryModelUnknown());

			// Check
			const warnings = lbls.getWarnings();
			assert.notEqual(warnings, undefined);
			const warning = warnings.split('\n')[1];
			assert.ok(warning.startsWith('Line ignored'));
		});

		test('no warning', () => {
			const config: any = {
				revEng: [{
					path: 'tests/data/labels/projects/revEng/main.list'
				}]
			};
			lbls.readListFiles(config, new MemoryModelUnknown());

			// Check
			const warnings = lbls.getWarnings();
			assert.equal(warnings, undefined);
		});

		test('same label used twice', () => {
			const config: any = {
				revEng: [{
					path: 'tests/data/labels/projects/revEng/samelabel.list'
				}]
			};
			lbls.readListFiles(config, new MemoryModelUnknown());

			// Check
			const warnings = lbls.getWarnings();
			assert.notEqual(warnings, undefined);
			const warning = warnings.split('\n')[1];
			assert.ok(warning.endsWith('defined more than once.'));
		});

		test('same label used twice (local)', () => {
			const config: any = {
				revEng: [{
					path: 'tests/data/labels/projects/revEng/samelabellocal.list'
				}]
			};
			lbls.readListFiles(config, new MemoryModelUnknown());

			// Check
			const warnings = lbls.getWarnings();
			assert.notEqual(warnings, undefined);
			const warning = warnings.split('\n')[1];
			assert.ok(warning.endsWith('defined more than once.'));
		});
	});


	test('Occurrence of WPMEM, ASSERTION, LOGPOINT', () => {
		const config: any = {
			revEng: [{
				path: 'tests/data/labels/projects/revEng/wpmemetc.list'
			}]
		};
		lbls.readListFiles(config, new MemoryModelUnknown());

		// Test WPMEM
		const wpLines = lbls.getWatchPointLines();
		assert.equal(wpLines.length, 3);
		assert.equal(wpLines[0].address, 6);
		assert.equal(wpLines[0].line, "WPMEM");
		assert.equal(wpLines[1].address, 0x0007);
		assert.equal(wpLines[1].line, "WPMEM");
		assert.equal(wpLines[2].address, 0x0008);
		assert.equal(wpLines[2].line, "WPMEM");

		// Test ASSERTION
		const assertionLines = lbls.getAssertionLines();
		assert.equal(assertionLines.length, 2);
		assert.equal(assertionLines[0].address, 0x8005);
		assert.equal(assertionLines[0].line, "ASSERTION");
		assert.equal(assertionLines[1].address, 0x8006);
		assert.equal(assertionLines[0].line, "ASSERTION");

		// Test LOGPOINT
		const lpLines = lbls.getLogPointLines();
		assert.equal(lpLines.length, 1);
		assert.equal(lpLines[0].address, 0x8006);
		assert.equal(lpLines[0].line, "LOGPOINT");
	});



	suite('bank mapping', () => {
		let parser: any;
		let listText;

		function createSldFile(mm: MemoryModel) {
			// File path for a temporary file.
			const tmpFile = path.join(os.tmpdir(), 'dezog_labels_test.sld');
			// Prepare sld file:
			fs.writeFileSync(tmpFile, listText);
			// Read the list file
			const config: any = {
				path: tmpFile
			};
			parser = new ReverseEngineeringLabelParser(
				mm,
				new Map<number, SourceFileEntry>(),
				new Map<string, Array<number>>(),
				new Array<any>(),
				new Map<number, Array<string>>(),
				new Map<string, number>(),
				new Map<string, {file: string, lineNr: number, address: number}>(),
				new Array<{address: number, line: string}>(),
				new Array<{address: number, line: string}>(),
				new Array<{address: number, line: string}>());
			parser.loadAsmListFile(config);
			fs.unlinkSync(tmpFile);
		}


		suite('shortName parsing', () => {

			// Test that a shortname in a label like 0000:R1 is correctly parsed.
			test('Target: MemoryModelUnknown', () => {
				// Custom memory model
				const mm = new MemoryModel({
					slots: [
						{
							range: [0x0000, 0x3FFF],
							name: "slotROM",
							banks: [
								{
									index: 0,
									name: 'ROM0',
									shortName: 'R0'
								},
								{
									index: 1,
									name: 'ROM1',
									shortName: 'R1'
								}
							]
						},
						{
							range: [0x4000, 0x7FFF],
							banks: [
								{
									index: 3
								}
							]
						},
						{
							range: [0x8000, 0xBFFF],
							name: "bankedSlot",
							banks: [
								{
									index: 2,
									name: 'RAM${index}',
									shortName: 'B${index}'
								},
								{
									index: [4, 7],
									name: 'RAM${index}',
									shortName: 'B${index}'
								}
							]
						},
						{
							range: [0xC000, 0xFFFF],
							banks: [
								{
									index: 8
								}
							]
						}
					]
				});
				createSldFile(mm);

			});

		});


		suite('checkMappingToTargetMemoryModel', () => {

			setup(() => {
				// Prepare sld file:
				listText =
					`
0000 null:

11CB    L11CB:
11CB    47           LD   B,A

8011:2	 subnop:
8011:2    00            NOP
;8012:2    00            NOP
8013:2    00            NOP

;8010	; WPMEMx



;8011	; LOGPOINTx
;8012	; WPMEM
;8013	; LOGPOINTx

;8014    C9            RET

80DB
80DD
80DF	stack_top:`;
			});


			test('Target: MemoryModelUnknown', () => {	// NOSONAR
				const mm = new MemoryModelUnknown();
				createSldFile(mm);

				assert.equal(parser.createLongAddress(0x0000, 0), 0x10000);
				assert.equal(parser.createLongAddress(0x2000, 1), 0x22000);
				assert.equal(parser.createLongAddress(0x4000, 2), 0x34000);
				assert.equal(parser.createLongAddress(0x6000, 3), 0x46000);
				assert.equal(parser.createLongAddress(0x8000, 4), 0x58000);
				assert.equal(parser.createLongAddress(0xA000, 5), 0x6A000);
				assert.equal(parser.createLongAddress(0xC000, 6), 0x7C000);
				assert.equal(parser.createLongAddress(0xE000, 7), 0x8E000);
			});

			test('Target: MemoryModelAll', () => {	// NOSONAR
				const mm = new MemoryModelAllRam();
				createSldFile(mm);

				assert.equal(parser.createLongAddress(0x0000, 0), 0x10000);
				assert.equal(parser.createLongAddress(0x2000, 1), 0x12000);
				assert.equal(parser.createLongAddress(0x4000, 2), 0x14000);
				assert.equal(parser.createLongAddress(0x6000, 3), 0x16000);
				assert.equal(parser.createLongAddress(0x8000, 4), 0x18000);
				assert.equal(parser.createLongAddress(0xA000, 5), 0x1A000);
				assert.equal(parser.createLongAddress(0xC000, 6), 0x1C000);
				assert.equal(parser.createLongAddress(0xE000, 7), 0x1E000);
			});

			test('Target: MemoryModelZx48k', () => {	// NOSONAR
				const mm = new MemoryModelZx48k();
				createSldFile(mm);

				assert.equal(parser.createLongAddress(0x0000, 0), 0x10000);
				assert.equal(parser.createLongAddress(0x2000, 1), 0x12000);
				assert.equal(parser.createLongAddress(0x4000, 2), 0x24000);
				assert.equal(parser.createLongAddress(0x6000, 3), 0x26000);
				assert.equal(parser.createLongAddress(0x8000, 4), 0x28000);
				assert.equal(parser.createLongAddress(0xA000, 5), 0x2A000);
				assert.equal(parser.createLongAddress(0xC000, 6), 0x2C000);
				assert.equal(parser.createLongAddress(0xE000, 7), 0x2E000);
			});

			test('Target: MemoryModelZx128k', () => {
				const mm = new MemoryModelZx128k();
				createSldFile(mm);

				assert.equal(parser.createLongAddress(0x0000, 8), 0x90000);
				assert.equal(parser.createLongAddress(0x2000, 9), 0xA2000);
				assert.equal(parser.createLongAddress(0x4000, 5), 0x64000);
				assert.equal(parser.createLongAddress(0x6000, 5), 0x66000);
				assert.equal(parser.createLongAddress(0x8000, 2), 0x38000);
				assert.equal(parser.createLongAddress(0xA000, 2), 0x3A000);
				assert.equal(parser.createLongAddress(0xC000, 0), 0x1C000);
				assert.equal(parser.createLongAddress(0xE000, 0), 0x1E000);

				assert.equal(parser.createLongAddress(0xC000, 1), 0x2C000);
				assert.equal(parser.createLongAddress(0xE000, 1), 0x2E000);

				assert.equal(parser.createLongAddress(0xC000, 2), 0x3C000);
				assert.equal(parser.createLongAddress(0xE000, 2), 0x3E000);

				assert.equal(parser.createLongAddress(0xC000, 3), 0x4C000);
				assert.equal(parser.createLongAddress(0xE000, 3), 0x4E000);

				assert.equal(parser.createLongAddress(0xC000, 4), 0x5C000);
				assert.equal(parser.createLongAddress(0xE000, 4), 0x5E000);

				assert.equal(parser.createLongAddress(0xC000, 5), 0x6C000);
				assert.equal(parser.createLongAddress(0xE000, 5), 0x6E000);

				assert.equal(parser.createLongAddress(0xC000, 6), 0x7C000);
				assert.equal(parser.createLongAddress(0xE000, 6), 0x7E000);

				assert.equal(parser.createLongAddress(0xC000, 7), 0x8C000);
				assert.equal(parser.createLongAddress(0xE000, 7), 0x8E000);

				// This bank cannot be converted and should result in an exception
				assert.throws(() => {
					parser.createLongAddress(0xC000, 10);
				}, Error);
			});


			test('Target: MemoryModelZxNext', () => {
				const mm = new MemoryModelZxNext();
				createSldFile(mm);

				// RAM
				for (let bank = 0; bank < 224; bank++) {
					for (let address = 0; address < 0x10000; address += 0x2000) {
						const expected = ((bank + 1) << 16) + address;
						assert.equal(parser.createLongAddress(address, bank), expected);
					}
				}

				// ROM
				assert.equal(parser.createLongAddress(0x0000, 0xFC), 0x0FD0000);
				assert.equal(parser.createLongAddress(0x2000, 0xFD), 0x0FE2000);
				assert.equal(parser.createLongAddress(0x0000, 0xFE), 0x0FF0000);
				assert.equal(parser.createLongAddress(0x2000, 0xFF), 0x1002000);

			});


			test('Target: custom MemoryModel', () => {
				// Custom memory model
				const mm = new MemoryModel({
					slots: [
						{
							range: [0x0000, 0x3FFF],
							name: "slotROM",
							banks: [
								{
									index: 0,
									name: 'ROM0',
									shortName: 'R0'
								},
								{
									index: 1,
									name: 'ROM1',
									shortName: 'R1'
								}
							]
						},
						{
							range: [0x4000, 0x7FFF],
							banks: [
								{
									index: 3
								}
							]
						},
						{
							range: [0x8000, 0xBFFF],
							name: "bankedSlot",
							banks: [
								{
									index: 2
								},
								{
									index: [4, 7],
								}
							]
						},
						{
							range: [0xC000, 0xFFFF],
							banks: [
								{
									index: 8
								}
							]
						}
					]
				});
				createSldFile(mm);

				assert.equal(parser.createLongAddress(0x0000, 0), 0x10000);
				assert.equal(parser.createLongAddress(0x0000, 1), 0x20000);

				assert.equal(parser.createLongAddress(0x4000, 3), 0x44000);

				assert.equal(parser.createLongAddress(0x8000, 2), 0x38000);
				assert.equal(parser.createLongAddress(0x8000, 4), 0x58000);
				assert.equal(parser.createLongAddress(0x8000, 5), 0x68000);
				assert.equal(parser.createLongAddress(0x8000, 6), 0x78000);
				assert.equal(parser.createLongAddress(0x8000, 7), 0x88000);

				assert.equal(parser.createLongAddress(0xC000, 8), 0x9C000);
			});

		});
	});

});

