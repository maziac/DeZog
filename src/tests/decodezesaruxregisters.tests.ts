
import * as assert from 'assert';
import { DecodeZesaruxRegisters } from '../remotes/zesarux/decodezesaruxdata';



suite('DecodeZesaruxRegisters', () => {

	suite('Register parsing', () => {
		const line = "PC=80cf SP=83f3 AF=0208 BC=0301 HL=4002 DE=2006 IX=fffe IY=5c3a AF'=1243 BC'=23fe HL'=f3da DE'=abcd I=23 R=4b  F=----3--- F'=-Z---P-- MEMPTR=0000 IM0 IFF12 VPS: 0";
		let Decoder: any;

		setup(() => {
			Decoder=new DecodeZesaruxRegisters(8);
		});

		test('PC', () => {
			const compValue = 0x80cf;
			const value = Decoder.parsePC(line);
			assert.equal(compValue, value);
			assert.ok(Decoder.pcIndex >= 0);
			const value2 = Decoder.parsePC(line);
			assert.equal(compValue, value2);
		});

		test('SP', () => {
			const compValue = 0x83f3;
			const value = Decoder.parseSP(line);
			assert.equal(compValue, value);
			assert.ok(Decoder.spIndex >= 0);
			const value2 = Decoder.parseSP(line);
			assert.equal(compValue, value2);
		});

		test('AF', () => {
			const compValue = 0x0208;
			const value = Decoder.parseAF(line);
			assert.equal(compValue, value);
			assert.ok(Decoder.afIndex >= 0);
			const value2 = Decoder.parseAF(line);
			assert.equal(compValue, value2);
		});

		test('BC', () => {
			const compValue = 0x0301;
			const value = Decoder.parseBC(line);
			assert.equal(compValue, value);
			assert.ok(Decoder.bcIndex >= 0);
			const value2 = Decoder.parseBC(line);
			assert.equal(compValue, value2);
		});

		test('DE', () => {
			const compValue = 0x2006;
			const value = Decoder.parseDE(line);
			assert.equal(compValue, value);
			assert.ok(Decoder.deIndex >= 0);
			const value2 = Decoder.parseDE(line);
			assert.equal(compValue, value2);
		});

		test('HL', () => {
			const compValue = 0x4002;
			const value = Decoder.parseHL(line);
			assert.equal(compValue, value);
			assert.ok(Decoder.hlIndex >= 0);
			const value2 = Decoder.parseHL(line);
			assert.equal(compValue, value2);
		});

		test('IX', () => {
			const compValue = 0xfffe;
			const value = Decoder.parseIX(line);
			assert.equal(compValue, value);
			assert.ok(Decoder.ixIndex >= 0);
			const value2 = Decoder.parseIX(line);
			assert.equal(compValue, value2);
		});

		test('IY', () => {
			const compValue = 0x5c3a;
			const value = Decoder.parseIY(line);
			assert.equal(compValue, value);
			assert.ok(Decoder.iyIndex >= 0);
			const value2 = Decoder.parseIY(line);
			assert.equal(compValue, value2);
		});

		// E.g. PC=80cf SP=83f3 AF=0208 BC=0301 HL=4002 DE=2006 IX=ffff IY=5c3a AF'=1243 BC'=23fe HL'=f3da DE'=abcd I=23 R=4b  F=----3--- F'=-Z---P-- MEMPTR=0000 IM0 IFF12 VPS: 0
		test('AF2', () => {
			const compValue = 0x1243;
			const value = Decoder.parseAF2(line);
			assert.equal(compValue, value);
			assert.ok(Decoder.af2Index >= 0);
			const value2 = Decoder.parseAF2(line);
			assert.equal(compValue, value2);
		});

		test('BC2', () => {
			const compValue = 0x23fe;
			const value = Decoder.parseBC2(line);
			assert.equal(compValue, value);
			assert.ok(Decoder.bc2Index >= 0);
			const value2 = Decoder.parseBC2(line);
			assert.equal(compValue, value2);
		});

		test('DE2', () => {
			const compValue = 0xabcd;
			const value = Decoder.parseDE2(line);
			assert.equal(compValue, value);
			assert.ok(Decoder.de2Index >= 0);
			const value2 = Decoder.parseDE2(line);
			assert.equal(compValue, value2);
		});

		test('HL2', () => {
			const compValue = 0xf3da;
			const value = Decoder.parseHL2(line);
			assert.equal(compValue, value);
			assert.ok(Decoder.hl2Index >= 0);
			const value2 = Decoder.parseHL2(line);
			assert.equal(compValue, value2);
		});

		test('I', () => {
			const compValue = 0x23;
			const value = Decoder.parseI(line);
			assert.equal(compValue, value);
			assert.ok(Decoder.iIndex >= 0);
			const value2 = Decoder.parseI(line);
			assert.equal(compValue, value2);
		});

		test('R', () => {
			const compValue = 0x4b;
			const value = Decoder.parseR(line);
			assert.equal(compValue, value);
			assert.ok(Decoder.rIndex >= 0);
			const value2 = Decoder.parseR(line);
			assert.equal(compValue, value2);
		});

	});


	suite('MMU/Slots parsing', () => {
		let Decoder: any;

		setup(() => {
			Decoder=new DecodeZesaruxRegisters(8);
		});

		test('MMU at different positions', () => {
			const line1="PC=80cf SP=83f3 AF=0208 BC=0301 HL=4002 DE=2006 IX=fffe IY=5c3a AF'=1243 BC'=23fe HL'=f3da DE'=abcd I=23 R=4b  F=----3--- F'=-Z---P-- MEMPTR=0000 IM0 IFF12 VPS: 0 MMU=00001111222233334444555566667777";
			const line2="PC=80cf SP=83f3 AF=0208 BC=0301 HL=4002 DE=2006 IX=fffe IY=5c3a AF'=1243 BC'=23fe HL'=f3da DE'=abcd I=23 R=4b  F=----3--- F'=-Z---P-- MEMPTR=0000 IM0 IFF12 VPS: 0 whatever-other-position: MMU=088809990AAA0BBB0CCC0DDD0EEE0FFF";

			const slots1=Decoder.parseSlots(line1);
			assert.equal(8, slots1.length);
			assert.deepEqual([0x0000, 0x1111, 0x2222, 0x3333, 0x4444, 0x5555, 0x6666, 0x7777], slots1);

			// MMU at different position
			const slots2=Decoder.parseSlots(line2);
			assert.equal(8, slots2.length);
			assert.deepEqual([0x0888, 0x0999, 0x0AAA, 0x0BBB, 0x0CCC, 0x0DDD, 0x0EEE, 0x0FFF], slots2);
		});

		test('ROM', () => {
			const line="PC=80cf SP=83f3 AF=0208 BC=0301 HL=4002 DE=2006 IX=fffe IY=5c3a AF'=1243 BC'=23fe HL'=f3da DE'=abcd I=23 R=4b  F=----3--- F'=-Z---P-- MEMPTR=0000 IM0 IFF12 VPS: 0 MMU=80008001800280030000000100020003";

			const slots=Decoder.parseSlots(line);
			assert.equal(8, slots.length);
			assert.deepEqual([0x00FE, 0x00FF, 0x0100, 0x0101, 0x0000, 0x0001, 0x0002, 0x0003], slots);
		});
	});
});

