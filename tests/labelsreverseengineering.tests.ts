import * as assert from 'assert';
import {LabelsClass} from '../src/labels/labels';

suite('Labels (revEng)', () => {

	let lbls: LabelsClass;

	setup(() => {
		lbls = new LabelsClass();
	});

	suite('Labels', () => {

		const config = {
			revEng: [{
				path: 'tests/data/labels/projects/revEng/main.list'
			}]
		};

		test('labels equ', () => {
			lbls.readListFiles(config);

			// Check
			let res = lbls.getNumberForLabel("label_equ1");
			assert.equal(res, 100);

			res = lbls.getNumberForLabel("label_equ2");
			assert.equal(res, 200);
		});

		test('labels location', () => {
			lbls.readListFiles(config);
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
			lbls.readListFiles(config);

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
			lbls.readListFiles(config);
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

			// no bytes -> no file association
			res = lbls.getFileAndLineForAddress(0x0015);
			assert.equal(res.fileName, '');

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
			lbls.readListFiles(config);
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
			assert.equal(addr, -1);

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
			const config = {
				revEng: [{
					path: 'tests/data/labels/projects/revEng/wrong1.list'
				}]
			};
			lbls.readListFiles(config);

			// Check
			const warnings = lbls.getWarnings();
			assert.notEqual(warnings, undefined);
			const warning = warnings.split('\n')[1];
			assert.ok(warning.startsWith('Could not evaluate expression'));
		});

		test('line ignored', () => {
			const config = {
				revEng: [{
					path: 'tests/data/labels/projects/revEng/wrong2.list'
				}]
			};
			lbls.readListFiles(config);

			// Check
			const warnings = lbls.getWarnings();
			assert.notEqual(warnings, undefined);
			const warning = warnings.split('\n')[1];
			assert.ok(warning.startsWith('Line ignored'));
		});

		test('no warning', () => {
			const config = {
				revEng: [{
					path: 'tests/data/labels/projects/revEng/main.list'
				}]
			};
			lbls.readListFiles(config);

			// Check
			const warnings = lbls.getWarnings();
			assert.equal(warnings, undefined);
		});
	});


	test('Occurrence of WPMEM, ASSERTION, LOGPOINT', () => {
		const config = {
			revEng: [{
				path: 'tests/data/labels/projects/revEng/wpmemetc.list'
			}]
		};
		lbls.readListFiles(config);

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

});

