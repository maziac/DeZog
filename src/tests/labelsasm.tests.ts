
import * as assert from 'assert';
import {Labels} from '../labels/labels';
import {readFileSync} from 'fs';
//import { Settings } from '../settings';

suite('Labels (sjasmplus)', () => {

	suite('Labels', () => {

		setup(() => {
			Labels.init(250);
		});


		test('Labels', () => {
			// Read result data (labels)
			const labelsFile=readFileSync('./src/tests/data/labels/projects/sjasmplus/general/general.labels').toString().split('\n');

			// Read the list file
			const config={sjasmplusListFiles: [{path: './src/tests/data/labels/projects/sjasmplus/general/general.list', srcDirs: [""]}]};
			Labels.readListFiles(config);

			// Compare all labels
			for (const labelLine of labelsFile) {
				if (labelLine=='')
					continue;
				// A line looks like: "modfilea.fa_label3.mid.local: equ 0x00009003"
				const match=/(.*):\s+equ\s+(.*)/i.exec(labelLine)!;
				assert.notEqual(undefined, match);	// Check that line is parsed correctly
				const label=match[1];
				const value=match[2];
				// Check
				const res=Labels.getNumberForLabel(label);
				assert.equal(value, res);
			}
		});

		test('IF 0 Labels', () => {
			// Read the list file
			const config={sjasmplusListFiles: [{path: './src/tests/data/labels/projects/sjasmplus/general/general.list', srcDirs: [""]}]};
			Labels.readListFiles(config);

			// Test the a label under an IF 0/ENDIF is not defined
			const res=Labels.getNumberForLabel('label5');
			assert.equal(undefined, res);
		});


		suite('ListFile-Mode', () => {

			test('Labels location', () => {
				// Read the list file
				const config={sjasmplusListFiles: [{path: './src/tests/data/labels/projects/sjasmplus/general/general.list', srcDirs: []}]};	// ListFile-Mode
				Labels.readListFiles(config);

				// TODO: Funktioniert noch nicht weil labelLocations für ListFile-mode noch nicht implementiert sind.
				// Test
				const res=Labels.getLocationOfLabel('label1')!;
				assert.notEqual(undefined, res);
				assert.ok(res.file.endsWith('general.list'));
				assert.equal(15-1, res.lineNr);	// line number starts at 0

				// TODO: Implement same tests as in sources mode.
			});

			test('address -> file/line', () => {
				// Read the list file as result data (addresses)
				const listFile=readFileSync('./src/tests/data/labels/projects/sjasmplus/general/general.list').toString().split('\n');

				// Read the list file
				const config={sjasmplusListFiles: [{path: './src/tests/data/labels/projects/sjasmplus/general/general.list', srcDirs: []}]};	// ListFile-Mode
				Labels.readListFiles(config);

				//const res=Labels.getFileAndLineForAddress(0x8000);
				// TODO: Sollte 15 sein, ist aber 13.

				// Compare all addresses
				const count=listFile.length;
				let prevAddr;
				for (let lineNr=count-1; lineNr>=0; lineNr--) {
					const line=listFile[lineNr];
					// A valid line looks like: " 18    8001 3E 05        label2:	ld a,5"
					const match=/^\s*[0-9]+\s+([0-9a-f]+)/i.exec(line);
					if (!match)
						continue;
					// Valid address line
					const address=parseInt(match[1], 16);
					if (address==prevAddr)
						continue;	// Skip same addresses
					// Check
					const res=Labels.getFileAndLineForAddress(address);
					assert.ok(res.fileName.endsWith('general.list'));
					assert.equal(lineNr, res.lineNr);
					// Remember
					prevAddr=address;
				}
			});


			test('file/line -> address', () => {
				// Read the list file as result data (addresses)
				const filename='./src/tests/data/labels/projects/sjasmplus/general/general.list';
				const listFile=readFileSync(filename).toString().split('\n');

				// Read the list file
				const config={sjasmplusListFiles: [{path: filename, srcDirs: []}]};	// Sources-Mode
				Labels.readListFiles(config);

				// Compare all addresses
				const count=listFile.length;
				let prevAddr;
				for (let lineNr=count-1; lineNr>=0; lineNr--) {
					const line=listFile[lineNr];
					// A valid line looks like: " 18    8001 3E 05        label2:	ld a,5"
					const match=/^\s*[0-9]+\s+([0-9a-f]+)/i.exec(line);
					if (!match)
						continue;
					// Valid address line
					const address=parseInt(match[1], 16);
					if (address==prevAddr)
						continue;	// Skip same addresses
					// Check
					let resultAddr=Labels.getAddrForFileAndLine(filename, 16-1);
					assert.equal(address, resultAddr);
					// Remember
					prevAddr=address;
				}
			});

		});


		suite('Sources-Mode', () => {

			test('Labels location', () => {
				// TODO: Test does not work if 'Labels location - ListFile-Mode' is run before.
				// Read the list file
				const config={
					sjasmplusListFiles: [{
						path: './src/tests/data/labels/projects/sjasmplus/general/general.list',
						"mainFile": "main.asm",
						srcDirs: [""]	// Sources mode
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

				res=Labels.getLocationOfLabel('modfilea.fa_label2')!;
				assert.notEqual(undefined, res);
				assert.equal('filea.asm', res.file);
				assert.equal(6-1, res.lineNr);	// line number starts at 0

				res=Labels.getLocationOfLabel('modfilea.fa_label3.mid')!;
				assert.notEqual(undefined, res);
				assert.equal('filea.asm', res.file);
				assert.equal(9-1, res.lineNr);	// line number starts at 0

				// TODO: does not work
				res=Labels.getLocationOfLabel('modfilea.fa_label3.mid.local')!;
				/*
				assert.notEqual(undefined, res);
				assert.equal('filea.asm', res.file);
				assert.equal(10-1, res.lineNr);	// line number starts at 0
				*/

				res=Labels.getLocationOfLabel('modfilea.fab_label1')!;
				assert.notEqual(undefined, res);
				assert.equal('filea_b.asm', res.file);
				assert.equal(2-1, res.lineNr);	// line number starts at 0

				// TODO: does not work
				res=Labels.getLocationOfLabel('modfilea.fab_label1.local')!;
				/*
				assert.notEqual(undefined, res);
				assert.equal('filea_b.asm', res.file);
				assert.equal(3-1, res.lineNr);	// line number starts at 0
				*/

				res=Labels.getLocationOfLabel('modfilea.fab_label_equ1')!;
				assert.notEqual(undefined, res);
				assert.equal('filea_b.asm', res.file);
				assert.equal(5-1, res.lineNr);	// line number starts at 0
			});


			test('address -> file/line', () => {
				// Read the list file
				const config={sjasmplusListFiles: [{path: './src/tests/data/labels/projects/sjasmplus/general/general.list', mainFile: 'main.asm', srcDirs: [""]}]};	// Sources-Mode
				// TODO : remove here and at other places the "mainFile"
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
				assert.equal(3-1, res.lineNr);

				res=Labels.getFileAndLineForAddress(0x9006);
				assert.ok(res.fileName.endsWith('filea.asm'));
				assert.equal(17-1, res.lineNr);
			});


			test('file/line -> address', () => {
				// Read the list file
				const config={sjasmplusListFiles: [{path: './src/tests/data/labels/projects/sjasmplus/general/general.list', mainFile: 'main.asm', srcDirs: [""]}]};	// Sources-Mode
				// TODO : remove here and at other places the "mainFile"
				Labels.readListFiles(config);

				// Tests
				let address=Labels.getAddrForFileAndLine('main.asm', 16-1);
				assert.equal(0x8000, address);

				address=Labels.getAddrForFileAndLine('filea.asm', 7-1);
				assert.equal(0x9001, address);

				address=Labels.getAddrForFileAndLine('filea_b.asm', 3-1);
				assert.equal(0x9005, address);

				address=Labels.getAddrForFileAndLine('filea.asm', 17-1);
				assert.equal(0x9006, address);
			});

		});

	});

});

