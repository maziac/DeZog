
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
				const match=/@?(.*):\s+equ\s+(.*)/i.exec(labelLine)!;
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
				const fname='./src/tests/data/labels/projects/sjasmplus/general/general.list';
				const config={sjasmplusListFiles: [{path: fname, srcDirs: []}]};	// ListFile-Mode
				Labels.readListFiles(config);

				// Test
				let res=Labels.getLocationOfLabel('label1')!;
				assert.notEqual(undefined, res);
				assert.equal(fname, res.file);
				assert.equal(16-1, res.lineNr);	// line number starts at 0

				res=Labels.getLocationOfLabel('fa_label1')!;
				assert.notEqual(undefined, res);
				assert.equal(fname, res.file);
				assert.equal(62-1, res.lineNr);	// line number starts at 0

				res=Labels.getLocationOfLabel('modfilea.fa_label2')!;
				assert.notEqual(undefined, res);
				assert.equal(fname, res.file);
				assert.equal(66-1, res.lineNr);	// line number starts at 0

				res=Labels.getLocationOfLabel('modfilea.fa_label3.mid')!;
				assert.notEqual(undefined, res);
				assert.equal(fname, res.file);
				assert.equal(69-1, res.lineNr);	// line number starts at 0

				res=Labels.getLocationOfLabel('modfilea.fab_label1')!;
				assert.notEqual(undefined, res);
				assert.equal(fname, res.file);
				assert.equal(76-1, res.lineNr);	// line number starts at 0

				res=Labels.getLocationOfLabel('modfilea.modfileb.fab_label2')!;
				assert.notEqual(undefined, res);
				assert.equal(fname, res.file);
				assert.equal(81-1, res.lineNr);	// line number starts at 0

				res=Labels.getLocationOfLabel('global_label1')!;
				assert.notEqual(undefined, res);
				assert.equal(fname, res.file);
				assert.equal(85-1, res.lineNr);	// line number starts at 0

				res=Labels.getLocationOfLabel('global_label2')!;
				assert.notEqual(undefined, res);
				assert.equal(fname, res.file);
				assert.equal(87-1, res.lineNr);	// line number starts at 0

				res=Labels.getLocationOfLabel('modfilea.fab_label_equ1')!;
				assert.notEqual(undefined, res);
				assert.equal(fname, res.file);
				assert.equal(95-1, res.lineNr);	// line number starts at 0
			});

			test('address -> file/line', () => {
				// Read the list file as result data (addresses)
				const listFile=readFileSync('./src/tests/data/labels/projects/sjasmplus/general/general.list').toString().split('\n');

				// Read the list file
				const config={sjasmplusListFiles: [{path: './src/tests/data/labels/projects/sjasmplus/general/general.list', srcDirs: []}]};	// ListFile-Mode
				Labels.readListFiles(config);

				//const res=Labels.getFileAndLineForAddress(0x8000);
				// TODO: Sollte 16 sein, ist aber 16.

				// Compare all addresses
				const count=listFile.length;
				for (let lineNr=0; lineNr<count; lineNr++) {
					const line=listFile[lineNr];
					// A valid line looks like: " 18    8001 3E 05        label2:	ld a,5"
					const match=/^\s*[0-9+]+\s+([0-9a-f]+\s[0-9a-f]+)/i.exec(line);
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
				const filename='./src/tests/data/labels/projects/sjasmplus/general/general.list';
				const listFile=readFileSync(filename).toString().split('\n');

				// Read the list file
				const config={sjasmplusListFiles: [{path: filename, srcDirs: []}]};	// Sources-Mode
				Labels.readListFiles(config);

				// Compare all addresses
				const count=listFile.length;
				for (let lineNr=0; lineNr<count; lineNr++) {
					const line=listFile[lineNr];
					// A valid line looks like: " 18    8001 3E 05        label2:	ld a,5"
					const match=/^\s*[0-9+]+\s+([0-9a-f]+\s[0-9a-f]+)/i.exec(line);
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

				res=Labels.getLocationOfLabel('modfilea.fab_label1')!;
				assert.notEqual(undefined, res);
				assert.equal('filea_b.asm', res.file);
				assert.equal(3-1, res.lineNr);	// line number starts at 0

				res=Labels.getLocationOfLabel('modfilea.modfileb.fab_label2')!;
				assert.notEqual(undefined, res);
				assert.equal('filea_b.asm', res.file);
				assert.equal(8-1, res.lineNr);	// line number starts at 0

				res=Labels.getLocationOfLabel('global_label1')!;
				assert.notEqual(undefined, res);
				assert.equal('filea_b.asm', res.file);
				assert.equal(12-1, res.lineNr);	// line number starts at 0

				res=Labels.getLocationOfLabel('global_label2')!;
				assert.notEqual(undefined, res);
				assert.equal('filea_b.asm', res.file);
				assert.equal(14-1, res.lineNr);	// line number starts at 0

				res=Labels.getLocationOfLabel('modfilea.fab_label_equ1')!;
				assert.notEqual(undefined, res);
				assert.equal('filea_b.asm', res.file);
				assert.equal(22-1, res.lineNr);	// line number starts at 0
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
				assert.equal(4-1, res.lineNr);

				res=Labels.getFileAndLineForAddress(0x900B);
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

				address=Labels.getAddrForFileAndLine('filea_b.asm', 4-1);
				assert.equal(0x9005, address);

				address=Labels.getAddrForFileAndLine('filea.asm', 17-1);
				assert.equal(0x900B, address);
			});

		});

	});

});

