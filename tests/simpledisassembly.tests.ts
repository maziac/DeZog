import * as assert from 'assert';
import {SimpleDisassembly} from '../src/disassembly/simpledisassembly';

suite('Disassembly (SimpleDisassembly)', () => {

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

		suite('getInstructionDisassembly', () => {

			test('empty', () => {
				const data = new Uint8Array();
				assert.equal(SimpleDisassembly.getInstructionDisassembly(1000, data), '');
			});

			test('1 line', () => {
				const data = new Uint8Array([0x3E, 5, 0, 0, 0]);
				let result = SimpleDisassembly.getInstructionDisassembly(0x1000, data);
				result = result.replace(/ +/g, ' ');	// Replace all multiple spaces with single spaces
				assert.equal(result, "1000 3E 05 LD A,05h\n");
			});

			test('2 lines', () => {
				const data = new Uint8Array([0x3E, 5, 0x21, 0x12, 0x34, 0, 0, 0]);
				let result = SimpleDisassembly.getInstructionDisassembly(0x1000, data);
				result = result.replace(/ +/g, ' ');	// Replace all multiple spaces with single spaces
				assert.equal(result, "1000 3E 05 LD A,05h\n1002 21 12 34 LD HL,3412h\n");
			});
		});

	});

});

