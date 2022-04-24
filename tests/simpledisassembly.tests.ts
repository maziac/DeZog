import * as assert from 'assert';
import {SimpleDisassembly} from '../src/disassembly/simpledisassembly';

suite('Disassembly', () => {

	suite('SimpleDisassembly', () => {

		suite('getDataDissassembly(false)', () => {

			test('empty', () => {
				const data = new Uint8Array();
				assert.equal(SimpleDisassembly.getDataDisassembly(1000, data), '\n');
			});

			test('1 byte', () => {
				const data = new Uint8Array([0xFA]);
				assert.equal(SimpleDisassembly.getDataDisassembly(0x1000, data), '1000 FA\n');
			});

			test('multiple lines', () => {
				const data = new Uint8Array([0xFA, 1, 2, 3, 4, 5, 6, 7, 8]);
				assert.equal(SimpleDisassembly.getDataDisassembly(0x1000, data, false, 4), '1000 FA 01 02 03\n1004 04 05 06 07\n1008 08\n');
			});

			test('address overflow lines', () => {
				const data = new Uint8Array([0xFA, 1, 2, 3, 4, 5, 6, 7]);
				assert.equal(SimpleDisassembly.getDataDisassembly(0xFFFF, data, false, 4), 'FFFF FA 01 02 03\n0003 04 05 06 07\n');
			});
		});

		suite('getDataDissassembly(true)', () => {

			test('empty', () => {
				const data = new Uint8Array();
				assert.equal(SimpleDisassembly.getDataDisassembly(1000, data, true), '\n');
			});

			test('1 byte', () => {
				const data = new Uint8Array([0x41]);
				assert.equal(SimpleDisassembly.getDataDisassembly(0x1000, data, true), "1000 41 ; 'A'\n");
			});

			test('multiple lines', () => {
				const data = new Uint8Array([0x41, 0x41, 0x42, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48]);
				assert.equal(SimpleDisassembly.getDataDisassembly(0x1000, data, true, 4), "1000 41 41 42 43 ; 'AABC'\n1004 44 45 46 47 ; 'DEFG'\n1008 48 ; 'H'\n");
			});

		});
	});

});

