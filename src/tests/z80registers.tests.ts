
import * as assert from 'assert';
import { Z80Registers } from '../z80Registers';

suite('Z80Registers', () => {

/*
	setup( () => {
	});
*/

/*
	teardown( () => dc.disconnect() );
*/

	suite('Register parsing', () => {
		const line = "PC=80cf SP=83f3 AF=0208 BC=0301 HL=4002 DE=2006 IX=fffe IY=5c3a AF'=1243 BC'=23fe HL'=f3da DE'=abcd I=23 R=4b  F=----3--- F'=-Z---P-- MEMPTR=0000 IM0 IFF12 VPS: 0";
		const Regs = Z80Registers as any;

		test('PC', () => {
			const compValue = 0x80cf;
			const value = Z80Registers.parsePC(line);
			assert.equal(compValue, value);
			assert.ok(Regs.pcIndex >= 0);
			const value2 = Z80Registers.parsePC(line);
			assert.equal(compValue, value2);
		});

		test('SP', () => {
			const compValue = 0x83f3;
			const value = Z80Registers.parseSP(line);
			assert.equal(compValue, value);
			assert.ok(Regs.spIndex >= 0);
			const value2 = Z80Registers.parseSP(line);
			assert.equal(compValue, value2);
		});

		test('AF', () => {
			const compValue = 0x0208;
			const value = Z80Registers.parseAF(line);
			assert.equal(compValue, value);
			assert.ok(Regs.afIndex >= 0);
			const value2 = Z80Registers.parseAF(line);
			assert.equal(compValue, value2);
		});

		test('BC', () => {
			const compValue = 0x0301;
			const value = Z80Registers.parseBC(line);
			assert.equal(compValue, value);
			assert.ok(Regs.bcIndex >= 0);
			const value2 = Z80Registers.parseBC(line);
			assert.equal(compValue, value2);
		});

		test('DE', () => {
			const compValue = 0x2006;
			const value = Z80Registers.parseDE(line);
			assert.equal(compValue, value);
			assert.ok(Regs.deIndex >= 0);
			const value2 = Z80Registers.parseDE(line);
			assert.equal(compValue, value2);
		});

		test('HL', () => {
			const compValue = 0x4002;
			const value = Z80Registers.parseHL(line);
			assert.equal(compValue, value);
			assert.ok(Regs.hlIndex >= 0);
			const value2 = Z80Registers.parseHL(line);
			assert.equal(compValue, value2);
		});

		test('IX', () => {
			const compValue = 0xfffe;
			const value = Z80Registers.parseIX(line);
			assert.equal(compValue, value);
			assert.ok(Regs.ixIndex >= 0);
			const value2 = Z80Registers.parseIX(line);
			assert.equal(compValue, value2);
		});

		test('IY', () => {
			const compValue = 0x5c3a;
			const value = Z80Registers.parseIY(line);
			assert.equal(compValue, value);
			assert.ok(Regs.iyIndex >= 0);
			const value2 = Z80Registers.parseIY(line);
			assert.equal(compValue, value2);
		});

		// E.g. PC=80cf SP=83f3 AF=0208 BC=0301 HL=4002 DE=2006 IX=ffff IY=5c3a AF'=1243 BC'=23fe HL'=f3da DE'=abcd I=23 R=4b  F=----3--- F'=-Z---P-- MEMPTR=0000 IM0 IFF12 VPS: 0
		test('AF2', () => {
			const compValue = 0x1243;
			const value = Z80Registers.parseAF2(line);
			assert.equal(compValue, value);
			assert.ok(Regs.af2Index >= 0);
			const value2 = Z80Registers.parseAF2(line);
			assert.equal(compValue, value2);
		});

		test('BC2', () => {
			const compValue = 0x23fe;
			const value = Z80Registers.parseBC2(line);
			assert.equal(compValue, value);
			assert.ok(Regs.bc2Index >= 0);
			const value2 = Z80Registers.parseBC2(line);
			assert.equal(compValue, value2);
		});

		test('DE2', () => {
			const compValue = 0xabcd;
			const value = Z80Registers.parseDE2(line);
			assert.equal(compValue, value);
			assert.ok(Regs.de2Index >= 0);
			const value2 = Z80Registers.parseDE2(line);
			assert.equal(compValue, value2);
		});

		test('HL2', () => {
			const compValue = 0xf3da;
			const value = Z80Registers.parseHL2(line);
			assert.equal(compValue, value);
			assert.ok(Regs.hl2Index >= 0);
			const value2 = Z80Registers.parseHL2(line);
			assert.equal(compValue, value2);
		});

		test('I', () => {
			const compValue = 0x23;
			const value = Z80Registers.parseI(line);
			assert.equal(compValue, value);
			assert.ok(Regs.iIndex >= 0);
			const value2 = Z80Registers.parseI(line);
			assert.equal(compValue, value2);
		});

		test('R', () => {
			const compValue = 0x4b;
			const value = Z80Registers.parseR(line);
			assert.equal(compValue, value);
			assert.ok(Regs.rIndex >= 0);
			const value2 = Z80Registers.parseR(line);
			assert.equal(compValue, value2);
		});

	});


	suite('Conditions & Flags', () => {

		test('isCcMetByFlag NZ,Z', () => {
			const cc = 0b000;
			// "NZ"
			let result = Z80Registers.isCcMetByFlag(cc, Z80Registers.FLAG_Z);
			assert.equal(false, result);
			result = Z80Registers.isCcMetByFlag(cc, 0);
			assert.equal(true, result);

			// "Z"
			result = Z80Registers.isCcMetByFlag(cc|0b1, Z80Registers.FLAG_Z);
			assert.equal(true, result);
			result = Z80Registers.isCcMetByFlag(cc|0b1, 0);
			assert.equal(false, result);
		});


		test('isCcMetByFlag NC,C', () => {
			const cc = 0b010;
			// "NZ"
			let result = Z80Registers.isCcMetByFlag(cc, Z80Registers.FLAG_C);
			assert.equal(false, result);
			result = Z80Registers.isCcMetByFlag(cc, 0);
			assert.equal(true, result);

			// "Z"
			result = Z80Registers.isCcMetByFlag(cc|0b1, Z80Registers.FLAG_C);
			assert.equal(true, result);
			result = Z80Registers.isCcMetByFlag(cc|0b1, 0);
			assert.equal(false, result);
		});


		test('isCcMetByFlag PO,PE', () => {
			const cc = 0b100;
			// "NZ"
			let result = Z80Registers.isCcMetByFlag(cc, Z80Registers.FLAG_PV);
			assert.equal(false, result);
			result = Z80Registers.isCcMetByFlag(cc, 0);
			assert.equal(true, result);

			// "Z"
			result = Z80Registers.isCcMetByFlag(cc|0b1, Z80Registers.FLAG_PV);
			assert.equal(true, result);
			result = Z80Registers.isCcMetByFlag(cc|0b1, 0);
			assert.equal(false, result);
		});


		test('isCcMetByFlag P,M', () => {
			const cc = 0b110;
			// "NZ"
			let result = Z80Registers.isCcMetByFlag(cc, Z80Registers.FLAG_S);
			assert.equal(false, result);
			result = Z80Registers.isCcMetByFlag(cc, 0);
			assert.equal(true, result);

			// "Z"
			result = Z80Registers.isCcMetByFlag(cc|0b1, Z80Registers.FLAG_S);
			assert.equal(true, result);
			result = Z80Registers.isCcMetByFlag(cc|0b1, 0);
			assert.equal(false, result);
		});

	});
});

