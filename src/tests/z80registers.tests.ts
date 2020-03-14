
import * as assert from 'assert';
import { Z80RegistersClass } from '../remotes/z80registers';

suite('Z80Registers', () => {

	suite('Conditions & Flags', () => {

		test('isCcMetByFlag NZ,Z', () => {
			const cc = 0b000;
			// "NZ"
			let result = Z80RegistersClass.isCcMetByFlag(cc, Z80RegistersClass.FLAG_Z);
			assert.equal(false, result);
			result = Z80RegistersClass.isCcMetByFlag(cc, 0);
			assert.equal(true, result);

			// "Z"
			result = Z80RegistersClass.isCcMetByFlag(cc|0b1, Z80RegistersClass.FLAG_Z);
			assert.equal(true, result);
			result = Z80RegistersClass.isCcMetByFlag(cc|0b1, 0);
			assert.equal(false, result);
		});


		test('isCcMetByFlag NC,C', () => {
			const cc = 0b010;
			// "NZ"
			let result = Z80RegistersClass.isCcMetByFlag(cc, Z80RegistersClass.FLAG_C);
			assert.equal(false, result);
			result = Z80RegistersClass.isCcMetByFlag(cc, 0);
			assert.equal(true, result);

			// "Z"
			result = Z80RegistersClass.isCcMetByFlag(cc|0b1, Z80RegistersClass.FLAG_C);
			assert.equal(true, result);
			result = Z80RegistersClass.isCcMetByFlag(cc|0b1, 0);
			assert.equal(false, result);
		});


		test('isCcMetByFlag PO,PE', () => {
			const cc = 0b100;
			// "NZ"
			let result = Z80RegistersClass.isCcMetByFlag(cc, Z80RegistersClass.FLAG_PV);
			assert.equal(false, result);
			result = Z80RegistersClass.isCcMetByFlag(cc, 0);
			assert.equal(true, result);

			// "Z"
			result = Z80RegistersClass.isCcMetByFlag(cc|0b1, Z80RegistersClass.FLAG_PV);
			assert.equal(true, result);
			result = Z80RegistersClass.isCcMetByFlag(cc|0b1, 0);
			assert.equal(false, result);
		});


		test('isCcMetByFlag P,M', () => {
			const cc = 0b110;
			// "NZ"
			let result = Z80RegistersClass.isCcMetByFlag(cc, Z80RegistersClass.FLAG_S);
			assert.equal(false, result);
			result = Z80RegistersClass.isCcMetByFlag(cc, 0);
			assert.equal(true, result);

			// "Z"
			result = Z80RegistersClass.isCcMetByFlag(cc|0b1, Z80RegistersClass.FLAG_S);
			assert.equal(true, result);
			result = Z80RegistersClass.isCcMetByFlag(cc|0b1, 0);
			assert.equal(false, result);
		});

	});
});

