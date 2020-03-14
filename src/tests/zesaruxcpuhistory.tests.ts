
import * as assert from 'assert';
import { ZesaruxCpuHistory, DecodeZesaruxHistoryInfo } from '../remotes/zesarux/zesaruxcpuhistory';
import { Z80RegistersClass, Z80Registers } from '../remotes/z80registers';
import {DecodeZesaruxRegisters} from '../remotes/zesarux/decodezesaruxdata';
import {Settings} from '../settings';
//import { ZesaruxRegisters } from '../remotes/zesarux/decodezesaruxdata';


suite('ZesaruxCpuHistory', () => {

	setup(() => {
		const cfg: any={
			remoteType: 'zrcp'
		};
		Settings.Init(cfg, '');
		Z80RegistersClass.createRegisters();
	});

	function createCpuHistory(): ZesaruxCpuHistory {
		const decoder=new DecodeZesaruxRegisters();
		Z80Registers.setDecoder(decoder);
		const hist=new ZesaruxCpuHistory();
		hist.setDecoder(new DecodeZesaruxHistoryInfo());
		return hist;
	}


	suite('disassemble', () => {

		test('getPushedValue', () => {
			const hist = createCpuHistory();

			// PUSH BC
			let value = hist.getPushedValue(0xc5, "BC=1234 DE=5678 HL=9ABC AF=DEF0 IX=75CA IY=54FD");
			assert.equal(0x1234, value);

			// PUSH DE
			value = hist.getPushedValue(0xd5, "BC=1234 DE=5678 HL=9ABC AF=DEF0 IX=75CA IY=54FD");
			assert.equal(0x5678, value);

			// PUSH HL
			value = hist.getPushedValue(0xe5, "BC=1234 DE=5678 HL=9ABC AF=DEF0 IX=75CA IY=54FD");
			assert.equal(0x9ABC, value);

			// PUSH AF
			value = hist.getPushedValue(0xf5, "BC=1234 DE=5678 HL=9ABC AF=DEF0 IX=75CA IY=54FD");
			assert.equal(0xDEF0, value);

			// PUSH IX
			value = hist.getPushedValue(0xe5dd, "BC=1234 DE=5678 HL=9ABC AF=DEF0 IX=75CA IY=54FD");
			assert.equal(0x75CA, value);

			// PUSH IY
			value = hist.getPushedValue(0xe5fd, "BC=1234 DE=5678 HL=9ABC AF=DEF0 IX=75CA IY=54FD");
			assert.equal(0x54FD, value);

			// PUSH nnnn
			value = hist.getPushedValue(0xb1c08aed, "BC=1234 DE=5678 HL=9ABC AF=DEF0 IX=75CA IY=54FD");
			assert.equal(0xC0B1, value);

			// no PUSH
			value = hist.getPushedValue(0x11, "BC=1234 DE=5678 HL=9ABC AF=DEF0 IX=75CA IY=54FD");
			assert.equal(undefined, value);
		});


		test('calcDirectSpChanges', () => {
			const hist = createCpuHistory();

			// LD SP,nnnn
			let expSp = hist.calcDirectSpChanges(0xcdab31, 100, "");
			assert.equal(0xcdab, expSp);

		    // INC SP
			expSp = hist.calcDirectSpChanges(0x33, 100, "");
			assert.equal(101, expSp);

			// DEC SP
			expSp = hist.calcDirectSpChanges(0x3b, 100, "");
			assert.equal(99, expSp);

			// LD SP,HL
			expSp = hist.calcDirectSpChanges(0xf9, 100, "HL=1F9B");
			assert.equal(0x1F9B, expSp);

			// LD SP,(nnnn)
			expSp = hist.calcDirectSpChanges(0x7bed, 100, "");
			assert.equal(undefined, expSp);

			// LD SP,IX
			expSp = hist.calcDirectSpChanges(0xf9dd, 100, "IX=1234 IY=ABCD");
			assert.equal(0x1234, expSp);

			// LD SP,IY
			expSp = hist.calcDirectSpChanges(0xf9fd, 100, "IX=1234 IY=ABCD");
			assert.equal(0xABCD, expSp);
		});


		test('getOpcodes', () => {
			const hist=createCpuHistory();

			let result = hist.decoder.getOpcodes("PC=0039 SP=ff44 AF=005c BC=ffff HL=10a8 DE=5cb9 IX=ffff IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=3f R=06 IM1 IFF-- (PC)=e52a785c");
			assert.equal(0x5c782ae5, result);

			result=hist.decoder.getOpcodes("PC=0039 SP=ff44 AF=005c BC=ffff HL=10a8 DE=5cb9 IX=ffff IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=3f R=06 IM1 IFF-- (PC)=00123456");
			assert.equal(0x56341200, result);
		});

		test('getInstruction 1-4 bytes', () => {
			const hist = createCpuHistory();

			const resultn=hist.decoder.getOpcodes("PC=0039 ... (PC)=e5000000");
			assert.equal(0xe5, resultn);

			let result = hist.getInstruction("PC=0039 ... (PC)=e5000000");
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
			const hist = createCpuHistory();

			const resultn=hist.decoder.getOpcodes("PC=0039 ... (PC)=e5000000");
			assert.equal(0xe5, resultn);

			let result = hist.getInstruction("PC=0039 ... (PC)=cf000000");
			assert.equal("RST 08h", result);

			result = hist.getInstruction("PC=0039 ... (PC)=df000000");
			assert.equal("RST 18h", result);

			result = hist.getInstruction("PC=0039 ... (PC)=ef000000");
			assert.equal("RST 28h", result);

			result = hist.getInstruction("PC=0039 ... (PC)=ff000000");
			assert.equal("RST 38h", result);
		});


		test('getInstruction CALL cc', () => {
			const hist = createCpuHistory();

			const resultn=hist.decoder.getOpcodes("PC=0039 ... (PC)=e5000000");
			assert.equal(0xe5, resultn);

			let result = hist.getInstruction("PC=0039 ... (PC)=CD214300");
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
			const hist = createCpuHistory();

			const resultn=hist.decoder.getOpcodes("PC=0039 ... (PC)=e5000000");
			assert.equal(0xe5, resultn);

			let result = hist.getInstruction("PC=0039 ... (PC)=c9000000");
			assert.equal("RET", result);

			result = hist.getInstruction("PC=0039 ... (PC)=ed4d0000");
			assert.equal("RETI", result);

			result = hist.getInstruction("PC=0039 ... (PC)=ed450000");
			assert.equal("RETN", result);
		});


		test('getInstruction RET cc', () => {
			const hist = createCpuHistory();

			const resultn=hist.decoder.getOpcodes("PC=0039 ... (PC)=e5000000");
			assert.equal(0xe5, resultn);

			let result = hist.getInstruction("PC=0039 ... (PC)=c0000000");
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


	suite('isCallOpcode', () => {

		test('is CALL', () => {
			const hist=createCpuHistory();
			// Test
			const opcode0=0xCD;	// Extended code like in PUSH nn
			assert.ok(hist.isCallOpcode(opcode0));
		});


		test('is CALL cc', () => {
			const hist=createCpuHistory();
			// Test
			assert.ok(hist.isCallOpcode(0xC4));
			assert.ok(hist.isCallOpcode(0xD4));
			assert.ok(hist.isCallOpcode(0xE4));
			assert.ok(hist.isCallOpcode(0xF4));

			assert.ok(hist.isCallOpcode(0xCC));
			assert.ok(hist.isCallOpcode(0xDC));
			assert.ok(hist.isCallOpcode(0xEC));
			assert.ok(hist.isCallOpcode(0xFC));
		});

		test('is not CALL', () => {
			const hist=createCpuHistory();
			// Test
			const opcode0=0xED;	// Extended code like in PUSH nn
			assert.ok(!hist.isCallOpcode(opcode0));
		});
	});


	suite('isRstOpcode', () => {

		test('is RST', () => {
			const hist=createCpuHistory();
			// Test
			assert.ok(hist.isRstOpcode(0xC7));
			assert.ok(hist.isRstOpcode(0xD7));
			assert.ok(hist.isRstOpcode(0xE7));
			assert.ok(hist.isRstOpcode(0xF7));

			assert.ok(hist.isRstOpcode(0xCF));
			assert.ok(hist.isRstOpcode(0xDF));
			assert.ok(hist.isRstOpcode(0xEF));
			assert.ok(hist.isRstOpcode(0xFF));
		});

		test('is not RST', () => {
			const hist=createCpuHistory();
			// Test
			const opcode0=0xED;	// Extended code like in PUSH nn
			assert.ok(!hist.isRstOpcode(opcode0));
		});
	});

	suite('isRetCallRst', () => {

		suite('isRetAndExecuted', () => {

			// Called by all test ret conditional tests.
			const testRetConditional = (opcode1: number, opcode2: number, flags: number) => {
				// opcode1, flag=0
				let hist = createCpuHistory();
				let opcodes=opcode1;
				let result = hist.isRetAndExecuted(opcodes, ~flags);
				assert.equal(true, result);

				// opcode1, flag=1
				hist = createCpuHistory();
				result = hist.isRetAndExecuted(opcodes, flags);
				assert.equal(false, result);

				// opcode2, flag=0
				hist = createCpuHistory();
				opcodes = opcode2;
				result = hist.isRetAndExecuted(opcodes, ~flags);
				assert.equal(false, result);

				// opcode2, flag=1
				hist = createCpuHistory();
				result = hist.isRetAndExecuted(opcodes, flags);
				assert.equal(true, result);
			};


			test('isRetAndExecuted unconditional', () => {
				let hist = createCpuHistory();
				let result=hist.isRetAndExecuted(0x000000c9, 0);
				assert.equal(true, result);

				hist = createCpuHistory();
				result=hist.isRetAndExecuted(0x00000001, 0);
				assert.equal(false, result);

				hist = createCpuHistory();
				result = hist.isRetAndExecuted(0x00004ded, 0);
				assert.equal(true, result);

				hist = createCpuHistory();
				result = hist.isRetAndExecuted(0x000045ed, 0);
				assert.equal(true, result);

				hist = createCpuHistory();
				result = hist.isRetAndExecuted(0x0010d19e, 0);
				assert.equal(false, result);
			});

			test('isRetAndExecuted NZ,Z', () => {
				const opcode1 = 0xC0;	// ret nz
				const opcode2 = 0xC8;	// ret z
				const flags = 0x40;		// set flag Z

				// Test
				testRetConditional(opcode1, opcode2, flags);
			});

			test('isRetAndExecuted NC,C', () => {
				const opcode1 = 0xD0;	// ret nc
				const opcode2 = 0xD8;	// ret c
				const flags = 0x01;		// set flag C

				// Test
				testRetConditional(opcode1, opcode2, flags);
			});

			test('isRetAndExecuted PO,PE', () => {
				const opcode1 = 0xE0;	// ret po
				const opcode2 = 0xE8;	// ret pe
				const flags = 0x04;		// set flag PE

				// Test
				testRetConditional(opcode1, opcode2, flags);

			});

			test('isRetAndExecuted P,M', () => {
				const opcode1 = 0xF0;	// ret p
				const opcode2 = 0xF8;	// ret m
				const flags = 0x80;		// set flag S

				// Test
				testRetConditional(opcode1, opcode2, flags);
			});

		});

		suite('isCallAndExecuted', () => {

			// Called by all test call conditional tests.
			const testCallConditional = (opcode1: number, opcode2: number, flags: number) => {
				// opcode1, flag=0
				let hist = createCpuHistory();
				let opcodes = opcode1;
				let result = hist.isCallAndExecuted(opcodes, ~flags);
				assert.equal(true, result);

				// opcode1, flag=1
				hist = createCpuHistory();
				result = hist.isCallAndExecuted(opcodes, flags);
				assert.equal(false, result);

				// opcode2, flag=0
				hist = createCpuHistory();
				opcodes = opcode2;
				result = hist.isCallAndExecuted(opcodes, ~flags);
				assert.equal(false, result);

				// opcode2, flag=1
				hist = createCpuHistory();
				opcodes = opcode2;
				result = hist.isCallAndExecuted(opcodes, flags);
				assert.equal(true, result);
			};

			test('isCallAndExecuted unconditional', () => {
				let hist = createCpuHistory();
				let result=hist.isCallAndExecuted(0x000000cd, 0);
				assert.equal(true, result);

				hist = createCpuHistory();
				result=hist.isCallAndExecuted(0x00000001, 0);
				assert.equal(false, result);
			});

			test('isCallAndExecuted NZ,Z', () => {
				const opcode1 = 0xC4;	// call nz
				const opcode2 = 0xCC;	// call z
				const flags = 0x40;		// set flag Z

				// Test
				testCallConditional(opcode1, opcode2, flags);
			});

			test('isCallAndExecuted NC,C', () => {
				const opcode1 = 0xD4;	// call nc
				const opcode2 = 0xDC;	// call c
				const flags = 0x01;		// set flag C

				// Test
				testCallConditional(opcode1, opcode2, flags);
			});

			test('isCallAndExecuted PO,PE', () => {
				const opcode1 = 0xE4;	// call po
				const opcode2 = 0xEC;	// call pe
				const flags = 0x04;		// set flag PE

				// Test
				testCallConditional(opcode1, opcode2, flags);
			});

			test('isCallAndExecuted P,M', () => {
				const opcode1 = 0xF4;	// call p
				const opcode2 = 0xFC;	// call m
				const flags = 0x80;		// set flag S

				// Test
				testCallConditional(opcode1, opcode2, flags);
			});

		});


		test('isRst', () => {
			let hist = createCpuHistory();
			let result = hist.isRst(0xc7)
			assert.equal(true, result);

			hist = createCpuHistory();
			result = hist.isRst(0xcf)
			assert.equal(true, result);

			hist = createCpuHistory();
			result = hist.isRst(0xd7)
			assert.equal(true, result);

			hist = createCpuHistory();
			result = hist.isRst(0xdf)
			assert.equal(true, result);

			hist = createCpuHistory();
			result = hist.isRst(0xe7)
			assert.equal(true, result);

			hist = createCpuHistory();
			result = hist.isRst(0xef)
			assert.equal(true, result);

			hist = createCpuHistory();
			result = hist.isRst(0xf7)
			assert.equal(true, result);

			hist = createCpuHistory();
			result = hist.isRst(0xff)
			assert.equal(true, result);

			// No rst
			hist = createCpuHistory();
			result = hist.isRst(0xc8)
			assert.equal(false, result);
		});
	});

});

