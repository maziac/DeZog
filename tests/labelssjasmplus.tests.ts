
import * as assert from 'assert';
import {LabelsClass} from '../src/labels/labels';
import {readFileSync} from 'fs';
import {SjasmplusSldLabelParser} from '../src/labels/sjasmplussldlabelparser';
import {MemoryModelZxNext} from '../src/remotes/MemoryModel/predefinedmemorymodels';


suite('Labels (sjasmplus)', () => {

	suite('Labels', () => {

		test('Labels', () => {
			// Read result data (labels)
			const labelsFile = readFileSync('./tests/data/labels/projects/sjasmplus/general/general.labels').toString().split('\n');

			// Read the list file
			const config = {
				sjasmplus: [{
					path: './tests/data/labels/projects/sjasmplus/general/general.sld', srcDirs: [""],	// Sources mode
					excludeFiles: [],
					disableBanking: true
				}]
			};
			const lbls = new LabelsClass();
			lbls.readListFiles(config);

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
				const res = lbls.getNumberForLabel(label);
				assert.equal(value, res!);
			}
		});

		test('IF 0 Labels', () => {
			// Read the list file
			const config = {
				sjasmplus: [{
					path: './tests/data/labels/projects/sjasmplus/general/general.sld',
					srcDirs: [""],	// Sources mode
					excludeFiles: []
				}]
			};
			const lbls = new LabelsClass();
			lbls.readListFiles(config);

			// Test the a label under an IF 0/ENDIF is not defined
			const res = lbls.getNumberForLabel('label5');
			assert.equal(undefined, res);
		});


		suite('Sources-Mode', () => {

			test('Labels location', () => {
				// Read the list file
				const config = {
					sjasmplus: [{
						path: './tests/data/labels/projects/sjasmplus/general/general.sld',
						srcDirs: [""],	// Sources mode
						excludeFiles: []
					}]
				};
				const lbls = new LabelsClass();
				lbls.readListFiles(config);

				// Test
				let res = lbls.getLocationOfLabel('label1')!;
				assert.notEqual(undefined, res);
				assert.equal('main.asm', res.file);
				assert.equal(18 - 1, res.lineNr);	// line number starts at 0

				res = lbls.getLocationOfLabel('fa_label1')!;
				assert.notEqual(undefined, res);
				assert.equal('filea.asm', res.file);
				assert.equal(2 - 1, res.lineNr);	// line number starts at 0

				res = lbls.getLocationOfLabel('modfilea.fa_label2')!;
				assert.notEqual(undefined, res);
				assert.equal('filea.asm', res.file);
				assert.equal(6 - 1, res.lineNr);	// line number starts at 0

				res = lbls.getLocationOfLabel('modfilea.fa_label3.mid')!;
				assert.notEqual(undefined, res);
				assert.equal('filea.asm', res.file);
				assert.equal(9 - 1, res.lineNr);	// line number starts at 0

				res = lbls.getLocationOfLabel('modfilea.fab_label1')!;
				assert.notEqual(undefined, res);
				assert.equal('filea_b.asm', res.file);
				assert.equal(3 - 1, res.lineNr);	// line number starts at 0

				res = lbls.getLocationOfLabel('modfilea.modfileb.fab_label2')!;
				assert.notEqual(undefined, res);
				assert.equal('filea_b.asm', res.file);
				assert.equal(8 - 1, res.lineNr);	// line number starts at 0

				res = lbls.getLocationOfLabel('global_label1')!;
				assert.notEqual(undefined, res);
				assert.equal('filea_b.asm', res.file);
				assert.equal(12 - 1, res.lineNr);	// line number starts at 0

				res = lbls.getLocationOfLabel('global_label2')!;
				assert.notEqual(undefined, res);
				assert.equal('filea_b.asm', res.file);
				assert.equal(14 - 1, res.lineNr);	// line number starts at 0

				res = lbls.getLocationOfLabel('modfilea.fab_label_equ1')!;
				assert.notEqual(undefined, res);
				assert.equal('filea_b.asm', res.file);
				assert.equal(22 - 1, res.lineNr);	// line number starts at 0
			});


			test('address -> file/line', () => {
				// Read the list file
				const config = {
					sjasmplus: [{
						path: './tests/data/labels/projects/sjasmplus/general/general.sld',
						srcDirs: [""],	// Sources mode
						excludeFiles: []
					}]
				};
				const lbls = new LabelsClass();
				lbls.readListFiles(config);

				// Tests
				let res = lbls.getFileAndLineForAddress(0x10000 + 0x8000);
				assert.ok(res.fileName.endsWith('main.asm'));
				assert.equal(19 - 1, res.lineNr);

				res = lbls.getFileAndLineForAddress(0x10000 + 0x9001);
				assert.ok(res.fileName.endsWith('filea.asm'));
				assert.equal(7 - 1, res.lineNr);

				res = lbls.getFileAndLineForAddress(0x10000 + 0x9005);
				assert.ok(res.fileName.endsWith('filea_b.asm'));
				assert.equal(4 - 1, res.lineNr);

				res = lbls.getFileAndLineForAddress(0x10000 + 0x900B);
				assert.ok(res.fileName.endsWith('filea.asm'));
				assert.equal(17 - 1, res.lineNr);
			});


			test('file/line -> address', () => {
				// Read the list file
				const config = {
					sjasmplus: [{
						path: './tests/data/labels/projects/sjasmplus/general/general.sld', srcDirs: [""],	// Sources mode
						excludeFiles: []
					}]
				};
				const lbls = new LabelsClass();
				lbls.readListFiles(config);

				// Tests
				let address = lbls.getAddrForFileAndLine('main.asm', 19 - 1);
				assert.equal(0x10000 + 0x8000, address);

				address = lbls.getAddrForFileAndLine('filea.asm', 7 - 1);
				assert.equal(0x10000 + 0x9001, address);

				address = lbls.getAddrForFileAndLine('filea_b.asm', 4 - 1);
				assert.equal(0x10000 + 0x9005, address);

				address = lbls.getAddrForFileAndLine('filea.asm', 17 - 1);
				assert.equal(0x10000 + 0x900B, address);
			});

		});

	});


	test('Occurrence of WPMEM, ASSERTION, LOGPOINT', () => {
		// Read the list file
		const config = {
			sjasmplus: [{
				path: './tests/data/labels/projects/sjasmplus/general/general.sld', srcDirs: [""],	// Sources mode
				excludeFiles: []
			}]
		};
		const lbls = new LabelsClass();
		lbls.readListFiles(config);

		// Test WPMEM
		const wpLines = lbls.getWatchPointLines();
		assert.equal(wpLines.length, 1);
		assert.equal(wpLines[0].address, 0x10000 + 0x8200);
		assert.equal(wpLines[0].line, "WPMEM");

		// Test ASSERTION
		const assertionLines = lbls.getAssertionLines();
		assert.equal(assertionLines.length, 1);
		assert.equal(assertionLines[0].address, 0x10000 + 0x8005);
		assert.equal(assertionLines[0].line, "ASSERTION");

		// Test LOGPOINT
		const lpLines = lbls.getLogPointLines();
		assert.equal(lpLines.length, 1);
		assert.equal(lpLines[0].address, 0x10000 + 0x800F);
		assert.equal(lpLines[0].line, "LOGPOINT");
	});

	suite('Self modifying code', () => {

		let lbls;

		setup(() => {
			// Read the list file
			const config = {
				sjasmplus: [{
					path: './tests/data/labels/projects/sjasmplus/sld_self_modifying_code/main.sld', srcDirs: [""],	// Sources mode
					excludeFiles: []
				}]
			};
			lbls = new LabelsClass();
			lbls.readListFiles(config);
			lbls.readListFiles(config);
		});

		test('Start addresses found', () => {
			// Note 0x8000 is at bank 4. So: 0x05....

			// 0x8000
			let entry = lbls.getFileAndLineForAddress(0x058000);
			assert.notEqual(entry.fileName, '');	// Known

			// 0x8100
			entry = lbls.getFileAndLineForAddress(0x058100);
			assert.notEqual(entry.fileName, '');	// Known

			// 0x8200, 0x8201, 0x8203, 0x8206, 0x800A
			entry = lbls.getFileAndLineForAddress(0x058200);
			assert.notEqual(entry.fileName, '');	// Known
			entry = lbls.getFileAndLineForAddress(0x058201);
			assert.notEqual(entry.fileName, '');	// Known
			entry = lbls.getFileAndLineForAddress(0x058203);
			assert.notEqual(entry.fileName, '');	// Known
			entry = lbls.getFileAndLineForAddress(0x058206);
			assert.notEqual(entry.fileName, '');	// Known
			entry = lbls.getFileAndLineForAddress(0x05820A);
			assert.notEqual(entry.fileName, '');	// Known

			// 0x8300
			entry = lbls.getFileAndLineForAddress(0x058300);
			assert.notEqual(entry.fileName, '');	// Known
		});

		test('Address ranges (after start address) found', () => {
			// Note 0x8000 is at bank 4. So: 0x05....

			// 0x8001-0x8002
			let entry = lbls.getFileAndLineForAddress(0x058001);
			assert.notEqual(entry.fileName, '');	// Known
			entry = lbls.getFileAndLineForAddress(0x058002);
			assert.notEqual(entry.fileName, '');	// Known

			// 0x8101-0x8102
			entry = lbls.getFileAndLineForAddress(0x058101);
			assert.notEqual(entry.fileName, '');	// Known
			entry = lbls.getFileAndLineForAddress(0x058102);
			assert.notEqual(entry.fileName, '');	// Known

			// 0x8202, 0x8004, 0x8005, 0x8007, 0x8008, 0x8009
			entry = lbls.getFileAndLineForAddress(0x058202);
			assert.notEqual(entry.fileName, '');	// Known
			entry = lbls.getFileAndLineForAddress(0x058204);
			assert.notEqual(entry.fileName, '');	// Known
			entry = lbls.getFileAndLineForAddress(0x058205);
			assert.notEqual(entry.fileName, '');	// Known
			entry = lbls.getFileAndLineForAddress(0x058207);
			assert.notEqual(entry.fileName, '');	// Known
			entry = lbls.getFileAndLineForAddress(0x058208);
			assert.notEqual(entry.fileName, '');	// Known
			entry = lbls.getFileAndLineForAddress(0x058209);
			assert.notEqual(entry.fileName, '');	// Known

			// 0x8301
			entry = lbls.getFileAndLineForAddress(0x058301);
			assert.notEqual(entry.fileName, '');	// Known
		});


		test('addressAdd4', () => {
			const mm = new MemoryModelZxNext();
			const sdlParser = new SjasmplusSldLabelParser(mm, undefined as any, undefined as any, undefined as any, undefined as any, undefined as any, undefined as any, undefined as any, undefined as any, undefined as any) as any;

			// 64k address
			sdlParser.bankSize = 0x10000;
			assert.equal(sdlParser.addressAdd4(0x0000), 0x0004);
			assert.equal(sdlParser.addressAdd4(0xFFFF), 0xFFFF);
			assert.equal(sdlParser.addressAdd4(0xFFFE), 0xFFFF);
			assert.equal(sdlParser.addressAdd4(0xFFFD), 0xFFFF);
			assert.equal(sdlParser.addressAdd4(0xFFFC), 0xFFFF);
			assert.equal(sdlParser.addressAdd4(0xFFFB), 0xFFFF);
			assert.equal(sdlParser.addressAdd4(0xFFFA), 0xFFFE);

			// long address
			sdlParser.bankSize = 0x2000;
			assert.equal(sdlParser.addressAdd4(0x018000), 0x018004);
			assert.equal(sdlParser.addressAdd4(0x019FFE), 0x019FFF);
			assert.equal(sdlParser.addressAdd4(0x01FFFF), 0x01FFFF);
		});

	});

});

