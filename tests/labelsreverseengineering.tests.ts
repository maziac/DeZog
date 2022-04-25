import * as assert from 'assert';
import {LabelsClass} from '../src/labels/labels';

suite('Labels (revEng)', () => {

	let lbls;

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
			assert.equal(0, res.address);
			assert.equal(fname, res.file);
			assert.equal(3, res.lineNr);	// line number starts at 0

			res = lbls.getLocationOfLabel('label2')!;
			assert.equal(1, res.address);
			assert.equal(fname, res.file);
			assert.equal(6, res.lineNr);	// line number starts at 0

			res = lbls.getLocationOfLabel('long_label1')!;
			assert.equal(0xC1AA + (3 + 1) * 0x10000, res.address);
			assert.equal(fname, res.file);
			assert.equal(35, res.lineNr);	// line number starts at 0

			res = lbls.getLocationOfLabel('long_label2')!;
			assert.equal(0xC1AB + (44 + 1) * 0x10000, res.address);
			assert.equal(fname, res.file);
			assert.equal(37, res.lineNr);	// line number starts at 0
		});

		test('local labels', () => {
			lbls.readListFiles(config);

			let addr = lbls.getNumberForLabel('label2')!;
			assert.equal(1, addr);

			addr = lbls.getNumberForLabel('label2.locala')!;
			assert.equal(3, addr);

			addr = lbls.getNumberForLabel('label2.localb')!;
			assert.equal(5, addr);

			addr = lbls.getNumberForLabel('label6.locala')!;
			assert.equal(7, addr);
		});

		test('address -> file/line', () => {
			lbls.readListFiles(config);
			const fname = config.revEng[0].path;

			// label2
			let res = lbls.getFileAndLineForAddress(0x0001);
			assert.equal(fname, res.fileName);
			assert.equal(6, res.lineNr);
			res = lbls.getFileAndLineForAddress(0x0002);
			assert.equal(fname, res.fileName);
			assert.equal(6, res.lineNr);

			// label2.locala
			res = lbls.getFileAndLineForAddress(0x0003);
			assert.equal(fname, res.fileName);
			assert.equal(8, res.lineNr);
			res = lbls.getFileAndLineForAddress(0x0004);
			assert.equal(fname, res.fileName);
			assert.equal(8, res.lineNr);

			// label2.localb
			res = lbls.getFileAndLineForAddress(0x0003);
			assert.equal(fname, res.fileName);
			assert.equal(8, res.lineNr);
			res = lbls.getFileAndLineForAddress(0x0004);
			assert.equal(fname, res.fileName);
			assert.equal(8, res.lineNr);

			// no bytes -> no file association
			res = lbls.getFileAndLineForAddress(0x0015);
			assert.equal('', res.fileName);

			// long label: C1AC@3 FA
			res = lbls.getFileAndLineForAddress(0xC1AC + (3 + 1) * 0x10000);
			assert.equal(fname, res.fileName);
			assert.equal(39, res.lineNr);

			// IM 2: bytes stopped by 2 character instruction
			res = lbls.getFileAndLineForAddress(0x0020);
			assert.equal(fname, res.fileName);
			assert.equal(41, res.lineNr);
			res = lbls.getFileAndLineForAddress(0x00021);
			assert.equal(fname, res.fileName);
			assert.equal(41, res.lineNr);
			res = lbls.getFileAndLineForAddress(0x00022);
			assert.equal('', res.fileName);

			// 01 02  03  ; Byte separated with 2 spaces does not belong to bytes
			res = lbls.getFileAndLineForAddress(0x0030);
			assert.equal(fname, res.fileName);
			assert.equal(43, res.lineNr);
			res = lbls.getFileAndLineForAddress(0x00031);
			assert.equal(fname, res.fileName);
			assert.equal(43, res.lineNr);
			res = lbls.getFileAndLineForAddress(0x00032);
			assert.equal('', res.fileName);

			// 01 02 03  , empty line after bytes
			res = lbls.getFileAndLineForAddress(0x0040);
			assert.equal(fname, res.fileName);
			assert.equal(44, res.lineNr);
			res = lbls.getFileAndLineForAddress(0x00041);
			assert.equal(fname, res.fileName);
			assert.equal(44, res.lineNr);
			res = lbls.getFileAndLineForAddress(0x00042);
			assert.equal(fname, res.fileName);
			assert.equal(44, res.lineNr);
			res = lbls.getFileAndLineForAddress(0x00043);
			assert.equal('', res.fileName);
		});


		test('file/line -> address', () => {
			lbls.readListFiles(config);
			const fname = config.revEng[0].path;

			// label2
			let addr = lbls.getAddrForFileAndLine(fname, 6);
			assert.equal(0x0001, addr);
			addr = lbls.getAddrForFileAndLine(fname, 7);
			assert.equal(-1, addr);

			// label2.locala
			addr = lbls.getAddrForFileAndLine(fname, 8);
			assert.equal(0x003, addr);

			// label2.localb
			addr = lbls.getAddrForFileAndLine(fname, 9);
			assert.equal(0x005, addr);

			// label4
			addr = lbls.getAddrForFileAndLine(fname, 14);
			assert.equal(0x006, addr);
			addr = lbls.getAddrForFileAndLine(fname, 15);
			assert.equal(0x006, addr);
			addr = lbls.getAddrForFileAndLine(fname, 16);
			assert.equal(0x006, addr);

			// long address
			addr = lbls.getAddrForFileAndLine(fname, 39);
			assert.equal(0xC1AC + (3 + 1) * 0x10000, addr);
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
			assert.notEqual(undefined, warnings);
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
			assert.notEqual(undefined, warnings);
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
			assert.equal(undefined, warnings);
		});
	});


	// TODO:
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

