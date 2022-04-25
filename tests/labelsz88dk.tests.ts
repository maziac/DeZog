
import * as assert from 'assert';
import {LabelsClass} from '../src/labels/labels';
import {readFileSync} from 'fs';
//import { Settings } from '../src/settings';

suite('Labels (z88dk)', () => {
	let lbls;

	setup(() => {
		lbls = new LabelsClass();
	});


	suite('Labels', () => {

		test('Labels (with map)', () => {
			// Read result data (labels)
			const labelsFile = readFileSync('./tests/data/labels/projects/z88dk/general/main.map').toString().split('\n');

			// Read the list file
			const config = {
				z88dk: [{
					path: './tests/data/labels/projects/z88dk/general/main.lis',
					mapFile: "./tests/data/labels/projects/z88dk/general/main.map",
					srcDirs: [""],	// Sources mode
					excludeFiles: []
				}]
			};
			lbls.readListFiles(config);

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
				const value = parseInt(match[2], 16);
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
					path: './tests/data/labels/projects/z88dk/general/main.lis',
					mapFile: "./tests/data/labels/projects/z88dk/general/main.map",
					srcDirs: [""],	// Sources mode
					excludeFiles: []
				}]
			};
			lbls.readListFiles(config);

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
					path: './tests/data/labels/projects/z88dk/general/main.lis',
					mapFile: "./tests/data/labels/projects/z88dk/general/main.map",
					srcDirs: [""],	// Sources mode
					excludeFiles: []
				}]
			};
			lbls.readListFiles(config);

			// Test that a label under an IF 0/ENDIF is not defined => not easily possible with
			// z80asm, so simply allow it.
			const res = lbls.getNumberForLabel('label5');
			//assert.equal(undefined, res); // This would be correct, but is not easily possible with z80asm
			assert.equal(0x8006, res);
		});


		suite('ListFile-Mode', () => {

			test('Labels location', () => {
				// Read the list file
				const fname = './tests/data/labels/projects/z88dk/general/main.lis';
				const config = {
					z88dk: [{
						path: fname,
						srcDirs: [],	// ListFile-Mode
						mapFile: "./tests/data/labels/projects/z88dk/general/main.map",
						excludeFiles: []
					}]
				};
				lbls.readListFiles(config);

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
				const listFile = readFileSync('./tests/data/labels/projects/z88dk/general/main.lis').toString().split('\n');

				// Read the list file
				const config = {
					z88dk: [{
						path: './tests/data/labels/projects/z88dk/general/main.lis',
						srcDirs: [],	// ListFile-Mode
						mapFile: "./tests/data/labels/projects/z88dk/general/main.map"
					}]
				};
				lbls.readListFiles(config);

				// Compare all addresses
				const count = listFile.length;
				for (let lineNr = 0; lineNr < count; lineNr++) {
					const line = listFile[lineNr];
					// A valid line looks like: " 18    8001 3E 05        label2:	ld a,5"
					const match = /^\s*[0-9+]+\s+([0-9a-f]+)\s[0-9a-f]+/i.exec(line);
					if (!match)
						continue;
					// Valid address line
					const address = parseInt(match[1], 16);
					// Check
					const res = lbls.getFileAndLineForAddress(address);
					assert.ok(res.fileName.endsWith('main.lis'));
					assert.equal(lineNr, res.lineNr);
				}
			});


			test('file/line -> address', () => {
				// Read the list file as result data (addresses)
				const filename = './tests/data/labels/projects/z88dk/general/main.lis';
				const listFile = readFileSync(filename).toString().split('\n');

				// Read the list file
				const config = {
					z88dk: [{
						path: './tests/data/labels/projects/z88dk/general/main.lis',
						srcDirs: [],	// ListFile-Mode
						mapFile: "./tests/data/labels/projects/z88dk/general/main.map"
					}]
				};
				lbls.readListFiles(config);

				// Compare all addresses
				const count = listFile.length;
				for (let lineNr = 0; lineNr < count; lineNr++) {
					const line = listFile[lineNr];
					// A valid line looks like: " 18    8001 3E 05        label2:	ld a,5"
					const match = /^\s*[0-9+]+\s+([0-9a-f]+)\s[0-9a-f]+/i.exec(line);
					if (!match)
						continue;
					// Valid address line
					const address = parseInt(match[1], 16);
					// Check
					let resultAddr = lbls.getAddrForFileAndLine(filename, lineNr);
					assert.equal(address, resultAddr);
				}
			});

		});


		suite('Sources-Mode', () => {

			test('Labels location', () => {
				// Read the list file
				const config = {
					z88dk: [{
						path: './tests/data/labels/projects/z88dk/general/main.lis',
						mainFile: "main.asm",
						mapFile: "./tests/data/labels/projects/z88dk/general/main.map",
						srcDirs: [""],	// Sources mode
						excludeFiles: []
					}]
				};
				lbls.readListFiles(config);

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
						path: './tests/data/labels/projects/z88dk/general/main.lis',
						mainFile: "main.asm",
						mapFile: "./tests/data/labels/projects/z88dk/general/main.map",
						srcDirs: [""],	// Sources mode
						excludeFiles: []
					}]
				};
				lbls.readListFiles(config);

				// Tests
				let res = lbls.getFileAndLineForAddress(0x8000);
				assert.ok(res.fileName.endsWith('main.asm'));
				assert.equal(16 - 1, res.lineNr);

				res = lbls.getFileAndLineForAddress(0x800D);
				assert.ok(res.fileName.endsWith('filea.asm'));
				assert.equal(7 - 1, res.lineNr);

				res = lbls.getFileAndLineForAddress(0x8010);
				assert.ok(res.fileName.endsWith('filea_b.asm'));
				assert.equal(7 - 1, res.lineNr);

				res = lbls.getFileAndLineForAddress(0x8014);
				assert.ok(res.fileName.endsWith('filea.asm'));
				assert.equal(16 - 1, res.lineNr);
			});


			test('file/line -> address', () => {
				// Read the list file
				const config = {
					z88dk: [{
						path: './tests/data/labels/projects/z88dk/general/main.lis',
						mainFile: "main.asm",
						mapFile: "./tests/data/labels/projects/z88dk/general/main.map",
						srcDirs: [""],	// Sources mode
						excludeFiles: []
					}]
				};
				lbls.readListFiles(config);

				// Tests
				let address = lbls.getAddrForFileAndLine('main.asm', 16 - 1);
				assert.equal(0x8000, address);

				address = lbls.getAddrForFileAndLine('filea.asm', 6 - 1);
				assert.equal(0x800D, address);

				address = lbls.getAddrForFileAndLine('filea.asm', 7 - 1);
				assert.equal(0x800D, address);

				address = lbls.getAddrForFileAndLine('filea_b.asm', 4 - 1);
				assert.equal(0x8010, address);

				address = lbls.getAddrForFileAndLine('filea_b.asm', 15 - 1);
				assert.equal(0x8013, address);

				address = lbls.getAddrForFileAndLine('filea.asm', 15 - 1);
				assert.equal(0x8014, address);

				address = lbls.getAddrForFileAndLine('filea.asm', 15 - 1);
				assert.equal(0x8014, address);

				address = lbls.getAddrForFileAndLine('filea.asm', 17 - 1);
				assert.equal(0x8015, address);
			});

		});

	});


	test('Occurrence of WPMEM, ASSERTION, LOGPOINT', () => {
		// Read the list file
		const config = {
			z88dk: [{
				path: './tests/data/labels/projects/z88dk/general/main.lis',
				mainFile: "main.asm",
				mapFile: "./tests/data/labels/projects/z88dk/general/main.map",
				srcDirs: [""],	// Sources mode
				excludeFiles: []
			}]
		};
		lbls.readListFiles(config);

		// Test WPMEM
		const wpLines = lbls.getWatchPointLines();
		assert.equal(wpLines.length, 1);
		assert.equal(wpLines[0].address, 0x8008);
		assert.equal(wpLines[0].line, "WPMEM");

		// Test ASSERTION
		const assertionLines = lbls.getAssertionLines();
		assert.equal(assertionLines.length, 1);
		assert.equal(assertionLines[0].address, 0x8005);
		assert.equal(assertionLines[0].line, "ASSERTION");

		// Test LOGPOINT
		const lpLines = lbls.getLogPointLines();
		assert.equal(lpLines.length, 1);
		assert.equal(lpLines[0].address, 0x8006);
		assert.equal(lpLines[0].line, "LOGPOINT");
	});

});

