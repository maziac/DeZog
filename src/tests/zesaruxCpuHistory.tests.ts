
import * as assert from 'assert';
import { ZesaruxCpuHistory } from '../zesaruxCpuHistory';
import { Z80Registers } from '../z80Registers';

suite('ZesaruxCpuHistory', () => {

	setup(() => {
		Z80Registers.init();
	});

/*
	teardown( () => dc.disconnect() );
*/

	suite('disassemble', () => {

		test('getOpcodes', () => {
			const hist = new ZesaruxCpuHistory();

			let result = hist.getOpcodes("PC=0039 SP=ff44 AF=005c BC=ffff HL=10a8 DE=5cb9 IX=ffff IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=3f R=06 IM1 IFF-- (PC)=e52a785c");
			assert.equal("e52a785c", result);

			result = hist.getOpcodes("PC=0039 SP=ff44 AF=005c BC=ffff HL=10a8 DE=5cb9 IX=ffff IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=3f R=06 IM1 IFF-- (PC)=00123456");
			assert.equal("00123456", result);
		});

		test('getInstruction 1-4 bytes', () => {
			const hist = new ZesaruxCpuHistory();

			let result = hist.getOpcodes("PC=0039 ... (PC)=e5000000");
			assert.equal("e5000000", result);

			result = hist.getInstruction("PC=0039 ... (PC)=e5000000");
			assert.equal("PUSH HL", result);

			result = hist.getInstruction("PC=0000 ... (PC)=ed610000");
			assert.equal("OUT (C),H", result);

			result = hist.getInstruction("PC=FEDC ... (PC)=cbb10000");
			assert.equal("RES 6,C", result);

			result = hist.getInstruction("PC=0102 ... (PC)=dd390000");
			assert.equal("ADD IX,SP", result);

			result = hist.getInstruction("PC=0039 ... (PC)=dd561200");
			assert.equal("LD D,(IX+18)", result);

			result = hist.getInstruction("PC=0039 ... (PC)=ddcb2006");
			assert.equal("RLC (IX+32)", result);


			result = hist.getInstruction("PC=0039 ... (PC)=fd390000");
			assert.equal("ADD IY,SP", result);

			result = hist.getInstruction("PC=0039 ... (PC)=fdcb2006");
			assert.equal("RLC (IY+32)", result);
		});


		test('getInstruction RST', () => {
			const hist = new ZesaruxCpuHistory();

			let result = hist.getOpcodes("PC=0039 ... (PC)=e5000000");
			assert.equal("e5000000", result);

			result = hist.getInstruction("PC=0039 ... (PC)=cf000000");
			assert.equal("RST 08h", result);

			result = hist.getInstruction("PC=0039 ... (PC)=df000000");
			assert.equal("RST 18h", result);

			result = hist.getInstruction("PC=0039 ... (PC)=ef000000");
			assert.equal("RST 28h", result);

			result = hist.getInstruction("PC=0039 ... (PC)=ff000000");
			assert.equal("RST 38h", result);
		});


		test('getInstruction CALL cc', () => {
			const hist = new ZesaruxCpuHistory();

			let result = hist.getOpcodes("PC=0039 ... (PC)=e5000000");
			assert.equal("e5000000", result);

			result = hist.getInstruction("PC=0039 ... (PC)=CD214300");
			assert.equal("CALL 4321h", result);

			result = hist.getInstruction("PC=0039 ... (PC)=C4214300");
			assert.equal("CALL NZ,4321h", result);

			result = hist.getInstruction("PC=0039 ... (PC)=D4214300");
			assert.equal("CALL NC,4321h", result);

			result = hist.getInstruction("PC=0039 ... (PC)=E4214300");
			assert.equal("CALL PO,4321h", result);

			result = hist.getInstruction("PC=0039 ... (PC)=F4214300");
			assert.equal("CALL P,4321h", result);

			result = hist.getInstruction("PC=0039 ... (PC)=CC214300");
			assert.equal("CALL Z,4321h", result);

			result = hist.getInstruction("PC=0039 ... (PC)=DC214300");
			assert.equal("CALL C,4321h", result);

			result = hist.getInstruction("PC=0039 ... (PC)=EC214300");
			assert.equal("CALL PE,4321h", result);

			result = hist.getInstruction("PC=0039 ... (PC)=FC214300");
			assert.equal("CALL M,4321h", result);
		});


		test('getInstruction RET, RETI, RETN', () => {
			const hist = new ZesaruxCpuHistory();

			let result = hist.getOpcodes("PC=0039 ... (PC)=e5000000");
			assert.equal("e5000000", result);

			result = hist.getInstruction("PC=0039 ... (PC)=c9000000");
			assert.equal("RET", result);

			result = hist.getInstruction("PC=0039 ... (PC)=ed4d0000");
			assert.equal("RETI", result);

			result = hist.getInstruction("PC=0039 ... (PC)=ed450000");
			assert.equal("RETN", result);
		});


		test('getInstruction RET cc', () => {
			const hist = new ZesaruxCpuHistory();

			let result = hist.getOpcodes("PC=0039 ... (PC)=e5000000");
			assert.equal("e5000000", result);

			result = hist.getInstruction("PC=0039 ... (PC)=c0000000");
			assert.equal("RET NZ", result);

			result = hist.getInstruction("PC=0039 ... (PC)=d0000000");
			assert.equal("RET NC", result);

			result = hist.getInstruction("PC=0039 ... (PC)=e0000000");
			assert.equal("RET PO", result);

			result = hist.getInstruction("PC=0039 ... (PC)=f0000000");
			assert.equal("RET P", result);

			result = hist.getInstruction("PC=0039 ... (PC)=c8000000");
			assert.equal("RET Z", result);

			result = hist.getInstruction("PC=0039 ... (PC)=d8000000");
			assert.equal("RET C", result);

			result = hist.getInstruction("PC=0039 ... (PC)=e8000000");
			assert.equal("RET PE", result);

			result = hist.getInstruction("PC=0039 ... (PC)=f8000000");
			assert.equal("RET M", result);
		});

	});


	suite('isRetCallRst', () => {

		suite('isRetAndExecuted', () => {

			test('isRetAndExecuted unconditional', () => {
				let hist = new ZesaruxCpuHistory();
				let result = hist.isRetAndExecuted("(PC)=c9000000")
				assert.equal(true, result);

				hist = new ZesaruxCpuHistory();
				result = hist.isRetAndExecuted("(PC)=01000000")
				assert.equal(false, result);

				hist = new ZesaruxCpuHistory();
				result = hist.isRetAndExecuted("(PC)=ed4d0000")
				assert.equal(true, result);

				hist = new ZesaruxCpuHistory();
				result = hist.isRetAndExecuted("(PC)=ed450000")
				assert.equal(true, result);

				hist = new ZesaruxCpuHistory();
				result = hist.isRetAndExecuted("(PC)=0ed110000")
				assert.equal(false, result);
			});

			test('isRetAndExecuted NZ,Z', () => {
				let hist = new ZesaruxCpuHistory();
				let result = hist.isRetAndExecuted("AF=00BF (PC)=c0000000")
				assert.equal(true, result);

				hist = new ZesaruxCpuHistory();
				result = hist.isRetAndExecuted("AF=0040 (PC)=c8000000")
				assert.equal(false, result);

				hist = new ZesaruxCpuHistory();
				result = hist.isRetAndExecuted("AF=00BF (PC)=c8000000")
				assert.equal(false, result);

				hist = new ZesaruxCpuHistory();
				result = hist.isRetAndExecuted("AF=0040 (PC)=c0000000")
				assert.equal(true, result);
			});

			test('isRetAndExecuted NC,C', () => {
				let hist = new ZesaruxCpuHistory();
				let result = hist.isRetAndExecuted("AF=00FE (PC)=d0000000")
				assert.equal(true, result);

				hist = new ZesaruxCpuHistory();
				result = hist.isRetAndExecuted("AF=0001 (PC)=d8000000")
				assert.equal(false, result);

				hist = new ZesaruxCpuHistory();
				result = hist.isRetAndExecuted("AF=00FE (PC)=d8000000")
				assert.equal(false, result);

				hist = new ZesaruxCpuHistory();
				result = hist.isRetAndExecuted("AF=0001 (PC)=d0000000")
				assert.equal(true, result);
			});

			test('isRetAndExecuted PO,PE', () => {
				let hist = new ZesaruxCpuHistory();
				let result = hist.isRetAndExecuted("AF=00FB (PC)=e0000000")
				assert.equal(true, result);

				hist = new ZesaruxCpuHistory();
				result = hist.isRetAndExecuted("AF=0004 (PC)=e8000000")
				assert.equal(false, result);

				hist = new ZesaruxCpuHistory();
				result = hist.isRetAndExecuted("AF=00FB (PC)=e8000000")
				assert.equal(false, result);

				hist = new ZesaruxCpuHistory();
				result = hist.isRetAndExecuted("AF=0004 (PC)=e0000000")
				assert.equal(true, result);
			});

			test('isRetAndExecuted P,M', () => {
				let hist = new ZesaruxCpuHistory();
				let result = hist.isRetAndExecuted("AF=007F (PC)=f0000000")
				assert.equal(true, result);

				hist = new ZesaruxCpuHistory();
				result = hist.isRetAndExecuted("AF=0080 (PC)=f8000000")
				assert.equal(false, result);

				hist = new ZesaruxCpuHistory();
				result = hist.isRetAndExecuted("AF=007F (PC)=f8000000")
				assert.equal(false, result);

				hist = new ZesaruxCpuHistory();
				result = hist.isRetAndExecuted("AF=0080 (PC)=f0000000")
				assert.equal(true, result);
			});

		});

		suite('isCallAndExecuted', () => {

			test('isCallAndExecuted unconditional', () => {
				let hist = new ZesaruxCpuHistory();
				let result = hist.isCallAndExecuted("(PC)=cd000000")
				assert.equal(true, result);

				hist = new ZesaruxCpuHistory();
				result = hist.isCallAndExecuted("(PC)=01000000")
				assert.equal(false, result);
			});

			test('isCallAndExecuted NZ,Z', () => {
				let hist = new ZesaruxCpuHistory();
				let result = hist.isCallAndExecuted("AF=00BF (PC)=c4000000")
				assert.equal(true, result);

				hist = new ZesaruxCpuHistory();
				result = hist.isCallAndExecuted("AF=0040 (PC)=cc000000")
				assert.equal(false, result);

				hist = new ZesaruxCpuHistory();
				result = hist.isCallAndExecuted("AF=00BF (PC)=cc000000")
				assert.equal(false, result);

				hist = new ZesaruxCpuHistory();
				result = hist.isCallAndExecuted("AF=0040 (PC)=c4000000")
				assert.equal(true, result);
			});

			test('isCallAndExecuted NC,C', () => {
				let hist = new ZesaruxCpuHistory();
				let result = hist.isCallAndExecuted("AF=00FE (PC)=d4000000")
				assert.equal(true, result);

				hist = new ZesaruxCpuHistory();
				result = hist.isCallAndExecuted("AF=0001 (PC)=dc000000")
				assert.equal(false, result);

				hist = new ZesaruxCpuHistory();
				result = hist.isCallAndExecuted("AF=00FE (PC)=dc000000")
				assert.equal(false, result);

				hist = new ZesaruxCpuHistory();
				result = hist.isCallAndExecuted("AF=0001 (PC)=d4000000")
				assert.equal(true, result);
			});

			test('isCallAndExecuted PO,PE', () => {
				let hist = new ZesaruxCpuHistory();
				let result = hist.isCallAndExecuted("AF=00FB (PC)=e4000000")
				assert.equal(true, result);

				hist = new ZesaruxCpuHistory();
				result = hist.isCallAndExecuted("AF=0004 (PC)=ec000000")
				assert.equal(false, result);

				hist = new ZesaruxCpuHistory();
				result = hist.isCallAndExecuted("AF=00FB (PC)=ec000000")
				assert.equal(false, result);

				hist = new ZesaruxCpuHistory();
				result = hist.isCallAndExecuted("AF=0004 (PC)=e4000000")
				assert.equal(true, result);
			});

			test('isCallAndExecuted P,M', () => {
				let hist = new ZesaruxCpuHistory();
				let result = hist.isCallAndExecuted("AF=007F (PC)=f4000000")
				assert.equal(true, result);

				hist = new ZesaruxCpuHistory();
				result = hist.isCallAndExecuted("AF=0080 (PC)=fc000000")
				assert.equal(false, result);

				hist = new ZesaruxCpuHistory();
				result = hist.isCallAndExecuted("AF=007F (PC)=fc000000")
				assert.equal(false, result);

				hist = new ZesaruxCpuHistory();
				result = hist.isCallAndExecuted("AF=0080 (PC)=f4000000")
				assert.equal(true, result);
			});

		});


		test('isRst', () => {
			let hist = new ZesaruxCpuHistory();
			let result = hist.isCallAndExecuted("(PC)=c7000000")
			assert.equal(true, result);

			hist = new ZesaruxCpuHistory();
			result = hist.isCallAndExecuted("(PC)=cf000000")
			assert.equal(false, result);

			hist = new ZesaruxCpuHistory();
			result = hist.isCallAndExecuted("(PC)=d7000000")
			assert.equal(true, result);

			hist = new ZesaruxCpuHistory();
			result = hist.isCallAndExecuted("(PC)=df000000")
			assert.equal(false, result);

			hist = new ZesaruxCpuHistory();
			result = hist.isCallAndExecuted("(PC)=e7000000")
			assert.equal(true, result);

			hist = new ZesaruxCpuHistory();
			result = hist.isCallAndExecuted("(PC)=ef000000")
			assert.equal(false, result);

			hist = new ZesaruxCpuHistory();
			result = hist.isCallAndExecuted("(PC)=f7000000")
			assert.equal(true, result);

			hist = new ZesaruxCpuHistory();
			result = hist.isCallAndExecuted("(PC)=ff000000")
			assert.equal(false, result);
		});

	});
});

