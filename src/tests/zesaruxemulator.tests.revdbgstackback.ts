
import * as assert from 'assert';
import { ZesaruxCpuHistory } from '../remotes/zesarux/zesaruxcpuhistory';
import { ZesaruxRemote } from '../remotes/zesarux/zesaruxremote';
import { Z80RegistersClass, Z80Registers } from '../remotes/z80registers';
import { ZesaruxSocket, zSocket } from '../remotes/zesarux/zesaruxsocket';
import { RefList } from '../reflist';
import { CallStackFrame } from '../callstackframe';
import { DecodeZesaruxRegisters } from '../remotes/zesarux/decodezesaruxdata';


// Mock for the socket.
class MockZesaruxSocket extends ZesaruxSocket {
	public dataArray: Array<string> = [];
	public send(command: string, handler: {(data)} = (data) => {}, suppressErrorHandling = false, /*, timeout = -1*/) {
		// Calls the handler directly
		const data = this.dataArray.shift();
		assert.notEqual(data, undefined);
		handler(data);
	}
}


suite('ZesaruxEmulator', () => {

	let emul: any;
	let mockSocket: MockZesaruxSocket;

	setup(() => {
		Z80RegistersClass.Init();
	});


	suite('handleReverseDebugStackBack', () => {

		setup(() => {
			emul = new ZesaruxRemote();
			Z80RegistersClass.createRegisters();
			const decoder=new DecodeZesaruxRegisters();
			Z80Registers.setDecoder(decoder);
			emul.cpuHistory = new ZesaruxCpuHistory();
			mockSocket = new MockZesaruxSocket();
			(<any>zSocket) = mockSocket;
			// Push one frame on the stack
			emul.reverseDbgStack = new RefList();
			emul.reverseDbgStack.push(new CallStackFrame(0, 0, "__TEST_MAIN__"));
		});

		test('simple step back first history instruction', () => {
			//  80D5 LD B,03h
			const currentLine = "PC=80d5 SP=83fb AF=0208 BC=0000 HL=4000 DE=2000 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=0e IM0 IFF12 (PC)=06030e04 (SP)=80f5";
			// 80D7 LD C,04h (not from history)
			const prevLine = "PC=80d7 SP=83fb AF=0208 BC=0300 HL=4000 DE=2000 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=0f  F=----3--- F'=-Z---P-- MEMPTR=0000 IM0 IFF12 VPS: 0";

			// Handle step back
			emul.handleReverseDebugStackBack(currentLine, prevLine);
			// Nothing has been pushed on the stack
			assert.equal(1, emul.reverseDbgStack.length);
		});

		test('simple step back inside history', () => {
			//  80D3 LD A,02h
			const currentLine = "PC=80d3 SP=83fb AF=3f08 BC=0000 HL=4000 DE=2000 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=0d IM0 IFF12 (PC)=3e020603 (SP)=80f5";
			// 80D5 LD B,03h (from history)
			const prevLine = "PC=80d5 SP=83fb AF=0208 BC=0000 HL=4000 DE=2000 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=0e IM0 IFF12 "; //(PC)=06030e04 (SP)=80f5";

			// Handle step back
			emul.handleReverseDebugStackBack(currentLine, prevLine);
			// Nothing has been pushed on the stack
			assert.equal(1, emul.reverseDbgStack.length);
			const frame = emul.reverseDbgStack[0];
			assert.equal(0, frame.stack.length);
		});


		test('step back PUSH', () => {
			// Push something on the stack
			let frame = emul.reverseDbgStack[0];
			frame.stack.push(0x2F01);
			// 80ED PUSH 2F01h
			// 80E9 PUSH CA00h
			const currentLine = "PC=80e9 SP=8401 AF=3f08 BC=0000 HL=4000 DE=2000 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=43 IM0 IFF12 (PC)=ed8a00ca (SP)=0065";
			const prevLine = "PC=80ed SP=83ff AF=3f08 BC=0000 HL=4000 DE=2000 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=45 IM0 IFF12 "; //(PC)=ed8a012f (SP)=00ca";

			// Handle step back
			emul.handleReverseDebugStackBack(currentLine, prevLine);
			// Value has been removed from the stack
			assert.equal(1, emul.reverseDbgStack.length);
			frame = emul.reverseDbgStack[0];
			assert.equal(0x80e9, frame.addr);
			assert.equal(0, frame.stack.length);  // Nothing on the function stack
		});

		test('step back POP', () => {
			//   80F6 POP DE
			//   80F7 POP HL (not executed)
			const currentLine = "PC=80f6 SP=83ff AF=0208 BC=0303 HL=4000 DE=0202 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=4a IM0 IFF12 (PC)=d1e100c9 (SP)=0202";
			const prevLine = "PC=80f7 SP=8401 AF=0208 BC=0303 HL=4000 DE=0202 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=4b  F=----3--- F'=-Z---P-- MEMPTR=0000 IM0 IFF12 VPS: 0";

			// Handle step back
			emul.handleReverseDebugStackBack(currentLine, prevLine);
			// Value has been pushed to the stack
			assert.equal(1, emul.reverseDbgStack.length);
			const frame = emul.reverseDbgStack[0];
			assert.equal(0x80f6, frame.addr);
			assert.equal(1, frame.stack.length);  // 1 item on the function stack
			assert.equal(0x0202, frame.stack[0]);
		});

		test('step back CALL', () => {
			// Add something to remove
			emul.reverseDbgStack.unshift(new CallStackFrame(0, 0, "FUNC"));

			// 80D3 LD A,02h
		    // 80F2 CALL 80D3h
			const currentLine = "PC=80f2 SP=83fd AF=3f08 BC=0000 HL=4000 DE=2000 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=3b IM0 IFF12 (PC)=cdd380c1 (SP)=0303";
			const prevLine = "PC=80d3 SP=83fb AF=3f08 BC=0000 HL=4000 DE=2000 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=3c IM0 IFF12 (PC)=3e020603 (SP)=80f5";

			// Handle step back
			emul.handleReverseDebugStackBack(currentLine, prevLine);
			// Value has been removed from the callstack
			assert.equal(1, emul.reverseDbgStack.length);
		});

		test('step back RST', () => {
			// Add something to remove
			emul.reverseDbgStack.unshift(new CallStackFrame(0, 0, "FUNC"));

			// 80D3 LD A,02h
		    // 80F2 RST 18h
			const currentLine = "PC=80f2 SP=83fd AF=3f08 BC=0000 HL=4000 DE=2000 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=3b IM0 IFF12 (PC)=dfd380c1 (SP)=0303";
			const prevLine = "PC=80d3 SP=83fb AF=3f08 BC=0000 HL=4000 DE=2000 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=3c IM0 IFF12 (PC)=3e020603 (SP)=80f5";

			// Handle step back
			emul.handleReverseDebugStackBack(currentLine, prevLine);
			// Value has been removed from the callstack
			assert.equal(1, emul.reverseDbgStack.length);
		});

		test('step back RET', () => {
			// 80F5 POP BC
			// 80E4 RET
			const currentLine = "PC=80e4 SP=83fb AF=0208 BC=0304 HL=4000 DE=0202 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=48 IM0 IFF12 (PC)=c9ed8a01 (SP)=80f5";
			const prevLine = "PC=80f5 SP=83fd AF=0208 BC=0304 HL=4000 DE=0202 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=49 IM0 IFF12 "; //(PC)=c1d1e100 (SP)=0303";

			// Caller
			mockSocket.dataArray.push("CD3412");	// memory content at CALL nnnn

			// Handle step back
			emul.handleReverseDebugStackBack(currentLine, prevLine);
			// Value has been pushed to the callstack
			assert.equal(2, emul.reverseDbgStack.length);
			const frame = emul.reverseDbgStack.last();
			assert.equal(0x80e4, frame.addr);
			assert.equal("1234h", frame.name);
		});

		test('step back from isr', () => {
			// Add something to remove
			emul.reverseDbgStack.unshift(new CallStackFrame(0, 0, "ISR"));

			// 0038 DI
			// 80D3 LD A,02h
			const currentLine = "PC=80d3 SP=83fb AF=0208 BC=0303 HL=0101 DE=0202 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=34 IM0 IFF12 (PC)=3e020603 (SP)=80f5";
			const prevLine = "PC=0038 SP=83f9 AF=0208 BC=0303 HL=0101 DE=0202 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=36 IM0 IFF-- "; //(PC)=f3dde5e5 (SP)=80d5";

			// Handle step back
			emul.handleReverseDebugStackBack(currentLine, prevLine);
			// Value has been removed from the callstack
			assert.equal(1, emul.reverseDbgStack.length);
		});

		test('step back from isr to PUSH instruction', () => {
			// Add something to remove
			emul.reverseDbgStack[0].stack.push(1234);	// The PUSHed value
			emul.reverseDbgStack.unshift(new CallStackFrame(0, 0, "FUNC"));

			// 0038 DI
			// 80E5 PUSH 0101h
			const currentLine = "PC=80e5 SP=8403 AF=0208 BC=0303 HL=0101 DE=0202 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=5f IM0 IFF12 (PC)=ed8a0101 (SP)=8148";
			const prevLine = "PC=0038 SP=83ff AF=0208 BC=0303 HL=0101 DE=0202 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=62 IM0 IFF-- "; //(PC)=f3dde5e5 (SP)=80e9";

			// Handle step back
			emul.handleReverseDebugStackBack(currentLine, prevLine);
			// Value has been removed from the callstack
			assert.equal(1, emul.reverseDbgStack.length);
		});

		test('step back from isr to POP instruction', () => {
			// Add a 2nd call stack for the interrupt.
			emul.reverseDbgStack.push(new CallStackFrame(0, 0, "INTERRUPT"));

			// 0038 DI
			// 80F6 POP BC
			const currentLine = "PC=80f6 SP=83fb AF=02c9 BC=0304 HL=0101 DE=0202 IX=0cda IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=00 R=70 IM0 IFF12 (PC)=c1d1e100 (SP)=0303";
			const prevLine = "PC=0038 SP=83fb AF=02c9 BC=0303 HL=0101 DE=0202 IX=0cda IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=00 R=72 IM0 IFF--"; // (PC)=f3dde5e5 (SP)=80f7";

			// Handle step back
			emul.handleReverseDebugStackBack(currentLine, prevLine);

			// The interrupt must be removed from the callstack,
			// but the POP must have been pushed to the frame stack.
			assert.equal(1, emul.reverseDbgStack.length);
			let frame = emul.reverseDbgStack[0];
			assert.equal("__TEST_MAIN__", frame.name);
			assert.equal(1, frame.stack.length);
			assert.equal(0x0303, frame.stack[0]);

		});

		test('step back from isr to RET instruction', () => {
			// Add a 2nd call stack for the interrupt.
			emul.reverseDbgStack.push(new CallStackFrame(0, 0, "INTERRUPT"));
			// Prepare memory of caller: CALL 80E5h
			mockSocket.dataArray.push("CDE580");

			// 0038 DI
			// 80E5 RET
			const currentLine = "PC=80e5 SP=8400 AF=01c9 BC=0000 HL=4000 DE=2000 IX=ffff IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=00 R=24 IM0 IFF12 (PC)=c900ed8a (SP)=8147";
			const prevLine = "PC=0038 SP=8400 AF=01c9 BC=0000 HL=4000 DE=2000 IX=ffff IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=00 R=26  F=SZ--3--C F'=-Z---P-- MEMPTR=0000 IM0 IFF-- VPS: 0";

			// Handle step back
			emul.handleReverseDebugStackBack(currentLine, prevLine);

			// The interrupt must be removed from the callstack,
			// but the RET must have been pushed to the call stack.
			assert.equal(2, emul.reverseDbgStack.length);
			let frame = emul.reverseDbgStack[0];
			assert.equal("__TEST_MAIN__", frame.name);
			frame = emul.reverseDbgStack[1];
			assert.equal("80E5h", frame.name);
			assert.equal(0, frame.stack.length);
		});


		test('step back into isr', () => {
			// 80E9 PUSH 0202h
			// 0049 RET
			const currentLine = "PC=0049 SP=83ff AF=0208 BC=0303 HL=0101 DE=0202 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=7a IM0 IFF12 (PC)=c90608af (SP)=80e9";
			const prevLine = "PC=80e9 SP=8401 AF=0208 BC=0303 HL=0101 DE=0202 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=7b IM0 IFF12 "; //(PC)=ed8a0202 (SP)=0101";

			// There is no caller, but some memory must be returned
			mockSocket.dataArray.push("AA3412");

			// Handle step back
			(<any>emul).handleReverseDebugStackBack(currentLine, prevLine);
			// Value has been pushed to the callstack
			assert.equal(2, emul.reverseDbgStack.length);
			const frame=emul.reverseDbgStack.last();
			assert.equal(0x0049, frame.addr);
			assert.equal("__UNKNOWN__", frame.name);	// Most probably an interrupt, but we don't know
		});

		test('Unallowed RET', () => {
			// RETs from main function (something unexpected might happen in the assembler code)

			// 80E9 ...
			// 8123 RET
			const currentLine = "PC=0049 SP=83ff AF=0208 BC=0303 HL=0101 DE=0202 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=7a IM0 IFF12 (PC)=c90608af (SP)=80e9";
			const prevLine = "PC=80e9 SP=8401 AF=0208 BC=0303 HL=0101 DE=0202 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=7b IM0 IFF12";

			// There is no caller, but some memory must be returned
			mockSocket.dataArray.push("AA3412");

			// Handle step back
			(<any>emul).handleReverseDebugStackBack(currentLine, prevLine);
			// Value has been pushed to the callstack
			assert.equal(2, emul.reverseDbgStack.length);
			let frame=emul.reverseDbgStack[1];
			assert.equal("__UNKNOWN__", frame.name);	// Could as well have been an interrupt
			frame = emul.reverseDbgStack[0];
			assert.equal("__TEST_MAIN__", frame.name);
		});

		test('LD SP bigger', () => {
			// Put 1 value on frame stack
			let frame = emul.reverseDbgStack[0];
			frame.stack.push(0x0201);

			// 80F7 NOP						// SP=8402
			// 80F6 LD SP,HL // HL = SP+4,	   SP=83FE, removes 2 items from the stack
			const currentLine = "PC=80f6 SP=83fe AF=01c0 BC=0000 HL=8402 DE=2000 IX=ff3c IY=5c3a AF'=0044 BC'=0000 HL'=2758 DE'=369b I=00 R=1f IM0 IFF12 (PC)=f900cdd3 (SP)=0303";
			const prevLine = "PC=80f7 SP=8402 AF=01c0 BC=0000 HL=8402 DE=2000 IX=ff3c IY=5c3a AF'=0044 BC'=0000 HL'=2758 DE'=369b I=00 R=20 IM0 IFF12";	// (PC)=00cdd380 (SP)=0101;

			// Handle step back
			(<any>emul).handleReverseDebugStackBack(currentLine, prevLine);
			// 2 undefined values have been added.
			assert.equal(1, emul.reverseDbgStack.length);
			frame = emul.reverseDbgStack[0];
			assert.equal(3, frame.stack.length);
			assert.equal(0x0201, frame.stack[0]);
			assert.equal(undefined, frame.stack[1]);
			assert.equal(undefined, frame.stack[2]);
		});


		test('LD SP smaller', () => {
			// Put 3 values on frame stack
			let frame = emul.reverseDbgStack[0];
			frame.stack.push(0x0201);
			frame.stack.push(0x0302);
			frame.stack.push(0x0403);

			// 80F7 NOP						// SP=83FA
			// 80F6 LD SP,HL // HL = SP-4,	   SP=83FE, pushes 2 items to the stack
			const currentLine = "PC=80f6 SP=83fe AF=01d1 BC=0000 HL=83fa DE=2000 IX=003c IY=5c3a AF'=2420 BC'=174b HL'=107f DE'=0006 I=00 R=6e IM0 IFF12 (PC)=f900cdd3 (SP)=0303";
			const prevLine = "PC=80f7 SP=83fa AF=01d1 BC=0000 HL=83fa DE=2000 IX=003c IY=5c3a AF'=2420 BC'=174b HL'=107f DE'=0006 I=00 R=6f IM0 IFF12";	// (PC)=00cdd380 (SP)=0000"

			// Handle step back
			(<any>emul).handleReverseDebugStackBack(currentLine, prevLine);
			// 2 values have been pushed to the frame stack
			assert.equal(1, emul.reverseDbgStack.length);
			frame = emul.reverseDbgStack[0];
			assert.equal(1, frame.stack.length);
			assert.equal(0x0201, frame.stack[0]);
		});

	});


});

