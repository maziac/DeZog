
import * as assert from 'assert';
import { Z80Registers } from '../z80Registers';
import { ZesaruxRegisters } from '../remotes/zesarux/zesaruxregisters';



suite('ZesaruxRegisters', () => {

/*
	setup( () => {
	});
*/

/*
	teardown( () => dc.disconnect() );
*/

	suite('Register parsing', () => {
		const line = "PC=80cf SP=83f3 AF=0208 BC=0301 HL=4002 DE=2006 IX=fffe IY=5c3a AF'=1243 BC'=23fe HL'=f3da DE'=abcd I=23 R=4b  F=----3--- F'=-Z---P-- MEMPTR=0000 IM0 IFF12 VPS: 0";
		const ZesRegs = new ZesaruxRegisters() as any;

		setup(() => {
			Z80Registers.Init();
		});

		test('PC', () => {
			const compValue = 0x80cf;
			const value = ZesRegs.parsePC(line);
			assert.equal(compValue, value);
			assert.ok(ZesRegs.pcIndex >= 0);
			const value2 = ZesRegs.parsePC(line);
			assert.equal(compValue, value2);
		});

		test('SP', () => {
			const compValue = 0x83f3;
			const value = ZesRegs.parseSP(line);
			assert.equal(compValue, value);
			assert.ok(ZesRegs.spIndex >= 0);
			const value2 = ZesRegs.parseSP(line);
			assert.equal(compValue, value2);
		});

		test('AF', () => {
			const compValue = 0x0208;
			const value = ZesRegs.parseAF(line);
			assert.equal(compValue, value);
			assert.ok(ZesRegs.afIndex >= 0);
			const value2 = ZesRegs.parseAF(line);
			assert.equal(compValue, value2);
		});

		test('BC', () => {
			const compValue = 0x0301;
			const value = ZesRegs.parseBC(line);
			assert.equal(compValue, value);
			assert.ok(ZesRegs.bcIndex >= 0);
			const value2 = ZesRegs.parseBC(line);
			assert.equal(compValue, value2);
		});

		test('DE', () => {
			const compValue = 0x2006;
			const value = ZesRegs.parseDE(line);
			assert.equal(compValue, value);
			assert.ok(ZesRegs.deIndex >= 0);
			const value2 = ZesRegs.parseDE(line);
			assert.equal(compValue, value2);
		});

		test('HL', () => {
			const compValue = 0x4002;
			const value = ZesRegs.parseHL(line);
			assert.equal(compValue, value);
			assert.ok(ZesRegs.hlIndex >= 0);
			const value2 = ZesRegs.parseHL(line);
			assert.equal(compValue, value2);
		});

		test('IX', () => {
			const compValue = 0xfffe;
			const value = ZesRegs.parseIX(line);
			assert.equal(compValue, value);
			assert.ok(ZesRegs.ixIndex >= 0);
			const value2 = ZesRegs.parseIX(line);
			assert.equal(compValue, value2);
		});

		test('IY', () => {
			const compValue = 0x5c3a;
			const value = ZesRegs.parseIY(line);
			assert.equal(compValue, value);
			assert.ok(ZesRegs.iyIndex >= 0);
			const value2 = ZesRegs.parseIY(line);
			assert.equal(compValue, value2);
		});

		// E.g. PC=80cf SP=83f3 AF=0208 BC=0301 HL=4002 DE=2006 IX=ffff IY=5c3a AF'=1243 BC'=23fe HL'=f3da DE'=abcd I=23 R=4b  F=----3--- F'=-Z---P-- MEMPTR=0000 IM0 IFF12 VPS: 0
		test('AF2', () => {
			const compValue = 0x1243;
			const value = ZesRegs.parseAF2(line);
			assert.equal(compValue, value);
			assert.ok(ZesRegs.af2Index >= 0);
			const value2 = ZesRegs.parseAF2(line);
			assert.equal(compValue, value2);
		});

		test('BC2', () => {
			const compValue = 0x23fe;
			const value = ZesRegs.parseBC2(line);
			assert.equal(compValue, value);
			assert.ok(ZesRegs.bc2Index >= 0);
			const value2 = ZesRegs.parseBC2(line);
			assert.equal(compValue, value2);
		});

		test('DE2', () => {
			const compValue = 0xabcd;
			const value = ZesRegs.parseDE2(line);
			assert.equal(compValue, value);
			assert.ok(ZesRegs.de2Index >= 0);
			const value2 = ZesRegs.parseDE2(line);
			assert.equal(compValue, value2);
		});

		test('HL2', () => {
			const compValue = 0xf3da;
			const value = ZesRegs.parseHL2(line);
			assert.equal(compValue, value);
			assert.ok(ZesRegs.hl2Index >= 0);
			const value2 = ZesRegs.parseHL2(line);
			assert.equal(compValue, value2);
		});

		test('I', () => {
			const compValue = 0x23;
			const value = ZesRegs.parseI(line);
			assert.equal(compValue, value);
			assert.ok(ZesRegs.iIndex >= 0);
			const value2 = ZesRegs.parseI(line);
			assert.equal(compValue, value2);
		});

		test('R', () => {
			const compValue = 0x4b;
			const value = ZesRegs.parseR(line);
			assert.equal(compValue, value);
			assert.ok(ZesRegs.rIndex >= 0);
			const value2 = ZesRegs.parseR(line);
			assert.equal(compValue, value2);
		});

	});
});

