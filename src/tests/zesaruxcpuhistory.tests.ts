
import * as assert from 'assert';
import { ZesaruxCpuHistory, DecodeZesaruxHistoryInfo } from '../remotes/zesarux/zesaruxcpuhistory';
import { Z80RegistersClass, Z80Registers } from '../remotes/z80registers';
import {DecodeZesaruxRegisters} from '../remotes/zesarux/decodezesaruxdata';
import {Settings} from '../settings';
import {ZesaruxSocket, zSocket} from '../remotes/zesarux/zesaruxsocket';
import {RefList} from '../misc/refList';
import {CallStackFrame} from '../callstackframe';
import {RemoteFactory} from '../remotes/remotefactory';
import {CpuHistory} from '../remotes/cpuhistory';



// Mock for the socket.
class MockZesaruxSocket extends ZesaruxSocket {
	public dataArray: Array<string>=[];
	public send(command: string, handler: {(data)}=(data) => {}, suppressErrorHandling=false, /*, timeout = -1*/) {
		// Calls the handler directly
		const data=this.dataArray.shift();
		assert.notEqual(data, undefined);
		handler(data);
	}
}



suite('ZesaruxCpuHistory', () => {

	setup(() => {
		const cfg: any={
			remoteType: 'zrcp'
		};
		Settings.Init(cfg, '');
		Z80RegistersClass.createRegisters();
	});

	function createCpuHistory(): ZesaruxCpuHistory {
		const decoder=new DecodeZesaruxRegisters(8);
		Z80Registers.decoder=decoder;
		const hist=new ZesaruxCpuHistory();
		hist.decoder = new DecodeZesaruxHistoryInfo();
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

			let result=hist.decoder.getOpcodes("PC=0039 SP=ff44 AF=005c BC=ffff HL=10a8 DE=5cb9 IX=ffff IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=3f R=06 IM1 IFF-- (PC)=01020304");
			assert.equal(0x04030201, result);

			result=hist.decoder.getOpcodes("PC=0039 SP=ff44 AF=005c BC=ffff HL=10a8 DE=5cb9 IX=ffff IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=3f R=06 IM1 IFF-- (PC)=FFFEFDFC");
			assert.equal(0xFCFDFEFF, result);

			result=hist.decoder.getOpcodes("PC=0039 SP=ff44 AF=005c BC=ffff HL=10a8 DE=5cb9 IX=ffff IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=3f R=06 IM1 IFF-- (PC)=e52a785c");
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



	suite('handleReverseDebugStackBack', () => {
		let history: any;
		let mockSocket: MockZesaruxSocket;

		setup(() => {
			Z80RegistersClass.Init();
			Z80RegistersClass.createRegisters();
			RemoteFactory.createRemote('zrcp');
			Z80Registers.decoder=new DecodeZesaruxRegisters(0);
			//Remote.init();
			history=CpuHistory;
			history.decoder=new DecodeZesaruxHistoryInfo();
			mockSocket=new MockZesaruxSocket();
			(<any>zSocket)=mockSocket;
			(zSocket as any).queue=new Array<any>();
			// Push one frame on the stack
			history.reverseDbgStack=new RefList();
			history.reverseDbgStack.push(new CallStackFrame(0, 0, "__TEST_MAIN__"));
		});

		test('simple step back first history instruction', async () => {
			//  80D5 LD B,03h
			const currentLine="PC=80d5 SP=83fb AF=0208 BC=0000 HL=4000 DE=2000 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=0e IM0 IFF12 (PC)=06030e04 (SP)=80f5 MMU=00001111222233334444555566667777";
			// 80D7 LD C,04h (not from history)
			const prevLine="PC=80d7 SP=83fb AF=0208 BC=0300 HL=4000 DE=2000 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=0f  F=----3--- F'=-Z---P-- MEMPTR=0000 IM0 IFF12 VPS: 0 MMU=00001111222233334444555566667777";

			// Handle step back
			await history.handleReverseDebugStackBack(currentLine, prevLine);
			// Nothing has been pushed on the stack
			assert.equal(1, history.reverseDbgStack.length);
		});

		test('simple step back inside history', async () => {
			//  80D3 LD A,02h
			const currentLine="PC=80d3 SP=83fb AF=3f08 BC=0000 HL=4000 DE=2000 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=0d IM0 IFF12 (PC)=3e020603 (SP)=80f5 MMU=00001111222233334444555566667777";
			// 80D5 LD B,03h (from history)
			const prevLine="PC=80d5 SP=83fb AF=0208 BC=0000 HL=4000 DE=2000 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=0e IM0 IFF12 MMU=00001111222233334444555566667777"; //(PC)=06030e04 (SP)=80f5";

			// Handle step back
			await history.handleReverseDebugStackBack(currentLine, prevLine);
			// Nothing has been pushed on the stack
			assert.equal(1, history.reverseDbgStack.length);
			const frame=history.reverseDbgStack[0];
			assert.equal(0, frame.stack.length);
		});


		test('step back PUSH', async () => {
			// Push something on the stack
			let frame=history.reverseDbgStack[0];
			frame.stack.push(0x2F01);
			// 80ED PUSH 2F01h
			// 80E9 PUSH CA00h
			const currentLine="PC=80e9 SP=8401 AF=3f08 BC=0000 HL=4000 DE=2000 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=43 IM0 IFF12 (PC)=ed8a00ca (SP)=0065 MMU=00001111222233334444555566667777";
			const prevLine="PC=80ed SP=83ff AF=3f08 BC=0000 HL=4000 DE=2000 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=45 IM0 IFF12 MMU=00001111222233334444555566667777"; //(PC)=ed8a012f (SP)=00ca";

			// Handle step back
			await history.handleReverseDebugStackBack(currentLine, prevLine);
			// Value has been removed from the stack
			assert.equal(1, history.reverseDbgStack.length);
			frame=history.reverseDbgStack[0];
			assert.equal(0x80e9, frame.addr);
			assert.equal(0, frame.stack.length);  // Nothing on the function stack
		});

		test('step back POP', async () => {
			//   80F6 POP DE
			//   80F7 POP HL (not executed)
			const currentLine="PC=80f6 SP=83ff AF=0208 BC=0303 HL=4000 DE=0202 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=4a IM0 IFF12 (PC)=d1e100c9 (SP)=0202 MMU=00001111222233334444555566667777";
			const prevLine="PC=80f7 SP=8401 AF=0208 BC=0303 HL=4000 DE=0202 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=4b  F=----3--- F'=-Z---P-- MEMPTR=0000 IM0 IFF12 VPS: 0 MMU=00001111222233334444555566667777";

			// Handle step back
			await history.handleReverseDebugStackBack(currentLine, prevLine);
			// Value has been pushed to the stack
			assert.equal(1, history.reverseDbgStack.length);
			const frame=history.reverseDbgStack[0];
			assert.equal(0x80f6, frame.addr);
			assert.equal(1, frame.stack.length);  // 1 item on the function stack
			assert.equal(0x0202, frame.stack[0]);
		});

		test('step back CALL', async () => {
			// Add something to remove
			history.reverseDbgStack.unshift(new CallStackFrame(0, 0, "FUNC"));

			// 80D3 LD A,02h
			// 80F2 CALL 80D3h
			const currentLine="PC=80f2 SP=83fd AF=3f08 BC=0000 HL=4000 DE=2000 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=3b IM0 IFF12 (PC)=cdd380c1 (SP)=0303 MMU=00001111222233334444555566667777";
			const prevLine="PC=80d3 SP=83fb AF=3f08 BC=0000 HL=4000 DE=2000 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=3c IM0 IFF12 (PC)=3e020603 (SP)=80f5 MMU=00001111222233334444555566667777";

			// Handle step back
			await history.handleReverseDebugStackBack(currentLine, prevLine);
			// Value has been removed from the callstack
			assert.equal(1, history.reverseDbgStack.length);
		});

		test('step back RST', async () => {
			// Add something to remove
			history.reverseDbgStack.unshift(new CallStackFrame(0, 0, "FUNC"));

			// 80D3 LD A,02h
			// 80F2 RST 18h
			const currentLine="PC=80f2 SP=83fd AF=3f08 BC=0000 HL=4000 DE=2000 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=3b IM0 IFF12 (PC)=dfd380c1 (SP)=0303 MMU=00001111222233334444555566667777";
			const prevLine="PC=80d3 SP=83fb AF=3f08 BC=0000 HL=4000 DE=2000 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=3c IM0 IFF12 (PC)=3e020603 (SP)=80f5 MMU=00001111222233334444555566667777";

			// Handle step back
			await history.handleReverseDebugStackBack(currentLine, prevLine);
			// Value has been removed from the callstack
			assert.equal(1, history.reverseDbgStack.length);
		});

		test('step back RET', async () => {
			// 80F5 POP BC
			// 80E4 RET
			const currentLine="PC=80e4 SP=83fb AF=0208 BC=0304 HL=4000 DE=0202 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=48 IM0 IFF12 (PC)=c9ed8a01 (SP)=80f5 MMU=00001111222233334444555566667777";
			const prevLine="PC=80f5 SP=83fd AF=0208 BC=0304 HL=4000 DE=0202 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=49 IM0 IFF12 MMU=00001111222233334444555566667777"; //(PC)=c1d1e100 (SP)=0303";

			// Caller
			mockSocket.dataArray.push("CD3412");	// memory content at CALL nnnn

			// Handle step back
			await history.handleReverseDebugStackBack(currentLine, prevLine);
			// Value has been pushed to the callstack
			assert.equal(2, history.reverseDbgStack.length);
			const frame=history.reverseDbgStack.last();
			assert.equal(0x80e4, frame.addr);
			assert.equal("1234h", frame.name);
		});

		test('step back from isr', async () => {
			// Add something to remove
			history.reverseDbgStack.unshift(new CallStackFrame(0, 0, "ISR"));

			// 0038 DI
			// 80D3 LD A,02h
			const currentLine="PC=80d3 SP=83fb AF=0208 BC=0303 HL=0101 DE=0202 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=34 IM0 IFF12 (PC)=3e020603 (SP)=80f5 MMU=00001111222233334444555566667777";
			const prevLine="PC=0038 SP=83f9 AF=0208 BC=0303 HL=0101 DE=0202 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=36 IM0 IFF-- MMU=00001111222233334444555566667777"; //(PC)=f3dde5e5 (SP)=80d5";

			// Handle step back
			await history.handleReverseDebugStackBack(currentLine, prevLine);
			// Value has been removed from the callstack
			assert.equal(1, history.reverseDbgStack.length);
		});

		test('step back from isr to PUSH instruction', async () => {
			// Add something to remove
			history.reverseDbgStack[0].stack.push(1234);	// The PUSHed value
			history.reverseDbgStack.unshift(new CallStackFrame(0, 0, "FUNC"));

			// 0038 DI
			// 80E5 PUSH 0101h
			const currentLine="PC=80e5 SP=8403 AF=0208 BC=0303 HL=0101 DE=0202 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=5f IM0 IFF12 (PC)=ed8a0101 (SP)=8148 MMU=00001111222233334444555566667777";
			const prevLine="PC=0038 SP=83ff AF=0208 BC=0303 HL=0101 DE=0202 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=62 IM0 IFF-- MMU=00001111222233334444555566667777"; //(PC)=f3dde5e5 (SP)=80e9";

			// Handle step back
			await history.handleReverseDebugStackBack(currentLine, prevLine);
			// Value has been removed from the callstack
			assert.equal(1, history.reverseDbgStack.length);
		});

		test('step back from isr to POP instruction', async () => {
			// Add a 2nd call stack for the interrupt.
			history.reverseDbgStack.push(new CallStackFrame(0, 0, "INTERRUPT"));

			// 0038 DI
			// 80F6 POP BC
			const currentLine="PC=80f6 SP=83fb AF=02c9 BC=0304 HL=0101 DE=0202 IX=0cda IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=00 R=70 IM0 IFF12 (PC)=c1d1e100 (SP)=0303 MMU=00001111222233334444555566667777";
			const prevLine="PC=0038 SP=83fb AF=02c9 BC=0303 HL=0101 DE=0202 IX=0cda IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=00 R=72 IM0 IFF-- MMU=00001111222233334444555566667777"; // (PC)=f3dde5e5 (SP)=80f7";

			// Handle step back
			await history.handleReverseDebugStackBack(currentLine, prevLine);

			// The interrupt must be removed from the callstack,
			// but the POP must have been pushed to the frame stack.
			assert.equal(1, history.reverseDbgStack.length);
			let frame=history.reverseDbgStack[0];
			assert.equal("__TEST_MAIN__", frame.name);
			assert.equal(1, frame.stack.length);
			assert.equal(0x0303, frame.stack[0]);

		});

		test('step back from isr to RET instruction', async () => {
			// Add a 2nd call stack for the interrupt.
			history.reverseDbgStack.push(new CallStackFrame(0, 0, "INTERRUPT"));
			// Prepare memory of caller: CALL 80E5h
			mockSocket.dataArray.push("CDE580");

			// 0038 DI
			// 80E5 RET
			const currentLine="PC=80e5 SP=8400 AF=01c9 BC=0000 HL=4000 DE=2000 IX=ffff IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=00 R=24 IM0 IFF12 (PC)=c900ed8a (SP)=8147 MMU=00001111222233334444555566667777";
			const prevLine="PC=0038 SP=8400 AF=01c9 BC=0000 HL=4000 DE=2000 IX=ffff IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=00 R=26  F=SZ--3--C F'=-Z---P-- MEMPTR=0000 IM0 IFF-- VPS: 0 MMU=00001111222233334444555566667777";

			// Handle step back
			await history.handleReverseDebugStackBack(currentLine, prevLine);

			// The interrupt must be removed from the callstack,
			// but the RET must have been pushed to the call stack.
			assert.equal(2, history.reverseDbgStack.length);
			let frame=history.reverseDbgStack[0];
			assert.equal("__TEST_MAIN__", frame.name);
			frame=history.reverseDbgStack[1];
			assert.equal("80E5h", frame.name);
			assert.equal(0, frame.stack.length);
		});


		test('step back into isr', async () => {
			// 80E9 PUSH 0202h
			// 0049 RET
			const currentLine="PC=0049 SP=83ff AF=0208 BC=0303 HL=0101 DE=0202 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=7a IM0 IFF12 (PC)=c90608af (SP)=80e9 MMU=00001111222233334444555566667777";
			const prevLine="PC=80e9 SP=8401 AF=0208 BC=0303 HL=0101 DE=0202 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=7b IM0 IFF12 MMU=00001111222233334444555566667777"; //(PC)=ed8a0202 (SP)=0101";

			// There is no caller, but some memory must be returned
			mockSocket.dataArray.push("AA3412");

			// Handle step back
			await history.handleReverseDebugStackBack(currentLine, prevLine);
			// Value has been pushed to the callstack
			assert.equal(2, history.reverseDbgStack.length);
			const frame=history.reverseDbgStack.last();
			assert.equal(0x0049, frame.addr);
			assert.equal("__UNKNOWN__", frame.name);	// Most probably an interrupt, but we don't know
		});

		test('Unallowed RET', async () => {
			// RETs from main function (something unexpected might happen in the assembler code)

			// 80E9 ...
			// 8123 RET
			const currentLine="PC=0049 SP=83ff AF=0208 BC=0303 HL=0101 DE=0202 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=7a IM0 IFF12 (PC)=c90608af (SP)=80e9 MMU=00001111222233334444555566667777";
			const prevLine="PC=80e9 SP=8401 AF=0208 BC=0303 HL=0101 DE=0202 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=7b IM0 IFF12 MMU=00001111222233334444555566667777";

			// There is no caller, but some memory must be returned
			mockSocket.dataArray.push("AA3412");

			// Handle step back
			await history.handleReverseDebugStackBack(currentLine, prevLine);
			// Value has been pushed to the callstack
			assert.equal(2, history.reverseDbgStack.length);
			let frame=history.reverseDbgStack[1];
			assert.equal("__UNKNOWN__", frame.name);	// Could as well have been an interrupt
			frame=history.reverseDbgStack[0];
			assert.equal("__TEST_MAIN__", frame.name);
		});

		test('LD SP bigger', async () => {
			// Put 1 value on frame stack
			let frame=history.reverseDbgStack[0];
			frame.stack.push(0x0201);

			// 80F7 NOP						// SP=8402
			// 80F6 LD SP,HL // HL = SP+4,	   SP=83FE, removes 2 items from the stack
			const currentLine="PC=80f6 SP=83fe AF=01c0 BC=0000 HL=8402 DE=2000 IX=ff3c IY=5c3a AF'=0044 BC'=0000 HL'=2758 DE'=369b I=00 R=1f IM0 IFF12 (PC)=f900cdd3 (SP)=0303 MMU=00001111222233334444555566667777";
			const prevLine="PC=80f7 SP=8402 AF=01c0 BC=0000 HL=8402 DE=2000 IX=ff3c IY=5c3a AF'=0044 BC'=0000 HL'=2758 DE'=369b I=00 R=20 IM0 IFF12 MMU=00001111222233334444555566667777";	// (PC)=00cdd380 (SP)=0101;

			// Handle step back
			await history.handleReverseDebugStackBack(currentLine, prevLine);
			// 2 undefined values have been added.
			assert.equal(1, history.reverseDbgStack.length);
			frame=history.reverseDbgStack[0];
			assert.equal(3, frame.stack.length);
			assert.equal(0x0201, frame.stack[0]);
			assert.equal(undefined, frame.stack[1]);
			assert.equal(undefined, frame.stack[2]);
		});


		test('LD SP smaller', async () => {
			// Put 3 values on frame stack
			let frame=history.reverseDbgStack[0];
			frame.stack.push(0x0201);
			frame.stack.push(0x0302);
			frame.stack.push(0x0403);

			// 80F7 NOP						// SP=83FA
			// 80F6 LD SP,HL // HL = SP-4,	   SP=83FE, pushes 2 items to the stack
			const currentLine="PC=80f6 SP=83fe AF=01d1 BC=0000 HL=83fa DE=2000 IX=003c IY=5c3a AF'=2420 BC'=174b HL'=107f DE'=0006 I=00 R=6e IM0 IFF12 (PC)=f900cdd3 (SP)=0303 MMU=00001111222233334444555566667777";
			const prevLine="PC=80f7 SP=83fa AF=01d1 BC=0000 HL=83fa DE=2000 IX=003c IY=5c3a AF'=2420 BC'=174b HL'=107f DE'=0006 I=00 R=6f IM0 IFF12 MMU=00001111222233334444555566667777";	// (PC)=00cdd380 (SP)=0000"

			// Handle step back
			await history.handleReverseDebugStackBack(currentLine, prevLine);
			// 2 values have been pushed to the frame stack
			assert.equal(1, history.reverseDbgStack.length);
			frame=history.reverseDbgStack[0];
			assert.equal(1, frame.stack.length);
			assert.equal(0x0201, frame.stack[0]);
		});

	});



	suite('handleReverseDebugStackForward', () => {
		let history: any;
		let mockSocket: MockZesaruxSocket;

		setup(() => {
			Z80RegistersClass.Init();
			Z80RegistersClass.createRegisters();
			Z80Registers.decoder=new DecodeZesaruxRegisters(0);
			RemoteFactory.createRemote('zrcp');
			//Remote.init();
			history=CpuHistory;
			history.decoder=new DecodeZesaruxHistoryInfo();
			mockSocket=new MockZesaruxSocket();
			(<any>zSocket)=mockSocket;
			(zSocket as any).queue=new Array<any>();
			// Push one frame on the stack
			history.reverseDbgStack=new RefList();
			history.reverseDbgStack.push(new CallStackFrame(0, 0, "__TEST_MAIN__"));
		});

		test('simple step forward inside history', async () => {
			//  80D3 LD A,02h
			const currentLine="PC=80d3 SP=83fb AF=3f08 BC=0000 HL=4000 DE=2000 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=0d IM0 IFF12 (PC)=3e020603 (SP)=80f5 MMU=00001111222233334444555566667777";
			// 80D5 LD B,03h (from history)
			const nextLine="PC=80d5 SP=83fb AF=0208 BC=0000 HL=4000 DE=2000 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=0e IM0 IFF12 MMU=00001111222233334444555566667777"; //(PC)=06030e04 (SP)=80f5";

			// Handle step forward
			await history.handleReverseDebugStackForward(currentLine, nextLine);
			// Nothing has been pushed on the stack
			assert.equal(1, history.reverseDbgStack.length);
			const frame=history.reverseDbgStack[0];
			assert.equal(0, frame.stack.length);
		});


		test('step forward POP', async () => {
			// Prepare stack
			let frame=history.reverseDbgStack[0];
			frame.stack.push(0x2F01);	// push something on the stack

			// 80FC POP DE
			// 80FD POP HL
			const currentLine="PC=80fc SP=83fc AF=02d1 BC=0000 HL=83fa DE=0202 IX=03d4 IY=5c3a AF'=0044 BC'=0002 HL'=0303 DE'=00d0 I=00 R=65 IM0 IFF12 (PC)=d1e100c9 (SP)=0000 MMU=00001111222233334444555566667777";
			const nextLine="PC=80fd SP=83fe AF=02d1 BC=0000 HL=83fa DE=0000 IX=03d4 IY=5c3a AF'=0044 BC'=0002 HL'=0303 DE'=00d0 I=00 R=66 IM0 IFF12 (PC)=e100c900 (SP)=0303 MMU=00001111222233334444555566667777";

			// Handle step forward
			await history.handleReverseDebugStackForward(currentLine, nextLine);
			// Value has been removed from the stack
			assert.equal(1, history.reverseDbgStack.length);
			frame=history.reverseDbgStack[0];
			assert.equal(0x80fd, frame.addr);
			assert.equal(0, frame.stack.length);  // Nothing on the function stack
		});

		test('step forward PUSH', async () => {
			// 80EA PUSH 0402h
			// 80EE PUSH 0303h
			const currentLine="PC=80ea SP=8402 AF=01c9 BC=0000 HL=4000 DE=2000 IX=03d4 IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=00 R=4e IM0 IFF12 (PC)=ed8a0402 (SP)=0101 MMU=00001111222233334444555566667777";
			const nextLine="PC=80ee SP=8400 AF=01c9 BC=0000 HL=4000 DE=2000 IX=03d4 IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=00 R=50 IM0 IFF12 (PC)=ed8a0303 (SP)=0202 MMU=00001111222233334444555566667777";

			// Handle step forward
			await history.handleReverseDebugStackForward(currentLine, nextLine);
			// Value has been pushed to the stack
			assert.equal(1, history.reverseDbgStack.length);
			const frame=history.reverseDbgStack[0];
			assert.equal(0x80EE, frame.addr);
			assert.equal(1, frame.stack.length);  // 1 item on the function stack
			assert.equal(0x0402, frame.stack[0]);
		});

		test('step forward RET', async () => {
			// Add something to remove
			history.reverseDbgStack.push(new CallStackFrame(0, 0, "FUNC"));

			// 80FA RET
			// 8146 JR 8143h
			const currentLine="PC=80fa SP=83ff AF=02c9 BC=0303 HL=0101 DE=0202 IX=03d4 IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=00 R=62 IM0 IFF12 (PC)=c900e123 (SP)=8146 MMU=00001111222233334444555566667777";
			const nextLine="PC=8146 SP=8401 AF=02c9 BC=0303 HL=0101 DE=0202 IX=03d4 IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=00 R=63 IM0 IFF12 (PC)=18fb2150 (SP)=0000 MMU=00001111222233334444555566667777";

			// Handle step forward
			await history.handleReverseDebugStackForward(currentLine, nextLine);
			// Value has been removed from the callstack
			assert.equal(1, history.reverseDbgStack.length);
		});

		test('step forward CALL', async () => {
			// 8143 CALL 80F0h
			// 80E5 NOP
			const currentLine="PC=8143 SP=8401 AF=01c9 BC=0000 HL=4000 DE=2000 IX=03d4 IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=00 R=59 IM0 IFF12 (PC)=cdf08018 (SP)=0000 MMU=00001111222233334444555566667777";
			const nextLine="PC=80e5 SP=83ff AF=01c9 BC=0000 HL=4000 DE=2000 IX=03d4 IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=00 R=5a IM0 IFF12 (PC)=00ed8a01 (SP)=8146 MMU=00001111222233334444555566667777";

			// Handle step forward
			await history.handleReverseDebugStackForward(currentLine, nextLine);
			// Value has been pushed to the callstack
			assert.equal(2, history.reverseDbgStack.length);
			const frame=history.reverseDbgStack[1];
			assert.equal(0x80E5, frame.addr);
			assert.equal("80F0h", frame.name);
		});

		test('step forward RST', async () => {
			// 8143 RST 18h
			// 80E5 NOP
			const currentLine="PC=8143 SP=8401 AF=01c9 BC=0000 HL=4000 DE=2000 IX=03d4 IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=00 R=59 IM0 IFF12 (PC)=dfe58018 (SP)=0000 MMU=00001111222233334444555566667777";
			const nextLine="PC=80e5 SP=83ff AF=01c9 BC=0000 HL=4000 DE=2000 IX=03d4 IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=00 R=5a IM0 IFF12 (PC)=00ed8a01 (SP)=8146 MMU=00001111222233334444555566667777";

			// Handle step forward
			await history.handleReverseDebugStackForward(currentLine, nextLine);
			// Value has been pushed to the callstack
			assert.equal(2, history.reverseDbgStack.length);
			const frame=history.reverseDbgStack[1];
			assert.equal(0x80E5, frame.addr);
			assert.equal("0018h", frame.name);
		});

		test('step forward from isr ret', async () => {
			// Add something to remove
			history.reverseDbgStack.push(new CallStackFrame(0, 0, "ISR"));

			// 0049 RET (from ISR)
			// 80D3 80D9 PUSH BC
			const currentLine="PC=0049 SP=83f5 AF=02c9 BC=0303 HL=0101 DE=0202 IX=03d4 IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=00 R=35 IM0 IFF12 (PC)=c90608af (SP)=80d7 MMU=00001111222233334444555566667777";
			const nextLine="PC=80d7 SP=83f7 AF=02c9 BC=0303 HL=0101 DE=0202 IX=03d4 IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=00 R=36 IM0 IFF12 (PC)=0e04c5f5 (SP)=80f6 MMU=00001111222233334444555566667777";

			// Handle step forward
			await history.handleReverseDebugStackForward(currentLine, nextLine);
			// Value has been removed from the callstack
			assert.equal(1, history.reverseDbgStack.length);
		});

		test('step forward from PUSH to isr', async () => {
			// 80E9 PUSH 0302h
			// 0038 DI
			const currentLine="PC=80e9 SP=83f7 AF=01c9 BC=0403 HL=0201 DE=0302 IX=03d4 IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=00 R=3e IM0 IFF12 (PC)=ed8a0302 (SP)=0201 MMU=00001111222233334444555566667777";
			const nextLine="PC=0038 SP=83f3 AF=01c9 BC=0403 HL=0201 DE=0302 IX=03d4 IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=00 R=41 IM0 IFF-- (PC)=f3dde5e5 (SP)=80ed MMU=00001111222233334444555566667777";

			// Handle step forward
			await history.handleReverseDebugStackForward(currentLine, nextLine);
			// Value and isr have been pushed to the stack
			assert.equal(2, history.reverseDbgStack.length);
			let frame=history.reverseDbgStack[1];
			assert.equal("__INTERRUPT__", frame.name);
			assert.equal(0, frame.stack.length);
			frame=history.reverseDbgStack[0];
			assert.equal("__TEST_MAIN__", frame.name);
			assert.equal(1, frame.stack.length);
			assert.equal(0x0302, frame.stack[0]);
		});

		test('step forward from CALL to isr', async () => {
			// 813E CALL 80E5h
			// 0038 DI
			const currentLine="PC=813e SP=83fc AF=01c9 BC=0000 HL=4000 DE=2000 IX=03d4 IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=00 R=55 IM0 IFF12 (PC)=cde58018 (SP)=0000 MMU=00001111222233334444555566667777";
			const nextLine="PC=0038 SP=83f8 AF=01c9 BC=0000 HL=4000 DE=2000 IX=03d4 IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=00 R=57 IM0 IFF-- (PC)=f3dde5e5 (SP)=80e5 MMU=00001111222233334444555566667777";

			// Handle step forward
			await history.handleReverseDebugStackForward(currentLine, nextLine);
			// Value and isr have been pushed to the stack
			assert.equal(3, history.reverseDbgStack.length);
			let frame=history.reverseDbgStack[2];
			assert.equal("__INTERRUPT__", frame.name);
			assert.equal(0, frame.stack.length);
			frame=history.reverseDbgStack[1];
			assert.equal("80E5h", frame.name);
			assert.equal(0, frame.stack.length);
			frame=history.reverseDbgStack[0];
			assert.equal("__TEST_MAIN__", frame.name);
			assert.equal(0, frame.stack.length);
		});

		test('step forward from RST to isr', async () => {
			// 813E RST 18h
			// 0038 DI
			const currentLine="PC=813e SP=83fc AF=01c9 BC=0000 HL=4000 DE=2000 IX=03d4 IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=00 R=55 IM0 IFF12 (PC)=dfe58018 (SP)=0000 MMU=00001111222233334444555566667777";
			const nextLine="PC=0038 SP=83f8 AF=01c9 BC=0000 HL=4000 DE=2000 IX=03d4 IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=00 R=57 IM0 IFF-- (PC)=f3dde5e5 (SP)=80e5 MMU=00001111222233334444555566667777";

			// Handle step forward
			await history.handleReverseDebugStackForward(currentLine, nextLine);
			// Value and isr have been pushed to the stack
			assert.equal(3, history.reverseDbgStack.length);
			let frame=history.reverseDbgStack[2];
			assert.equal("__INTERRUPT__", frame.name);
			assert.equal(0, frame.stack.length);
			frame=history.reverseDbgStack[1];
			assert.equal("0018h", frame.name);
			assert.equal(0, frame.stack.length);
			frame=history.reverseDbgStack[0];
			assert.equal("__TEST_MAIN__", frame.name);
			assert.equal(0, frame.stack.length);
		});

		test('step back from POP to isr', async () => {
			// Push something on the stack
			let frame=history.reverseDbgStack[0];
			frame.stack.push(0x2F01);

			//	80F1 POP BC
			//  0038 DI
			const currentLine="PC=80f1 SP=83f3 AF=01c9 BC=0403 HL=0201 DE=0302 IX=03d4 IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=00 R=05 IM0 IFF12 (PC)=c1d1e1c9 (SP)=0403 MMU=00001111222233334444555566667777";
			const nextLine="PC=0038 SP=83f3 AF=01c9 BC=0403 HL=0201 DE=0302 IX=03d4 IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=00 R=07 IM0 IFF-- (PC)=f3dde5e5 (SP)=80f2 MMU=00001111222233334444555566667777";

			// Handle step forward
			await history.handleReverseDebugStackForward(currentLine, nextLine);

			// The interrupt must have been pushed to the call stack.
			assert.equal(2, history.reverseDbgStack.length);
			frame=history.reverseDbgStack[1];
			assert.equal("__INTERRUPT__", frame.name);
			assert.equal(0, frame.stack.length);
			// The POP must have been pushed to the frame stack.
			frame=history.reverseDbgStack[0];
			assert.equal("__TEST_MAIN__", frame.name);
			assert.equal(0, frame.stack.length);
		});

		test('step forward from RET to isr', async () => {
			// Add a 2nd call stack for the interrupt.
			history.reverseDbgStack.push(new CallStackFrame(0, 0, "FUNC"));
			// Prepare memory of caller: CALL 80E5h
			mockSocket.dataArray.push("CDE580");

			//  80E5 RET
			//  0038 DI
			const currentLine="PC=80e5 SP=8400 AF=01c9 BC=0000 HL=4000 DE=2000 IX=03d4 IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=00 R=29 IM0 IFF12 (PC)=c900ed8a (SP)=8147 MMU=00001111222233334444555566667777";
			const nextLine="PC=0038 SP=8400 AF=01c9 BC=0000 HL=4000 DE=2000 IX=03d4 IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=00 R=2b IM0 IFF-- (PC)=f3dde5e5 (SP)=8147 MMU=00001111222233334444555566667777";

			// Handle step forward
			await history.handleReverseDebugStackForward(currentLine, nextLine);

			// The RET must have been removed from the callstack,
			// but the ISR must have been pushed to the call stack.
			assert.equal(2, history.reverseDbgStack.length);
			let frame=history.reverseDbgStack[0];
			assert.equal("__TEST_MAIN__", frame.name);
			frame=history.reverseDbgStack[1];
			assert.equal("__INTERRUPT__", frame.name);
			assert.equal(0, frame.stack.length);
		});


		test('step forward into isr', async () => {
			// 80EE NOP
			// 0038 DI
			const currentLine="PC=80ee SP=8404 AF=01c9 BC=0403 HL=0201 DE=0302 IX=03d4 IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=00 R=63 IM0 IFF12 (PC)=0000ed8a (SP)=814b MMU=00001111222233334444555566667777";
			const nextLine="PC=0038 SP=8402 AF=01c9 BC=0403 HL=0201 DE=0302 IX=03d4 IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=00 R=65 IM0 IFF-- (PC)=f3dde5e5 (SP)=80ef MMU=00001111222233334444555566667777";

			// Handle step forward
			await history.handleReverseDebugStackForward(currentLine, nextLine);
			// ISR has been pushed to the callstack
			assert.equal(2, history.reverseDbgStack.length);
			const frame=history.reverseDbgStack[1];
			assert.equal(0x0038, frame.addr);
			assert.equal("__INTERRUPT__", frame.name);
			assert.equal(0, frame.stack.length);
		});

		test('LD SP smaller', async () => {
			// Put 1 value on frame stack
			let frame=history.reverseDbgStack[0];
			frame.stack.push(0x0201);

			// 80F5 LD SP,HL // HL = SP-4,	   SP=83F8, adds 2 items to the stack
			// 80F6 POP BC					// SP=83F4
			const currentLine="PC=80f5 SP=83f8 AF=01d1 BC=0000 HL=83f4 DE=2000 IX=0300 IY=5c3a AF'=3320 BC'=174b HL'=107f DE'=0006 I=00 R=7f IM0 IFF12 (PC)=f9c1d1e1 (SP)=0403 MMU=00001111222233334444555566667777";
			const nextLine="PC=80f6 SP=83f4 AF=01d1 BC=0000 HL=83f4 DE=2000 IX=0300 IY=5c3a AF'=3320 BC'=174b HL'=107f DE'=0006 I=00 R=00 IM0 IFF12 (PC)=c1d1e1c9 (SP)=0000 MMU=00001111222233334444555566667777";

			// Handle step forward
			await history.handleReverseDebugStackForward(currentLine, nextLine);
			// 2 undefined values have been added.
			assert.equal(1, history.reverseDbgStack.length);
			frame=history.reverseDbgStack[0];
			assert.equal(3, frame.stack.length);
			assert.equal(0x0201, frame.stack[0]);
			assert.equal(undefined, frame.stack[1]);
			assert.equal(undefined, frame.stack[2]);
		});


		test('LD SP bigger', async () => {
			// Put 3 values on frame stack
			let frame=history.reverseDbgStack[0];
			frame.stack.push(0x0201);
			frame.stack.push(0x0302);
			frame.stack.push(0x0403);

			// 80F5 LD SP,HL // HL = SP+4,	   SP=83F8, adds 2 items to the stack
			// 80F6 POP BC					// SP=83F4
			const currentLine="PC=80f5 SP=83f8 AF=01c0 BC=0000 HL=83fc DE=2000 IX=0300 IY=5c3a AF'=3320 BC'=174b HL'=107f DE'=0006 I=00 R=62 IM0 IFF12 (PC)=f9c1d1e1 (SP)=0403 MMU=00001111222233334444555566667777";
			const nextLine="PC=80f6 SP=83fc AF=01c0 BC=0000 HL=83fc DE=2000 IX=0300 IY=5c3a AF'=3320 BC'=174b HL'=107f DE'=0006 I=00 R=63  F=SZ------ F'=--5----- MEMPTR=0000 IM0 IFF12 VPS: 0 MMU=00001111222233334444555566667777";

			// Handle step forward
			await history.handleReverseDebugStackForward(currentLine, nextLine);
			// 2 values have been pushed to the frame stack
			assert.equal(1, history.reverseDbgStack.length);
			frame=history.reverseDbgStack[0];
			assert.equal(1, frame.stack.length);
			assert.equal(0x0201, frame.stack[0]);
		});

	});

});

