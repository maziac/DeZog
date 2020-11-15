
import * as assert from 'assert';
import {Labels} from '../labels/labels';
import {readFileSync} from 'fs';
//import { Settings } from '../settings';

suite('Labels (z80asm)', () => {

	setup(() => {
		Labels.init(250);
	});


	suite('Labels', () => {

		test('Labels', () => {
			// Read result data (labels)
			const labelsFile=readFileSync('./src/tests/data/labels/projects/z80asm/general/general.labels').toString().split('\n');

			// Read the list file
			const config={
				z80asm: [{
					path: './src/tests/data/labels/projects/z80asm/general/general.list',
					srcDirs: [""],	// Sources mode
					excludeFiles: []
				}]
			};
			Labels.readListFiles(config);

			// Compare all labels
			for (const labelLine of labelsFile) {
				if (labelLine=='')
					continue;
				// A line looks like: "fa_label3.mid:	equ $9002"
				const match=/(.*):\s+equ\s+\$(.*)/i.exec(labelLine)!;
				assert.notEqual(undefined, match);	// Check that line is parsed correctly
				const label=match[1];
				const value=parseInt(match[2],16);
				// Check
				const res=Labels.getNumberForLabel(label);
				assert.equal(value, res);
			}
		});

		test('IF 0 Labels', () => {
			// Read the list file
			const config={
				z80asm: [{
					path: './src/tests/data/labels/projects/z80asm/general/general.list',
					srcDirs: [""],	// Sources mode
					excludeFiles: []
				}]
			};
			Labels.readListFiles(config);

			// Test that a label under an IF 0/ENDIF is not defined => not easily possible with
			// z80asm, so simply allow it.
			const res=Labels.getNumberForLabel('label5');
			//assert.equal(undefined, res); // This would be correct, but is not easily possible with z80asm
			assert.equal(0x8012, res);
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

				res=Labels.getLocationOfLabel('global_label1')!;
				assert.notEqual(undefined, res);
				assert.equal(fname, res.file);
				assert.equal(87-1, res.lineNr);	// line number starts at 0
			});

			test('address -> file/line', () => {
				// Read the list file as result data (addresses)
				const listFile=readFileSync('./src/tests/data/labels/projects/z80asm/general/general.list').toString().split('\n');

				// Read the list file
				const config={z80asm: [{path: './src/tests/data/labels/projects/z80asm/general/general.list', srcDirs: []}]};	// ListFile-Mode
				Labels.readListFiles(config);

				// Compare all addresses
				const count=listFile.length;
				for (let lineNr=0; lineNr<count; lineNr++) {
					const line=listFile[lineNr];
					// A valid line looks like: "8001 3e 05		label2:	ld a,5 "
					const match=/^([0-9a-f]+)\s[0-9a-f]+/i.exec(line);
					if (!match)
						continue;
					// Valid address line
					const address=parseInt(match[1], 16);
					// Check
					const res=Labels.getFileAndLineForAddress(address);
					assert.ok(res.fileName.endsWith('general.list'));
					assert.equal(lineNr, res.lineNr);
				}
			});


			test('file/line -> address', () => {
				// Read the list file as result data (addresses)
				const filename='./src/tests/data/labels/projects/z80asm/general/general.list';
				const listFile=readFileSync(filename).toString().split('\n');

				// Read the list file
				const config={z80asm: [{path: filename, srcDirs: []}]};	// Sources-Mode
				Labels.readListFiles(config);

				// Compare all addresses
				const count=listFile.length;
				for (let lineNr=0; lineNr<count; lineNr++) {
					const line=listFile[lineNr];
					// A valid line looks like: "8001 3e 05		label2:	ld a,5 "
					const match=/^([0-9a-f]+)\s[0-9a-f]+/i.exec(line);
					if (!match)
						continue;
					// Valid address line
					const address=parseInt(match[1], 16);
					// Check
					let resultAddr=Labels.getAddrForFileAndLine(filename, lineNr);
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

				res=Labels.getLocationOfLabel('global_label1')!;
				assert.notEqual(undefined, res);
				assert.equal('filea_b.asm', res.file);
				assert.equal(10-1, res.lineNr);	// line number starts at 0
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
						path: './src/tests/data/labels/projects/z80asm/general/general.list',
						srcDirs: [""],	// Sources mode
						excludeFiles: []
					}]
				};

				Labels.readListFiles(config);

				// Tests
				let address=Labels.getAddrForFileAndLine('main.asm', 16-1);
				assert.equal(0x8000, address);

				address=Labels.getAddrForFileAndLine('filea.asm', 7-1);
				assert.equal(0x9001, address);

				address=Labels.getAddrForFileAndLine('filea_b.asm', 7-1);
				assert.equal(0x9004, address);

				address=Labels.getAddrForFileAndLine('filea.asm', 16-1);
				assert.equal(0x9008, address);
			});

		});

	});


	test('Occurence of WPMEM, ASSERTION, LOGPOINT', () => {
		// Read the list file
		const config={
			z80asm: [{
				path: './src/tests/data/labels/projects/z80asm/general/general.list',
				srcDirs: [""],	// Sources mode
				excludeFiles: []
			}]
		};

		Labels.readListFiles(config);

		// Test WPMEM
		const wpLines=Labels.getWatchPointLines();
		assert.equal(wpLines.length, 1);
		assert.equal(wpLines[0].address, 0x8200);
		assert.equal(wpLines[0].line, "WPMEM");

		// Test ASSERTION
		const assertionLines=Labels.getAssertionLines();
		assert.equal(assertionLines.length, 1);
		assert.equal(assertionLines[0].address, 0x8005);
		assert.equal(assertionLines[0].line, "ASSERTION");

		// Test LOGPOINT
		const lpLines=Labels.getLogPointLines();
		assert.equal(lpLines.length, 1);
		assert.equal(lpLines[0].address, 0x800F);
		assert.equal(lpLines[0].line, "LOGPOINT");
	});

});

