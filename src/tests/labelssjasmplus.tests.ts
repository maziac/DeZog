
import * as assert from 'assert';
import {Labels} from '../labels/labels';
import {readFileSync} from 'fs';
//import { Settings } from '../settings';

suite('Labels (sjasmplus)', () => {

	setup(() => {
		Labels.init(250);
	});


	suite('Labels', () => {

		test('Labels', () => {
			// Read result data (labels)
			const labelsFile = readFileSync('./src/tests/data/labels/projects/sjasmplus/general/general.labels').toString().split('\n');

			// Read the list file
			const config = {
				sjasmplus: [{
					path: './src/tests/data/labels/projects/sjasmplus/general/general.sld', srcDirs: [""],	// Sources mode
					excludeFiles: [],
					disableBanking: true
				}]
			};

			Labels.readListFiles(config);

			// Compare all labels
			for (const labelLine of labelsFile) {
				if (labelLine == '')
					continue;
				// A line looks like: "modfilea.fa_label3.mid.local: equ 0x00009003"
				const match = /@?(.*):\s+equ\s+(.*)/i.exec(labelLine)!;
				assert.notEqual(undefined, match);	// Check that line is parsed correctly
				const label = match[1];
				const value = parseInt(match[2], 16);
				// Check
				const res = Labels.getNumberForLabel(label);
				assert.equal(value, res!);
			}
		});

		test('IF 0 Labels', () => {
			// Read the list file
			const config = {
				sjasmplus: [{
					path: './src/tests/data/labels/projects/sjasmplus/general/general.sld',
					srcDirs: [""],	// Sources mode
					excludeFiles: []
				}]
			};

			Labels.readListFiles(config);

			// Test the a label under an IF 0/ENDIF is not defined
			const res = Labels.getNumberForLabel('label5');
			assert.equal(undefined, res);
		});


		suite('Sources-Mode', () => {

			test('Labels location', () => {
				// Read the list file
				const config = {
					sjasmplus: [{
						path: './src/tests/data/labels/projects/sjasmplus/general/general.sld',
						srcDirs: [""],	// Sources mode
						excludeFiles: []
					}]
				};
				Labels.readListFiles(config);

				// Test
				let res = Labels.getLocationOfLabel('label1')!;
				assert.notEqual(undefined, res);
				assert.equal('main.asm', res.file);
				assert.equal(18 - 1, res.lineNr);	// line number starts at 0

				res = Labels.getLocationOfLabel('fa_label1')!;
				assert.notEqual(undefined, res);
				assert.equal('filea.asm', res.file);
				assert.equal(2 - 1, res.lineNr);	// line number starts at 0

				res = Labels.getLocationOfLabel('modfilea.fa_label2')!;
				assert.notEqual(undefined, res);
				assert.equal('filea.asm', res.file);
				assert.equal(6 - 1, res.lineNr);	// line number starts at 0

				res = Labels.getLocationOfLabel('modfilea.fa_label3.mid')!;
				assert.notEqual(undefined, res);
				assert.equal('filea.asm', res.file);
				assert.equal(9 - 1, res.lineNr);	// line number starts at 0

				res = Labels.getLocationOfLabel('modfilea.fab_label1')!;
				assert.notEqual(undefined, res);
				assert.equal('filea_b.asm', res.file);
				assert.equal(3 - 1, res.lineNr);	// line number starts at 0

				res = Labels.getLocationOfLabel('modfilea.modfileb.fab_label2')!;
				assert.notEqual(undefined, res);
				assert.equal('filea_b.asm', res.file);
				assert.equal(8 - 1, res.lineNr);	// line number starts at 0

				res = Labels.getLocationOfLabel('global_label1')!;
				assert.notEqual(undefined, res);
				assert.equal('filea_b.asm', res.file);
				assert.equal(12 - 1, res.lineNr);	// line number starts at 0

				res = Labels.getLocationOfLabel('global_label2')!;
				assert.notEqual(undefined, res);
				assert.equal('filea_b.asm', res.file);
				assert.equal(14 - 1, res.lineNr);	// line number starts at 0

				res = Labels.getLocationOfLabel('modfilea.fab_label_equ1')!;
				assert.notEqual(undefined, res);
				assert.equal('filea_b.asm', res.file);
				assert.equal(22 - 1, res.lineNr);	// line number starts at 0
			});


			test('address -> file/line', () => {
				// Read the list file
				const config = {
					sjasmplus: [{
						path: './src/tests/data/labels/projects/sjasmplus/general/general.sld',
						srcDirs: [""],	// Sources mode
						excludeFiles: []
					}]
				};
				Labels.readListFiles(config);

				// Tests
				let res = Labels.getFileAndLineForAddress(0x10000 + 0x8000);
				assert.ok(res.fileName.endsWith('main.asm'));
				assert.equal(19 - 1, res.lineNr);

				res = Labels.getFileAndLineForAddress(0x10000 + 0x9001);
				assert.ok(res.fileName.endsWith('filea.asm'));
				assert.equal(7 - 1, res.lineNr);

				res = Labels.getFileAndLineForAddress(0x10000 + 0x9005);
				assert.ok(res.fileName.endsWith('filea_b.asm'));
				assert.equal(4 - 1, res.lineNr);

				res = Labels.getFileAndLineForAddress(0x10000 + 0x900B);
				assert.ok(res.fileName.endsWith('filea.asm'));
				assert.equal(17 - 1, res.lineNr);
			});


			test('file/line -> address', () => {
				// Read the list file
				const config = {
					sjasmplus: [{
						path: './src/tests/data/labels/projects/sjasmplus/general/general.sld', srcDirs: [""],	// Sources mode
						excludeFiles: []
					}]
				};

				Labels.readListFiles(config);

				// Tests
				let address = Labels.getAddrForFileAndLine('main.asm', 19 - 1);
				assert.equal(0x10000 + 0x8000, address);

				address = Labels.getAddrForFileAndLine('filea.asm', 7 - 1);
				assert.equal(0x10000 + 0x9001, address);

				address = Labels.getAddrForFileAndLine('filea_b.asm', 4 - 1);
				assert.equal(0x10000 + 0x9005, address);

				address = Labels.getAddrForFileAndLine('filea.asm', 17 - 1);
				assert.equal(0x10000 + 0x900B, address);
			});

		});

	});


	test('Occurence of WPMEM, ASSERTION, LOGPOINT', () => {
		// Read the list file
		const config = {
			sjasmplus: [{
				path: './src/tests/data/labels/projects/sjasmplus/general/general.sld', srcDirs: [""],	// Sources mode
				excludeFiles: []
			}]
		};

		Labels.readListFiles(config);

		// Test WPMEM
		const wpLines = Labels.getWatchPointLines();
		assert.equal(wpLines.length, 1);
		assert.equal(wpLines[0].address, 0x10000 + 0x8200);
		assert.equal(wpLines[0].line, "WPMEM");

		// Test ASSERTION
		const assertionLines = Labels.getAssertionLines();
		assert.equal(assertionLines.length, 1);
		assert.equal(assertionLines[0].address, 0x10000 + 0x8005);
		assert.equal(assertionLines[0].line, "ASSERTION");

		// Test LOGPOINT
		const lpLines = Labels.getLogPointLines();
		assert.equal(lpLines.length, 1);
		assert.equal(lpLines[0].address, 0x10000 + 0x800F);
		assert.equal(lpLines[0].line, "LOGPOINT");
	});

});

