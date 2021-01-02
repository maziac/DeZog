
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
			const fPath = './src/tests/data/labels/projects/z80asm/general/general.list';
			// Read the list file
			const config={
				z80asm: [{
					path: fPath,
					srcDirs: [""],	// Sources mode
					excludeFiles: []
				}]
			};
			Labels.readListFiles(config);

			// Check the labels
			let res = Labels.getNumberForLabel('label_equ1');
			assert.equal(100, res);

			res = Labels.getNumberForLabel('label1');
			assert.equal(0x8000, res);

			res = Labels.getNumberForLabel('label2');
			assert.equal(0x8001, res);

			res = Labels.getNumberForLabel('.locala');
			assert.equal(0x8003, res);

			res = Labels.getNumberForLabel('.localb');
			assert.equal(0x8005, res);

			res = Labels.getNumberForLabel('label3');
			assert.equal(0x8006, res);

			res = Labels.getNumberForLabel('label4');
			assert.equal(0x800C, res);

			res = Labels.getNumberForLabel('label4_1');
			assert.equal(0x800F, res);

			res = Labels.getNumberForLabel('label6');
			assert.equal(0x8012, res);

			res = Labels.getNumberForLabel('.local');
			assert.equal(0x8013, res);

			res = Labels.getNumberForLabel('data');
			assert.equal(0x8200, res);

			res = Labels.getNumberForLabel('fab_label1');
			assert.equal(0x9003, res);

			res = Labels.getNumberForLabel('fab_label_equ1');
			assert.equal(70, res);

		});

		
		suite('ListFile-Mode', () => {

			test('Labels location', () => {
				// Read the list file
				const fname='./src/tests/data/labels/projects/z80asm/general/general.list';
				const config={z80asm: [{path: fname, srcDirs: []}]};	// ListFile-Mode
				Labels.readListFiles(config);

				// Test
				let res=Labels.getLocationOfLabel('label1')!;
				assert.notEqual(undefined, res);
				assert.equal(fname, res.file);
				assert.equal(16-1, res.lineNr);	// line number starts at 0

				res=Labels.getLocationOfLabel('fa_label1')!;
				assert.notEqual(undefined, res);
				assert.equal(fname, res.file);
				assert.equal(68-1, res.lineNr);	// line number starts at 0

				res=Labels.getLocationOfLabel('fa_label2')!;
				assert.notEqual(undefined, res);
				assert.equal(fname, res.file);
				assert.equal(72-1, res.lineNr);	// line number starts at 0

				res=Labels.getLocationOfLabel('fa_label3.mid')!;
				assert.notEqual(undefined, res);
				assert.equal(fname, res.file);
				assert.equal(75-1, res.lineNr);	// line number starts at 0

				res=Labels.getLocationOfLabel('fab_label1')!;
				assert.notEqual(undefined, res);
				assert.equal(fname, res.file);
				assert.equal(80-1, res.lineNr);	// line number starts at 0

				res=Labels.getLocationOfLabel('fab_label2')!;
				assert.notEqual(undefined, res);
				assert.equal(fname, res.file);
				assert.equal(84-1, res.lineNr);	// line number starts at 0

				res=Labels.getLocationOfLabel('global_label1')!;
				assert.notEqual(undefined, res);
				assert.equal(fname, res.file);
				assert.equal(87-1, res.lineNr);	// line number starts at 0

				res=Labels.getLocationOfLabel('global_label2')!;
				assert.notEqual(undefined, res);
				assert.equal(fname, res.file);
				assert.equal(89-1, res.lineNr);	// line number starts at 0

				res=Labels.getLocationOfLabel('fab_label_equ1')!;
				assert.notEqual(undefined, res);
				assert.equal(fname, res.file);
				assert.equal(97-1, res.lineNr);	// line number starts at 0
			});

			test('address -> file/line', () => {
				const fPath = './src/tests/data/labels/projects/z80asm/general/general.list';
				// Read the list file as result data (addresses)
				const listFile=readFileSync(fPath).toString().split('\n');

				// Read the list file
				const config={z80asm: [{path: fPath, srcDirs: []}]};	// ListFile-Mode
				Labels.readListFiles(config);

				// Compare all addresses
				const count=listFile.length;
				for (let lineNr=0; lineNr<count; lineNr++) {
					const line=listFile[lineNr];
					// A valid line looks like: "8001 3E 05        label2:	ld a,5"
					const match=/^([0-9a-f]+)\s[0-9a-f]+/i.exec(line);
					if (!match)
						continue;
					// Valid address line
					const address = parseInt(match[0], 16);
					if (address == 0)
						continue;	// Skip address 0x0000
					// Check
					const res=Labels.getFileAndLineForAddress(address);
					assert.ok(res.fileName.endsWith('general.list'));
					assert.equal(lineNr, res.lineNr);
				}
			});


			test('file/line -> address', () => {
				// Read the list file as result data (addresses)
				const fPath ='./src/tests/data/labels/projects/z80asm/general/general.list';
				const listFile = readFileSync(fPath).toString().split('\n');

				// Read the list file
				const config = {z80asm: [{path: fPath, srcDirs: []}]};	// Sources-Mode
				Labels.readListFiles(config);

				// Compare all addresses
				const count=listFile.length;
				for (let lineNr=0; lineNr<count; lineNr++) {
					const line=listFile[lineNr];
					// A valid line looks like: "8001 3E 05        label2:	ld a,5"
					const match =/^([0-9a-f]+)\s[0-9a-f]+/i.exec(line);
					if (!match)
						continue;
					// Valid address line
					const address = parseInt(match[0], 16);
					if (address == 0)
						continue;	// Skip address 0x0000
					// Check
					let resultAddr=Labels.getAddrForFileAndLine(fPath, lineNr);
					assert.equal(address, resultAddr);
				}
			});

		});


		suite('Sources-Mode', () => {

			test('Labels location', () => {
				// Read the list file
				const config={
					z80asm: [{
						path: './src/tests/data/labels/projects/z80asm/general/general.list',
						srcDirs: [""],	// Sources mode
						excludeFiles: []
					}]
				};
				Labels.readListFiles(config);

				// Test
				let res=Labels.getLocationOfLabel('label1')!;
				assert.notEqual(undefined, res);
				assert.equal('main.asm', res.file);
				assert.equal(15-1, res.lineNr);	// line number starts at 0

				res=Labels.getLocationOfLabel('fa_label1')!;
				assert.notEqual(undefined, res);
				assert.equal('filea.asm', res.file);
				assert.equal(2-1, res.lineNr);	// line number starts at 0

				res=Labels.getLocationOfLabel('fa_label2')!;
				assert.notEqual(undefined, res);
				assert.equal('filea.asm', res.file);
				assert.equal(6-1, res.lineNr);	// line number starts at 0

				res=Labels.getLocationOfLabel('fa_label3.mid')!;
				assert.notEqual(undefined, res);
				assert.equal('filea.asm', res.file);
				assert.equal(9-1, res.lineNr);	// line number starts at 0

				res=Labels.getLocationOfLabel('fab_label1')!;
				assert.notEqual(undefined, res);
				assert.equal('filea_b.asm', res.file);
				assert.equal(3-1, res.lineNr);	// line number starts at 0

				res=Labels.getLocationOfLabel('fab_label2')!;
				assert.notEqual(undefined, res);
				assert.equal('filea_b.asm', res.file);
				assert.equal(7-1, res.lineNr);	// line number starts at 0

				res=Labels.getLocationOfLabel('global_label1')!;
				assert.notEqual(undefined, res);
				assert.equal('filea_b.asm', res.file);
				assert.equal(10-1, res.lineNr);	// line number starts at 0

				res=Labels.getLocationOfLabel('global_label2')!;
				assert.notEqual(undefined, res);
				assert.equal('filea_b.asm', res.file);
				assert.equal(12-1, res.lineNr);	// line number starts at 0

				res=Labels.getLocationOfLabel('fab_label_equ1')!;
				assert.notEqual(undefined, res);
				assert.equal('filea_b.asm', res.file);
				assert.equal(20-1, res.lineNr);	// line number starts at 0
			});


			test('address -> file/line', () => {
				// Read the list file
				const config={
					z80asm: [{
						path: './src/tests/data/labels/projects/z80asm/general/general.list',
						srcDirs: [""],	// Sources mode
						excludeFiles: []
					}]
				};
				Labels.readListFiles(config);

				// Tests
				let res=Labels.getFileAndLineForAddress(0x8000);
				assert.ok(res.fileName.endsWith('main.asm'));
				assert.equal(16-1, res.lineNr);

				res=Labels.getFileAndLineForAddress(0x9001);
				assert.ok(res.fileName.endsWith('filea.asm'));
				assert.equal(7-1, res.lineNr);

				res=Labels.getFileAndLineForAddress(0x9005);
				assert.ok(res.fileName.endsWith('filea_b.asm'));
				assert.equal(11-1, res.lineNr);

				res=Labels.getFileAndLineForAddress(0x9008);
				assert.ok(res.fileName.endsWith('filea.asm'));
				assert.equal(16-1, res.lineNr);
			});


			test('file/line -> address', () => {
				// Read the list file
				const config={
					z80asm: [{
						path: './src/tests/data/labels/projects/z80asm/general/general.list', srcDirs: [""],	// Sources mode
						excludeFiles: []
					}]
				};

				Labels.readListFiles(config);

				// Tests
				let address=Labels.getAddrForFileAndLine('main.asm', 16-1);
				assert.equal(0x8000, address);

				address=Labels.getAddrForFileAndLine('filea.asm', 7-1);
				assert.equal(0x9001, address);

				address=Labels.getAddrForFileAndLine('filea_b.asm', 11-1);
				assert.equal(0x9005, address);

				address=Labels.getAddrForFileAndLine('filea.asm', 16-1);
				assert.equal(0x9008, address);
			});

		});

	});


	test('Occurence of WPMEM, ASSERTION, LOGPOINT', () => {
		// Read the list file
		const config={
			sjasmplus: [{
				path: './src/tests/data/labels/projects/sjasmplus/general/general.sld', srcDirs: [""],	// Sources mode
				excludeFiles: []
			}]
		};

		Labels.readListFiles(config);

		// Test WPMEM
		const wpLines=Labels.getWatchPointLines();
		assert.equal(wpLines.length, 1);
		assert.equal(wpLines[0].address, 0x10000 + 0x8200);
		assert.equal(wpLines[0].line, "WPMEM");

		// Test ASSERTION
		const assertionLines=Labels.getAssertionLines();
		assert.equal(assertionLines.length, 1);
		assert.equal(assertionLines[0].address, 0x10000 + 0x8005);
		assert.equal(assertionLines[0].line, "ASSERTION");

		// Test LOGPOINT
		const lpLines=Labels.getLogPointLines();
		assert.equal(lpLines.length, 1);
		assert.equal(lpLines[0].address, 0x10000 + 0x800F);
		assert.equal(lpLines[0].line, "LOGPOINT");
	});

});

