
import * as assert from 'assert';
import {suite, test, setup, teardown} from 'mocha';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {LabelsClass, SourceFileEntry} from '../src/labels/labels';
import {Z88dkLabelParser} from '../src/labels/z88dklabelparser';
import {MemoryModel} from '../src/remotes/MemoryModel/memorymodel';
import {MemoryModelAllRam} from '../src/remotes/MemoryModel/genericmemorymodels';
import {MemoryModelZxNextOneROM, MemoryModelZxNextTwoRom} from '../src/remotes/MemoryModel/zxnextmemorymodels';

suite('Labels (z88dk)', () => {
	let lbls;

	setup(() => {
		lbls = new LabelsClass();
	});


	suite('Labels', () => {

		test('Labels (with map)', () => {
			// Read result data (labels)
			const labelsFile = fs.readFileSync('./tests/data/labels/projects/z88dk/general_old/main.map').toString().split('\n');

			// Read the list file
			const config = {
				z88dk: [{
					path: './tests/data/labels/projects/z88dk/general_old/main.lis',
					mapFile: "./tests/data/labels/projects/z88dk/general_old/main.map",
					srcDirs: [""],	// Sources mode
					excludeFiles: []
				}]
			};
			lbls.readListFiles(config, new MemoryModelAllRam());

			// Compare all labels
			for (const labelLine of labelsFile) {
				if (labelLine == '')
					continue;
				// A line looks like: "label1                          = $8000 ; addr, local, , main, , main.asm:15"
				const match = /(\w*)\s+=\s+\$([0-9a-f]+)/i.exec(labelLine)!;
				assert.notEqual(undefined, match);	// Check that line is parsed correctly
				const label = match[1];
				if (label == "__head")
					break;
				const value = parseInt(match[2], 16) + 0x10000;
				// Check
				const res = lbls.getNumberForLabel(label);
				assert.equal(value, res, "Error: " + label);
			}
		});

		test('Labels equ', () => {
			// EQUs are not included in map file for z88dk
			// Read the list file
			const config = {
				z88dk: [{
					path: './tests/data/labels/projects/z88dk/general_old/main.lis',
					mapFile: "./tests/data/labels/projects/z88dk/general_old/main.map",
					srcDirs: [""],	// Sources mode
					excludeFiles: []
				}]
			};
			lbls.readListFiles(config, new MemoryModelAllRam());

			// Check
			let res = lbls.getNumberForLabel("label_equ1");
			assert.equal(100, res);

			res = lbls.getNumberForLabel("fab_label_equ1");
			assert.equal(70, res);
		});


		test('IF 0 Labels', () => {
			// Read the list file
			const config = {
				z88dk: [{
					path: './tests/data/labels/projects/z88dk/general_old/main.lis',
					mapFile: "./tests/data/labels/projects/z88dk/general_old/main.map",
					srcDirs: [""],	// Sources mode
					excludeFiles: []
				}]
			};
			lbls.readListFiles(config, new MemoryModelAllRam());

			// Test that a label under an IF 0/ENDIF is not defined => not easily possible with
			// z80asm, so simply allow it.
			const res = lbls.getNumberForLabel('label5');
			//assert.equal(undefined, res); // This would be correct, but is not easily possible with z80asm
			assert.equal(res, 0x018006);
		});


		suite('ListFile-Mode', () => {

			test('Labels location', () => {
				// Read the list file
				const fname = './tests/data/labels/projects/z88dk/general_old/main.lis';
				const config = {
					z88dk: [{
						path: fname,
						srcDirs: [],	// ListFile-Mode
						mapFile: "./tests/data/labels/projects/z88dk/general_old/main.map",
						excludeFiles: []
					}]
				};
				lbls.readListFiles(config, new MemoryModelAllRam());

				// Test
				let res = lbls.getLocationOfLabel('label1')!;
				assert.notEqual(undefined, res);
				assert.equal(fname, res.file);
				assert.equal(15 - 1, res.lineNr);	// line number starts at 0

				res = lbls.getLocationOfLabel('fa_label1')!;
				assert.notEqual(undefined, res);
				assert.equal(fname, res.file);
				assert.equal(52 - 1, res.lineNr);	// line number starts at 0

				res = lbls.getLocationOfLabel('global_label1')!;
				assert.notEqual(undefined, res);
				assert.equal(fname, res.file);
				assert.equal(71 - 1, res.lineNr);	// line number starts at 0

				res = lbls.getLocationOfLabel('global_label2')!;
				assert.notEqual(undefined, res);
				assert.equal(fname, res.file);
				assert.equal(73 - 1, res.lineNr);	// line number starts at 0
			});

			test('address -> file/line', () => {
				// Read the list file as result data (addresses)
				const listFile = fs.readFileSync('./tests/data/labels/projects/z88dk/general_old/main.lis').toString().split('\n');

				// Read the list file
				const config = {
					z88dk: [{
						path: './tests/data/labels/projects/z88dk/general_old/main.lis',
						srcDirs: [],	// ListFile-Mode
						mapFile: "./tests/data/labels/projects/z88dk/general_old/main.map"
					}]
				};
				lbls.readListFiles(config, new MemoryModelAllRam());

				// Compare all addresses
				const count = listFile.length;
				let labelCount = 0;
				for (let lineNr = 0; lineNr < count; lineNr++) {
					const line = listFile[lineNr];
					// A valid line looks like: " 18    8001 3E 05        label2:	ld a,5"
					const match = /^\s*[0-9+]+\s+([0-9a-f]+)\s+[0-9a-f]{2}\s/i.exec(line);
					if (!match)
						continue;
					labelCount++;
					// Valid address line
					let addr64k = parseInt(match[1], 16);
					addr64k += 0x8000;	// Correct by ORG 0x8000
					const address = 0x10000 + addr64k;	// Just 1 bank, MemoryModelAllRam
					// Check
					const res = lbls.getFileAndLineForAddress(address);
					assert.ok(res.fileName.endsWith('main.lis'));
					assert.equal(res.lineNr, lineNr);
				}
				assert.notEqual(labelCount, 0, "No label found");
			});


			test('file/line -> address', () => {
				// Read the list file as result data (addresses)
				const filename = './tests/data/labels/projects/z88dk/general_old/main.lis';
				const listFile = fs.readFileSync(filename).toString().split('\n');

				// Read the list file
				const config = {
					z88dk: [{
						path: './tests/data/labels/projects/z88dk/general_old/main.lis',
						srcDirs: [],	// ListFile-Mode
						mapFile: "./tests/data/labels/projects/z88dk/general_old/main.map"
					}]
				};
				lbls.readListFiles(config, new MemoryModelAllRam());

				// Compare all addresses
				const count = listFile.length;
				let labelCount = 0;
				for (let lineNr = 0; lineNr < count; lineNr++) {
					const line = listFile[lineNr];
					// A valid line looks like: " 18    8001 3E 05        label2:	ld a,5"
					const match = /^\s*[0-9+]+\s+([0-9a-f]+)\s+[0-9a-f]{2}\s/i.exec(line);
					if (!match)
						continue;
					labelCount++;
					// Valid address line
					let addr64k = parseInt(match[1], 16);
					addr64k += 0x8000;	// Correct by ORG 0x8000
					const address = 0x10000 + addr64k;	// Just 1 bank, MemoryModelAllRam
					// Check
					let resultAddr = lbls.getAddrForFileAndLine(filename, lineNr);
					assert.equal(resultAddr, address);
				}
				assert.notEqual(labelCount, 0, "No label found");
			});
		});


		suite('Sources-Mode', () => {

			test('Labels location', () => {
				// Read the list file
				const config = {
					z88dk: [{
						path: './tests/data/labels/projects/z88dk/general_old/main.lis',
						mainFile: "main.asm",
						mapFile: "./tests/data/labels/projects/z88dk/general_old/main.map",
						srcDirs: [""],	// Sources mode
						excludeFiles: []
					}]
				};
				lbls.readListFiles(config, new MemoryModelAllRam());

				// Test
				let res = lbls.getLocationOfLabel('label1')!;
				assert.notEqual(undefined, res);
				assert.equal('main.asm', res.file);
				assert.equal(15 - 1, res.lineNr);	// line number starts at 0

				res = lbls.getLocationOfLabel('fa_label1')!;
				assert.notEqual(undefined, res);
				assert.equal('filea.asm', res.file);
				assert.equal(2 - 1, res.lineNr);	// line number starts at 0

				res = lbls.getLocationOfLabel('global_label1')!;
				assert.notEqual(undefined, res);
				assert.equal('filea_b.asm', res.file);
				assert.equal(10 - 1, res.lineNr);	// line number starts at 0

				res = lbls.getLocationOfLabel('global_label2')!;
				assert.notEqual(undefined, res);
				assert.equal('filea_b.asm', res.file);
				assert.equal(12 - 1, res.lineNr);	// line number starts at 0

				res = lbls.getLocationOfLabel('fab_label_equ1')!;
				assert.notEqual(undefined, res);
				assert.equal('filea_b.asm', res.file);
				assert.equal(20 - 1, res.lineNr);	// line number starts at 0
			});


			test('address -> file/line', () => {
				// Read the list file
				const config = {
					z88dk: [{
						path: './tests/data/labels/projects/z88dk/general_old/main.lis',
						mainFile: "main.asm",
						mapFile: "./tests/data/labels/projects/z88dk/general_old/main.map",
						srcDirs: [""],	// Sources mode
						excludeFiles: []
					}]
				};
				lbls.readListFiles(config, new MemoryModelAllRam());

				// Tests
				let res = lbls.getFileAndLineForAddress(0x18000);
				assert.ok(res.fileName.endsWith('main.asm'));
				assert.equal(16 - 1, res.lineNr);

				res = lbls.getFileAndLineForAddress(0x1800D);
				assert.ok(res.fileName.endsWith('filea.asm'));
				assert.equal(7 - 1, res.lineNr);

				res = lbls.getFileAndLineForAddress(0x18010);
				assert.ok(res.fileName.endsWith('filea_b.asm'));
				assert.equal(7 - 1, res.lineNr);

				res = lbls.getFileAndLineForAddress(0x18014);
				assert.ok(res.fileName.endsWith('filea.asm'));
				assert.equal(16 - 1, res.lineNr);
			});


			test('file/line -> address', () => {
				// Read the list file
				const config = {
					z88dk: [{
						path: './tests/data/labels/projects/z88dk/general_old/main.lis',
						mainFile: "main.asm",
						mapFile: "./tests/data/labels/projects/z88dk/general_old/main.map",
						srcDirs: [""],	// Sources mode
						excludeFiles: []
					}]
				};
				lbls.readListFiles(config, new MemoryModelAllRam());

				// Tests
				let address = lbls.getAddrForFileAndLine('main.asm', 16 - 1);
				assert.equal(address, 0x18000);

				address = lbls.getAddrForFileAndLine('filea.asm', 6 - 1);
				assert.equal(address, 0x1800D);

				address = lbls.getAddrForFileAndLine('filea.asm', 7 - 1);
				assert.equal(address, 0x1800D);

				address = lbls.getAddrForFileAndLine('filea_b.asm', 4 - 1);
				assert.equal(address, 0x18010);

				address = lbls.getAddrForFileAndLine('filea_b.asm', 15 - 1);
				assert.equal(address, 0x18013);

				address = lbls.getAddrForFileAndLine('filea.asm', 15 - 1);
				assert.equal(address, 0x18014);

				address = lbls.getAddrForFileAndLine('filea.asm', 15 - 1);
				assert.equal(address, 0x18014);

				address = lbls.getAddrForFileAndLine('filea.asm', 17 - 1);
				assert.equal(address, 0x18015);
			});

			test('glob path expression: *.lis', () => {
				// Read the list file
				const config = {
					z88dk: [{
						path: './tests/data/labels/projects/z88dk/general_old/mai*.lis',
						mainFile: "main.asm",
						mapFile: "./tests/data/labels/projects/z88dk/general_old/main.map",
						srcDirs: [""],	// Sources mode
						excludeFiles: []
					}]
				};
				lbls.readListFiles(config, new MemoryModelAllRam());

				// Tests
				let address = lbls.getAddrForFileAndLine('main.asm', 16 - 1);
				assert.equal(address, 0x18000);
			});
		});
	});


	test('Occurrence of WPMEM, ASSERTION, LOGPOINT', () => {
		// Read the list file
		const config = {
			z88dk: [{
				path: './tests/data/labels/projects/z88dk/general_old/main.lis',
				mainFile: "main.asm",
				mapFile: "./tests/data/labels/projects/z88dk/general_old/main.map",
				srcDirs: [""],	// Sources mode
				excludeFiles: []
			}]
		};
		lbls.readListFiles(config, new MemoryModelAllRam());

		// Test WPMEM
		const wpLines = lbls.getWatchPointLines();
		assert.equal(wpLines.length, 1);
		assert.equal(wpLines[0].address, 0x18008);
		assert.equal(wpLines[0].line, "WPMEM");

		// Test ASSERTION
		const assertionLines = lbls.getAssertionLines();
		assert.equal(assertionLines.length, 1);
		assert.equal(assertionLines[0].address, 0x18005);
		assert.equal(assertionLines[0].line, "ASSERTION");

		// Test LOGPOINT
		const lpLines = lbls.getLogPointLines();
		assert.equal(lpLines.length, 1);
		assert.equal(lpLines[0].address, 0x18006);
		assert.equal(lpLines[0].line, "LOGPOINT");
	});


	suite('checkMappingToTargetMemoryModel', () => {
		// z88dk uses the base LabelParserBase checkMappingToTargetMemoryModel function.
		// So strictly speaking this test would not be necessary.
		let tmpFile;
		let tmpMapFile;
		let parser: any;

		setup(() => {
			// File path for a temporary file.
			tmpFile = path.join(os.tmpdir(), 'dezog_labels_z88dk.lis');
			// Write file.
			fs.writeFileSync(tmpFile,
				`
15    0000              label0000:
16    2000              label2000:
17    4000              label4000:
18    6000              label6000:
19    8000              label8000:
20    A000              labelA000:
21    C000              labelC000:
22    E000              labelE000:
`);
			//Write also map file.
			tmpMapFile = path.join(os.tmpdir(), 'dezog_labels_z88dk.map');
			fs.writeFileSync(tmpMapFile,
				`label0000                          = $0000 ; addr, local, , main, , main.asm:15
label2000                          = $2000 ; addr, local, , main, , main.asm:16
label4000                          = $4000 ; addr, local, , main, , main.asm:17
label6000                          = $6000 ; addr, local, , main, , main.asm:18
label8000                          = $8000 ; addr, local, , main, , main.asm:19
labelA000                          = $A000 ; addr, local, , main, , main.asm:20
labelC000                          = $C000 ; addr, local, , main, , main.asm:21
labelE000                          = $E000 ; addr, local, , main, , main.asm:22
`);
		});

		function createParser(mm: MemoryModel) {
			// Read the empty list file
			const config: any = {
				path: tmpFile,
				mapFile: tmpMapFile,
				srcDirs: [],
				excludeFiles: []
			};
			parser = new Z88dkLabelParser(
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


		test('createLongAddress MemoryModelZxNextOneROM', () => {
			const mm = new MemoryModelZxNextOneROM();
			createParser(mm);

			assert.equal(parser.numberForLabel.get('label0000'), 0x0FF0000);
			assert.equal(parser.numberForLabel.get('label2000'), 0x1002000);
			assert.equal(parser.numberForLabel.get('label4000'), 0x00B4000);
			assert.equal(parser.numberForLabel.get('label6000'), 0x00C6000);
			assert.equal(parser.numberForLabel.get('label8000'), 0x0058000);
			assert.equal(parser.numberForLabel.get('labelA000'), 0x006A000);
			assert.equal(parser.numberForLabel.get('labelC000'), 0x001C000);
			assert.equal(parser.numberForLabel.get('labelE000'), 0x002E000);
		});


		test('createLongAddress MemoryModelZxNextTwoRom', () => {
			const mm = new MemoryModelZxNextTwoRom();
			createParser(mm);

			assert.equal(parser.numberForLabel.get('label0000'), 0x0FF0000);
			assert.equal(parser.numberForLabel.get('label2000'), 0x1002000);
			assert.equal(parser.numberForLabel.get('label4000'), 0x00B4000);
			assert.equal(parser.numberForLabel.get('label6000'), 0x00C6000);
			assert.equal(parser.numberForLabel.get('label8000'), 0x0058000);
			assert.equal(parser.numberForLabel.get('labelA000'), 0x006A000);
			assert.equal(parser.numberForLabel.get('labelC000'), 0x001C000);
			assert.equal(parser.numberForLabel.get('labelE000'), 0x002E000);
		});
	});
});
