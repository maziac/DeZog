
import * as assert from 'assert';
import { ZesaruxCpuHistory } from '../zesaruxCpuHistory';

suite('ZesaruxCpuHistory', () => {

/*
	setup( () => {
		return dc.start();
	});

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
			assert.equal("0039 PUSH HL", result);

			result = hist.getInstruction("PC=0000 ... (PC)=ed610000");
			assert.equal("0000 OUT (C),H", result);

			result = hist.getInstruction("PC=FEDC ... (PC)=cbb10000");
			assert.equal("FEDC RES 6,C", result);

			result = hist.getInstruction("PC=0102 ... (PC)=dd390000");
			assert.equal("0102 ADD IX,SP", result);

			result = hist.getInstruction("PC=0039 ... (PC)=dd561200");
			assert.equal("0039 LD D,(IX+18)", result);

			result = hist.getInstruction("PC=0039 ... (PC)=ddcb2006");
			assert.equal("0039 RLC (IX+32)", result);


			result = hist.getInstruction("PC=0039 ... (PC)=fd390000");
			assert.equal("0039 ADD IY,SP", result);

			result = hist.getInstruction("PC=0039 ... (PC)=fdcb2006");
			assert.equal("0039 RLC (IY+32)", result);
		});


		test('getInstruction RST', () => {
			const hist = new ZesaruxCpuHistory();

			let result = hist.getOpcodes("PC=0039 ... (PC)=e5000000");
			assert.equal("e5000000", result);

			result = hist.getInstruction("PC=0039 ... (PC)=cf000000");
			assert.equal("0039 RST 08h", result);

			result = hist.getInstruction("PC=0039 ... (PC)=df000000");
			assert.equal("0039 RST 18h", result);

			result = hist.getInstruction("PC=0039 ... (PC)=ef000000");
			assert.equal("0039 RST 28h", result);

			result = hist.getInstruction("PC=0039 ... (PC)=ff000000");
			assert.equal("0039 RST 38h", result);
		});


		test('getInstruction CALL cc', () => {
			const hist = new ZesaruxCpuHistory();

			let result = hist.getOpcodes("PC=0039 ... (PC)=e5000000");
			assert.equal("e5000000", result);

			result = hist.getInstruction("PC=0039 ... (PC)=CD214300");
			assert.equal("0039 CALL 4321h", result);

			result = hist.getInstruction("PC=0039 ... (PC)=C4214300");
			assert.equal("0039 CALL NZ,4321h", result);

			result = hist.getInstruction("PC=0039 ... (PC)=D4214300");
			assert.equal("0039 CALL NC,4321h", result);

			result = hist.getInstruction("PC=0039 ... (PC)=E4214300");
			assert.equal("0039 CALL PO,4321h", result);

			result = hist.getInstruction("PC=0039 ... (PC)=F4214300");
			assert.equal("0039 CALL P,4321h", result);

			result = hist.getInstruction("PC=0039 ... (PC)=CC214300");
			assert.equal("0039 CALL Z,4321h", result);

			result = hist.getInstruction("PC=0039 ... (PC)=DC214300");
			assert.equal("0039 CALL C,4321h", result);

			result = hist.getInstruction("PC=0039 ... (PC)=EC214300");
			assert.equal("0039 CALL PE,4321h", result);

			result = hist.getInstruction("PC=0039 ... (PC)=FC214300");
			assert.equal("0039 CALL M,4321h", result);
		});


		test('getInstruction RET, RETI, RETN', () => {
			const hist = new ZesaruxCpuHistory();

			let result = hist.getOpcodes("PC=0039 ... (PC)=e5000000");
			assert.equal("e5000000", result);

			result = hist.getInstruction("PC=0039 ... (PC)=c9000000");
			assert.equal("0039 RET", result);

			result = hist.getInstruction("PC=0039 ... (PC)=ed4d0000");
			assert.equal("0039 RETI", result);

			result = hist.getInstruction("PC=0039 ... (PC)=ed450000");
			assert.equal("0039 RETN", result);
		});


		test('getInstruction RET cc', () => {
			const hist = new ZesaruxCpuHistory();

			let result = hist.getOpcodes("PC=0039 ... (PC)=e5000000");
			assert.equal("e5000000", result);

			result = hist.getInstruction("PC=0039 ... (PC)=c0000000");
			assert.equal("0039 RET NZ", result);

			result = hist.getInstruction("PC=0039 ... (PC)=d0000000");
			assert.equal("0039 RET NC", result);

			result = hist.getInstruction("PC=0039 ... (PC)=e0000000");
			assert.equal("0039 RET PO", result);

			result = hist.getInstruction("PC=0039 ... (PC)=f0000000");
			assert.equal("0039 RET P", result);

			result = hist.getInstruction("PC=0039 ... (PC)=c8000000");
			assert.equal("0039 RET Z", result);

			result = hist.getInstruction("PC=0039 ... (PC)=d8000000");
			assert.equal("0039 RET C", result);

			result = hist.getInstruction("PC=0039 ... (PC)=e8000000");
			assert.equal("0039 RET PE", result);

			result = hist.getInstruction("PC=0039 ... (PC)=f8000000");
			assert.equal("0039 RET M", result);
		});

	});

});

