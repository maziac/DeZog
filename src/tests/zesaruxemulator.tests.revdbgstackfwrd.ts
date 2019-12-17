
import * as assert from 'assert';
import { ZesaruxCpuHistory } from '../zesaruxCpuHistory';
import { ZesaruxEmulator } from '../zesaruxemulator';
import { Z80Registers } from '../z80Registers';
import { ZesaruxSocket, zSocket } from '../zesaruxSocket';
import { RefList } from '../reflist';
import { Frame } from '../frame';


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
		Z80Registers.init();
	});

/*
	teardown( () => dc.disconnect() );
*/

	suite('handleReverseDebugStackForward', () => {
		setup(() => {
			emul = new ZesaruxEmulator();
			emul.cpuHistory = new ZesaruxCpuHistory();
			mockSocket = new MockZesaruxSocket();
			(<any>zSocket) = mockSocket;
			// Push one frame on the stack
			emul.reverseDbgStack = new RefList();
			emul.reverseDbgStack.unshift(new Frame(0, 0, "__TEST_MAIN__"));
		});

		test('simple step forward inside history', () => {
			//  80D3 LD A,02h
			const currentLine = "PC=80d3 SP=83fb AF=3f08 BC=0000 HL=4000 DE=2000 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=0d IM0 IFF12 (PC)=3e020603 (SP)=80f5";
			// 80D5 LD B,03h (from history)
			const nextLine = "PC=80d5 SP=83fb AF=0208 BC=0000 HL=4000 DE=2000 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=0e IM0 IFF12 "; //(PC)=06030e04 (SP)=80f5";

			// Handle step forward
			emul.handleReverseDebugStackForward(currentLine, nextLine);
			// Nothing has been pushed on the stack
			assert.equal(1, emul.reverseDbgStack.length);
			const frame = emul.reverseDbgStack[0];
			assert.equal(0, frame.stack.length);
		});


		test('step forward pop', () => {
			// Prepare stack
			let frame = emul.reverseDbgStack[0];
			frame.stack.push(0x2F01);	// push something on the stack

			// 80FC POP DE
			// 80FD POP HL
			const currentLine = "PC=80fc SP=83fc AF=02d1 BC=0000 HL=83fa DE=0202 IX=03d4 IY=5c3a AF'=0044 BC'=0002 HL'=0303 DE'=00d0 I=00 R=65 IM0 IFF12 (PC)=d1e100c9 (SP)=0000";
			const nextLine = "PC=80fd SP=83fe AF=02d1 BC=0000 HL=83fa DE=0000 IX=03d4 IY=5c3a AF'=0044 BC'=0002 HL'=0303 DE'=00d0 I=00 R=66 IM0 IFF12 (PC)=e100c900 (SP)=0303";

			// Handle step forward
			emul.handleReverseDebugStackForward(currentLine, nextLine);
			// Value has been removed from the stack
			assert.equal(1, emul.reverseDbgStack.length);
			frame = emul.reverseDbgStack[0];
			assert.equal(0x80fd, frame.addr);
			assert.equal(0, frame.stack.length);  // Nothing on the function stack
		});

		test('step forward push', () => {
			// 80EA PUSH 0402h
			// 80EE PUSH 0303h
			const currentLine = "PC=80ea SP=8402 AF=01c9 BC=0000 HL=4000 DE=2000 IX=03d4 IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=00 R=4e IM0 IFF12 (PC)=ed8a0402 (SP)=0101";
			const nextLine = "PC=80ee SP=8400 AF=01c9 BC=0000 HL=4000 DE=2000 IX=03d4 IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=00 R=50 IM0 IFF12 (PC)=ed8a0303 (SP)=0202";

			// Handle step forward
			emul.handleReverseDebugStackForward(currentLine, nextLine);
			// Value has been pushed to the stack
			assert.equal(1, emul.reverseDbgStack.length);
			const frame = emul.reverseDbgStack[0];
			assert.equal(0x80EE, frame.addr);
			assert.equal(1, frame.stack.length);  // 1 item on the function stack
			assert.equal(0x0402, frame.stack[0]);
		});

		test('step forward ret', () => {
			// Add something to remove
			emul.reverseDbgStack.unshift(new Frame(0, 0, "FUNC"));

			// 80FA RET
		    // 8146 JR 8143h
			const currentLine = "PC=80fa SP=83ff AF=02c9 BC=0303 HL=0101 DE=0202 IX=03d4 IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=00 R=62 IM0 IFF12 (PC)=c900e123 (SP)=8146";
			const nextLine = "PC=8146 SP=8401 AF=02c9 BC=0303 HL=0101 DE=0202 IX=03d4 IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=00 R=63 IM0 IFF12 (PC)=18fb2150 (SP)=0000";

			// Handle step forward
			emul.handleReverseDebugStackForward(currentLine, nextLine);
			// Value has been removed from the callstack
			assert.equal(1, emul.reverseDbgStack.length);
		});

		test('step forward call', () => {
			// 8143 CALL 80E5h
			// 80E5 NOP
			const currentLine = "PC=8143 SP=8401 AF=01c9 BC=0000 HL=4000 DE=2000 IX=03d4 IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=00 R=59 IM0 IFF12 (PC)=cde58018 (SP)=0000";
			const nextLine = "PC=80e5 SP=83ff AF=01c9 BC=0000 HL=4000 DE=2000 IX=03d4 IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=00 R=5a IM0 IFF12 (PC)=00ed8a01 (SP)=8146";


			// Handle step forward
			emul.handleReverseDebugStackForward(currentLine, nextLine);
			// Value has been pushed to the callstack
			assert.equal(2, emul.reverseDbgStack.length);
			const frame = emul.reverseDbgStack[0];
			assert.equal(0x80e5, frame.addr);
			assert.equal("80E5h", frame.name);
		});

		test('step back from isr', () => {
			// Add something to remove
			emul.reverseDbgStack.unshift(new Frame(0, 0, "ISR"));

			// 0038 DI
			// 80D3 LD A,02h
			const currentLine = "PC=80d3 SP=83fb AF=0208 BC=0303 HL=0101 DE=0202 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=34 IM0 IFF12 (PC)=3e020603 (SP)=80f5";
			const nextLine = "PC=0038 SP=83f9 AF=0208 BC=0303 HL=0101 DE=0202 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=36 IM0 IFF-- "; //(PC)=f3dde5e5 (SP)=80d5";

			// Handle step forward
			emul.handleReverseDebugStackForward(currentLine, nextLine);
			// Value has been removed from the callstack
			assert.equal(1, emul.reverseDbgStack.length);
		});

		test('step back from isr to PUSH instruction', () => {
			// Add something to remove
			emul.reverseDbgStack[0].stack.push(1234);	// The PUSHed value
			emul.reverseDbgStack.unshift(new Frame(0, 0, "FUNC"));

			// 0038 DI
			// 80E5 PUSH 0101h
			const currentLine = "PC=80e5 SP=8403 AF=0208 BC=0303 HL=0101 DE=0202 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=5f IM0 IFF12 (PC)=ed8a0101 (SP)=8148";
			const nextLine = "PC=0038 SP=83ff AF=0208 BC=0303 HL=0101 DE=0202 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=62 IM0 IFF-- "; //(PC)=f3dde5e5 (SP)=80e9";

			// Handle step forward
			emul.handleReverseDebugStackForward(currentLine, nextLine);
			// Value has been removed from the callstack
			assert.equal(1, emul.reverseDbgStack.length);
		});

		test('step back from isr to POP instruction', () => {
			// Add a 2nd call stack for the interrupt.
			emul.reverseDbgStack.unshift(new Frame(0, 0, "INTERRUPT"));

			// 0038 DI
			// 80F6 POP BC
			const currentLine = "PC=80f6 SP=83fb AF=02c9 BC=0304 HL=0101 DE=0202 IX=0cda IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=00 R=70 IM0 IFF12 (PC)=c1d1e100 (SP)=0303";
			const nextLine = "PC=0038 SP=83fb AF=02c9 BC=0303 HL=0101 DE=0202 IX=0cda IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=00 R=72 IM0 IFF--"; // (PC)=f3dde5e5 (SP)=80f7";

			// Handle step forward
			emul.handleReverseDebugStackForward(currentLine, nextLine);

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
			emul.reverseDbgStack.unshift(new Frame(0, 0, "INTERRUPT"));
			// Prepare memory of caller: CALL 80E5h
			mockSocket.dataArray.push("CDE580");

			// 0038 DI
			// 80E5 RET
			const currentLine = "PC=80e5 SP=8400 AF=01c9 BC=0000 HL=4000 DE=2000 IX=ffff IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=00 R=24 IM0 IFF12 (PC)=c900ed8a (SP)=8147";
			const nextLine = "PC=0038 SP=8400 AF=01c9 BC=0000 HL=4000 DE=2000 IX=ffff IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=00 R=26  F=SZ--3--C F'=-Z---P-- MEMPTR=0000 IM0 IFF-- VPS: 0";

			// Handle step forward
			emul.handleReverseDebugStackForward(currentLine, nextLine);

			// The interrupt must be removed from the callstack,
			// but the RET must have been pushed to the call stack.
			assert.equal(2, emul.reverseDbgStack.length);
			let frame = emul.reverseDbgStack[1];
			assert.equal("__TEST_MAIN__", frame.name);
			frame = emul.reverseDbgStack[0];
			assert.equal("80E5h", frame.name);
			assert.equal(0, frame.stack.length);
		});


		test('step back into isr', () => {
			// 80E9 PUSH 0202h
			// 0049 RET
			const currentLine = "PC=0049 SP=83ff AF=0208 BC=0303 HL=0101 DE=0202 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=7a IM0 IFF12 (PC)=c90608af (SP)=80e9";
			const nextLine = "PC=80e9 SP=8401 AF=0208 BC=0303 HL=0101 DE=0202 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=7b IM0 IFF12 "; //(PC)=ed8a0202 (SP)=0101";

			// There is no caller, but some memory must be returned
			mockSocket.dataArray.push("AA3412");

			// Handle step forward
			(<any>emul).handleReverseDebugStackForward(currentLine, nextLine);
			// Value has been pushed to the callstack
			assert.equal(2, emul.reverseDbgStack.length);
			const frame = emul.reverseDbgStack[0];
			assert.equal(0x0049, frame.addr);
			assert.equal("__UNKNOWN__", frame.name);	// Most probably an interrupt, but we don't know
		});

		test('Unallowed RET', () => {
			// RETs from main function (something unexpected might happen in the assembler code)

			// 80E9 ...
			// 8123 RET
			const currentLine = "PC=0049 SP=83ff AF=0208 BC=0303 HL=0101 DE=0202 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=7a IM0 IFF12 (PC)=c90608af (SP)=80e9";
			const nextLine = "PC=80e9 SP=8401 AF=0208 BC=0303 HL=0101 DE=0202 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=7b IM0 IFF12";

			// There is no caller, but some memory must be returned
			mockSocket.dataArray.push("AA3412");

			// Handle step forward
			(<any>emul).handleReverseDebugStackForward(currentLine, nextLine);
			// Value has been pushed to the callstack
			assert.equal(2, emul.reverseDbgStack.length);
			let frame = emul.reverseDbgStack[0];
			assert.equal("__UNKNOWN__", frame.name);	// Could as well have been an interrupt
			frame = emul.reverseDbgStack[1];
			assert.equal("__TEST_MAIN__", frame.name);
		});

		test('LD SP bigger', () => {
			// Put 1 value on frame stack
			let frame = emul.reverseDbgStack[0];
			frame.stack.push(0x0101);

			// 80F7 NOP						// SP=8402
			// 80F6 LD SP,HL // HL = SP+4,	   SP=83FE, removes 2 items from the stack
			const currentLine = "PC=80f6 SP=83fe AF=01c0 BC=0000 HL=8402 DE=2000 IX=ff3c IY=5c3a AF'=0044 BC'=0000 HL'=2758 DE'=369b I=00 R=1f IM0 IFF12 (PC)=f900cdd3 (SP)=0303";
			const nextLine = "PC=80f7 SP=8402 AF=01c0 BC=0000 HL=8402 DE=2000 IX=ff3c IY=5c3a AF'=0044 BC'=0000 HL'=2758 DE'=369b I=00 R=20 IM0 IFF12";	// (PC)=00cdd380 (SP)=0101;

			// Handle step forward
			(<any>emul).handleReverseDebugStackForward(currentLine, nextLine);
			// 2 undefined values have been added.			assert.equal(1, emul.reverseDbgStack.length);
			frame = emul.reverseDbgStack[0];
			assert.equal(3, frame.stack.length);
			assert.equal(0x0101, frame.stack[0]);
			assert.equal(undefined, frame.stack[1]);
			assert.equal(undefined, frame.stack[2]);
		});


		test('LD SP smaller', () => {
			// Put 3 values on frame stack
			let frame = emul.reverseDbgStack[0];
			frame.stack.push(0x0101);
			frame.stack.push(0x0202);
			frame.stack.push(0x0303);

			// 80F7 NOP						// SP=83FA
			// 80F6 LD SP,HL // HL = SP-4,	   SP=83FE, pushes 2 items to the stack
			const currentLine = "PC=80f6 SP=83fe AF=01d1 BC=0000 HL=83fa DE=2000 IX=003c IY=5c3a AF'=2420 BC'=174b HL'=107f DE'=0006 I=00 R=6e IM0 IFF12 (PC)=f900cdd3 (SP)=0303";
			const nextLine = "PC=80f7 SP=83fa AF=01d1 BC=0000 HL=83fa DE=2000 IX=003c IY=5c3a AF'=2420 BC'=174b HL'=107f DE'=0006 I=00 R=6f IM0 IFF12";	// (PC)=00cdd380 (SP)=0000"

			// Handle step forward
			(<any>emul).handleReverseDebugStackForward(currentLine, nextLine);
			// 2 values have been pushed to the frame stack
			assert.equal(1, emul.reverseDbgStack.length);
			frame = emul.reverseDbgStack[0];
			assert.equal(1, frame.stack.length);
			assert.equal(0x0101, frame.stack[0]);
		});

	});


});

