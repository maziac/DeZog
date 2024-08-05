
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {LabelsClass, SourceFileEntry} from '../src/labels/labels';
import {Z88dkLabelParserV2} from '../src/labels/z88dklabelparserv2';
import {MemoryModel} from '../src/remotes/MemoryModel/memorymodel';
import {MemoryModelAllRam} from '../src/remotes/MemoryModel/genericmemorymodels';
import {MemoryModelZx48k} from '../src/remotes/MemoryModel/zxspectrummemorymodels';
import {MemoryModelZxNextOneROM, MemoryModelZxNextTwoRom} from '../src/remotes/MemoryModel/zxnextmemorymodels';

suite('Labels (z88dk v2 format)', () => {
	let lbls;

	setup(() => {
		lbls = new LabelsClass();
	});


	suite('Labels', () => {

		test('Labels (with map)', () => {
			// Read result data (labels)
			const labelsFile = fs.readFileSync('./tests/data/labels/projects/z88dk/general_v2/main.map').toString().split('\n');

			// Read the list file
			const config = {
				z88dkv2: [{
					path: './tests/data/labels/projects/z88dk/general_v2/main.lis',
					mapFile: "./tests/data/labels/projects/z88dk/general_v2/main.map",
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
				assert.equal(res, value, "Error: " + label);
			}
		});

		test('Labels equ', () => {
			// EQUs are not included in map file for z88dk
			// Read the list file
			const config = {
				z88dkv2: [{
					path: './tests/data/labels/projects/z88dk/general_v2/main.lis',
					mapFile: "./tests/data/labels/projects/z88dk/general_v2/main.map",
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
				z88dkv2: [{
					path: './tests/data/labels/projects/z88dk/general_v2/main.lis',
					mapFile: "./tests/data/labels/projects/z88dk/general_v2/main.map",
					srcDirs: [""],	// Sources mode
					excludeFiles: []
				}]
			};
			lbls.readListFiles(config, new MemoryModelAllRam());

			// Test that a label under an IF 0/ENDIF is not defined => not easily possible with
			// z80asm, so simply allow it.
			const res = lbls.getNumberForLabel('label5');
			assert.equal(undefined, res);
		});


		suite('ListFile-Mode', () => {

			test('Labels location', () => {
				// Read the list file
				const fname = './tests/data/labels/projects/z88dk/general_v2/main.lis';
				const config = {
					z88dkv2: [{
						path: fname,
						srcDirs: [],	// ListFile-Mode
						mapFile: "./tests/data/labels/projects/z88dk/general_v2/main.map",
						excludeFiles: []
					}]
				};
				lbls.readListFiles(config, new MemoryModelAllRam());

				// Test
				let res = lbls.getLocationOfLabel('label1')!;
				assert.notEqual(res, undefined);
				assert.equal(fname, res.file);
				assert.equal(16 - 1, res.lineNr);	// line number starts at 0

				res = lbls.getLocationOfLabel('fa_label1')!;
				assert.notEqual(res, undefined);
				assert.equal(fname, res.file);
				assert.equal(60 - 1, res.lineNr);	// line number starts at 0

				res = lbls.getLocationOfLabel('global_label1')!;
				assert.notEqual(res, undefined);
				assert.equal(fname, res.file);
				assert.equal(80 - 1, res.lineNr);	// line number starts at 0

				res = lbls.getLocationOfLabel('global_label2')!;
				assert.notEqual(res, undefined);
				assert.equal(fname, res.file);
				assert.equal(82 - 1, res.lineNr);	// line number starts at 0
			});

			test('address -> file/line', () => {
				// Read the list file as result data (addresses)
				const listFile = fs.readFileSync('./tests/data/labels/projects/z88dk/general_v2/main.lis').toString().split('\n');

				// Read the list file
				const config = {
					z88dkv2: [{
						path: './tests/data/labels/projects/z88dk/general_v2/main.lis',
						srcDirs: [],	// ListFile-Mode
						mapFile: "./tests/data/labels/projects/z88dk/general_v2/main.map"
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
				const filename = './tests/data/labels/projects/z88dk/general_v2/main.lis';
				const listFile = fs.readFileSync(filename).toString().split('\n');

				// Read the list file
				const config = {
					z88dkv2: [{
						path: './tests/data/labels/projects/z88dk/general_v2/main.lis',
						srcDirs: [],	// ListFile-Mode
						mapFile: "./tests/data/labels/projects/z88dk/general_v2/main.map"
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

			test('C-code assembly: Test.c.lis', () => {
				// Read the list file
				const config = {
					z88dkv2: [{
						path: './tests/data/labels/projects/z88dk/test_c_v2/Test.c.lis',
						srcDirs: [],	// ListFile-Mode
						mapFile: "./tests/data/labels/projects/z88dk/test_c_v2/Test.map"
					}]
				};
				lbls.readListFiles(config, new MemoryModelZx48k());

				let res = lbls.getFileAndLineForAddress(0x028FB7);
				assert.ok(res.fileName.endsWith('Test.c.lis'));
				assert.equal(res.lineNr, 557);

				res = lbls.getFileAndLineForAddress(0x028FBA);
				assert.ok(res.fileName.endsWith('Test.c.lis'));
				assert.equal(res.lineNr, 558);

				res = lbls.getFileAndLineForAddress(0x028FBB);
				assert.ok(res.fileName.endsWith('Test.c.lis'));
				assert.equal(res.lineNr, 559);

				res = lbls.getFileAndLineForAddress(0x028FBE);
				assert.ok(res.fileName.endsWith('Test.c.lis'));
				assert.equal(res.lineNr, 560);

				res = lbls.getFileAndLineForAddress(0x028FBF);
				assert.ok(res.fileName.endsWith('Test.c.lis'));
				assert.equal(res.lineNr, 562);
			});
		});


		suite('Sources-Mode', () => {

			test('Labels location', () => {
				// Read the list file
				const config = {
					z88dkv2: [{
						path: './tests/data/labels/projects/z88dk/general_v2/main.lis',
						mapFile: "./tests/data/labels/projects/z88dk/general_v2/main.map",
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
				assert.equal('dir/filea b.asm', res.file);
				assert.equal(10 - 1, res.lineNr);	// line number starts at 0

				res = lbls.getLocationOfLabel('global_label2')!;
				assert.notEqual(undefined, res);
				assert.equal('dir/filea b.asm', res.file);
				assert.equal(12 - 1, res.lineNr);	// line number starts at 0

				res = lbls.getLocationOfLabel('fab_label_equ1')!;
				assert.notEqual(undefined, res);
				assert.equal('dir/filea b.asm', res.file);
				assert.equal(20 - 1, res.lineNr);	// line number starts at 0
			});


			test('address -> file/line', () => {
				// Read the list file
				const config = {
					z88dkv2: [{
						path: './tests/data/labels/projects/z88dk/general_v2/main.lis',
						mapFile: "./tests/data/labels/projects/z88dk/general_v2/main.map",
						srcDirs: [""],	// Sources mode
						excludeFiles: []
					}]
				};
				lbls.readListFiles(config, new MemoryModelAllRam());

				// Tests
				let res = lbls.getFileAndLineForAddress(0x18000);
				assert.ok(res.fileName.endsWith('main.asm'));
				assert.equal(16 - 1, res.lineNr);

				res = lbls.getFileAndLineForAddress(0x1801F);
				assert.ok(res.fileName.endsWith('filea.asm'));
				assert.equal(2 - 1, res.lineNr);

				res = lbls.getFileAndLineForAddress(0x18023);
				assert.ok(res.fileName.endsWith('dir/filea b.asm'));
				assert.equal(7 - 1, res.lineNr);

				res = lbls.getFileAndLineForAddress(0x18027);
				assert.ok(res.fileName.endsWith('filea.asm'));
				assert.equal(16 - 1, res.lineNr);
			});


			test('file/line -> address', () => {
				// Read the list file
				const config = {
					z88dkv2: [{
						path: './tests/data/labels/projects/z88dk/general_v2/main.lis',
						mapFile: "./tests/data/labels/projects/z88dk/general_v2/main.map",
						srcDirs: [""],	// Sources mode
						excludeFiles: []
					}]
				};
				lbls.readListFiles(config, new MemoryModelAllRam());

				// Tests
				let address = lbls.getAddrForFileAndLine('main.asm', 16 - 1);
				assert.equal(address, 0x18000);

				address = lbls.getAddrForFileAndLine('filea.asm', 2 - 1);
				assert.equal(address, 0x1801F);

				address = lbls.getAddrForFileAndLine('filea.asm', 7 - 1);
				assert.equal(address, 0x18020);

				address = lbls.getAddrForFileAndLine('dir/filea b.asm', 3 - 1);
				assert.equal(address, 0x18022);

				address = lbls.getAddrForFileAndLine('dir/filea b.asm', 17 - 1);
				assert.equal(address, 0x18026);

				address = lbls.getAddrForFileAndLine('dir/filea b.asm', 16 - 1);
				assert.equal(address, 0x18026);

				address = lbls.getAddrForFileAndLine('filea.asm', 15 - 1);
				assert.equal(address, 0x18027);

				address = lbls.getAddrForFileAndLine('filea.asm', 16 - 1);
				assert.equal(address, 0x18027);
			});

		});

	});


	test('Occurrence of WPMEM, ASSERTION, LOGPOINT', () => {
		// Read the list file
		const config = {
			z88dkv2: [{
				path: './tests/data/labels/projects/z88dk/general_v2/main.lis',
				mapFile: "./tests/data/labels/projects/z88dk/general_v2/main.map",
				srcDirs: [""],	// Sources mode
				excludeFiles: []
			}]
		};
		lbls.readListFiles(config, new MemoryModelAllRam());

		// Test WPMEM
		const wpLines = lbls.getWatchPointLines();
		assert.equal(wpLines.length, 2);
		assert.equal(wpLines[0].address, 0x1800D);
		assert.equal(wpLines[0].line, "WPMEM");
		assert.equal(wpLines[1].address, 0x18016);
		assert.equal(wpLines[1].line, "WPMEM");

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
		let tmpFile;
		let tmpMapFile;
		let parser: any;

		setup(() => {
			// File path for a temporary file.
			tmpFile = path.join(os.tmpdir(), 'dezog_labels_z88dk.lis');
			// Write file.
			fs.writeFileSync(tmpFile,
			`
    15                  label0000:
    16                  label2000:
    17                  label4000:
    18                  label6000:
    19                  label8000:
    20                  labelA000:
    21                  labelC000:
 99999                  labelE000:
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
			parser = new Z88dkLabelParserV2 (
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

