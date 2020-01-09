
import * as assert from 'assert';
import { ZesaruxCpuHistory } from '../zesaruxCpuHistory';
import { ZesaruxEmulator } from '../zesaruxemulator';
import { Z80Registers } from '../z80Registers';
import { ZesaruxRegisters } from '../zesaruxRegisters';
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
		Z80Registers.Init();
	});

/*
	teardown( () => dc.disconnect() );
*/

	suite('handleReverseDebugStackForward', () => {
		setup(() => {
			emul = new ZesaruxEmulator();
			const regs = new ZesaruxRegisters();
			emul.cpuHistory = new ZesaruxCpuHistory(regs);
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


		test('step forward POP', () => {
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

		test('step forward PUSH', () => {
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

		test('step forward RET', () => {
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

		test('step forward CALL', () => {
			// 8143 CALL 80F0h
			// 80E5 NOP
			const currentLine = "PC=8143 SP=8401 AF=01c9 BC=0000 HL=4000 DE=2000 IX=03d4 IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=00 R=59 IM0 IFF12 (PC)=cdf08018 (SP)=0000";
			const nextLine = "PC=80e5 SP=83ff AF=01c9 BC=0000 HL=4000 DE=2000 IX=03d4 IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=00 R=5a IM0 IFF12 (PC)=00ed8a01 (SP)=8146";

			// Handle step forward
			emul.handleReverseDebugStackForward(currentLine, nextLine);
			// Value has been pushed to the callstack
			assert.equal(2, emul.reverseDbgStack.length);
			const frame = emul.reverseDbgStack[0];
			assert.equal(0x80E5, frame.addr);
			assert.equal("80F0h", frame.name);
		});

		test('step forward RST', () => {
			// 8143 RST 18h
			// 80E5 NOP
			const currentLine = "PC=8143 SP=8401 AF=01c9 BC=0000 HL=4000 DE=2000 IX=03d4 IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=00 R=59 IM0 IFF12 (PC)=dfe58018 (SP)=0000";
			const nextLine = "PC=80e5 SP=83ff AF=01c9 BC=0000 HL=4000 DE=2000 IX=03d4 IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=00 R=5a IM0 IFF12 (PC)=00ed8a01 (SP)=8146";

			// Handle step forward
			emul.handleReverseDebugStackForward(currentLine, nextLine);
			// Value has been pushed to the callstack
			assert.equal(2, emul.reverseDbgStack.length);
			const frame = emul.reverseDbgStack[0];
			assert.equal(0x80E5, frame.addr);
			assert.equal("0018h", frame.name);
		});

		test('step forward from isr ret', () => {
			// Add something to remove
			emul.reverseDbgStack.unshift(new Frame(0, 0, "ISR"));

			// 0049 RET (from ISR)
			// 80D3 80D9 PUSH BC
			const currentLine = "PC=0049 SP=83f5 AF=02c9 BC=0303 HL=0101 DE=0202 IX=03d4 IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=00 R=35 IM0 IFF12 (PC)=c90608af (SP)=80d7";
			const nextLine = "PC=80d7 SP=83f7 AF=02c9 BC=0303 HL=0101 DE=0202 IX=03d4 IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=00 R=36 IM0 IFF12 (PC)=0e04c5f5 (SP)=80f6";

			// Handle step forward
			emul.handleReverseDebugStackForward(currentLine, nextLine);
			// Value has been removed from the callstack
			assert.equal(1, emul.reverseDbgStack.length);
		});

		test('step forward from PUSH to isr', () => {
			// 80E9 PUSH 0302h
			// 0038 DI
			const currentLine = "PC=80e9 SP=83f7 AF=01c9 BC=0403 HL=0201 DE=0302 IX=03d4 IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=00 R=3e IM0 IFF12 (PC)=ed8a0302 (SP)=0201";
			const nextLine = "PC=0038 SP=83f3 AF=01c9 BC=0403 HL=0201 DE=0302 IX=03d4 IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=00 R=41 IM0 IFF-- (PC)=f3dde5e5 (SP)=80ed";

			// Handle step forward
			emul.handleReverseDebugStackForward(currentLine, nextLine);
			// Value and isr have been pushed to the stack
			assert.equal(2, emul.reverseDbgStack.length);
			let frame = emul.reverseDbgStack[0];
			assert.equal("__INTERRUPT__", frame.name);
			assert.equal(0, frame.stack.length);
			frame = emul.reverseDbgStack[1];
			assert.equal("__TEST_MAIN__", frame.name);
			assert.equal(1, frame.stack.length);
			assert.equal(0x0302, frame.stack[0]);
		});

		test('step forward from CALL to isr', () => {
			// 813E CALL 80E5h
			// 0038 DI
			const currentLine = "PC=813e SP=83fc AF=01c9 BC=0000 HL=4000 DE=2000 IX=03d4 IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=00 R=55 IM0 IFF12 (PC)=cde58018 (SP)=0000";
			const nextLine = "PC=0038 SP=83f8 AF=01c9 BC=0000 HL=4000 DE=2000 IX=03d4 IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=00 R=57 IM0 IFF-- (PC)=f3dde5e5 (SP)=80e5";

			// Handle step forward
			emul.handleReverseDebugStackForward(currentLine, nextLine);
			// Value and isr have been pushed to the stack
			assert.equal(3, emul.reverseDbgStack.length);
			let frame = emul.reverseDbgStack[0];
			assert.equal("__INTERRUPT__", frame.name);
			assert.equal(0, frame.stack.length);
			frame = emul.reverseDbgStack[1];
			assert.equal("80E5h", frame.name);
			assert.equal(0, frame.stack.length);
			frame = emul.reverseDbgStack[2];
			assert.equal("__TEST_MAIN__", frame.name);
			assert.equal(0, frame.stack.length);
		});

		test('step forward from RST to isr', () => {
			// 813E RST 18h
			// 0038 DI
			const currentLine = "PC=813e SP=83fc AF=01c9 BC=0000 HL=4000 DE=2000 IX=03d4 IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=00 R=55 IM0 IFF12 (PC)=dfe58018 (SP)=0000";
			const nextLine = "PC=0038 SP=83f8 AF=01c9 BC=0000 HL=4000 DE=2000 IX=03d4 IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=00 R=57 IM0 IFF-- (PC)=f3dde5e5 (SP)=80e5";

			// Handle step forward
			emul.handleReverseDebugStackForward(currentLine, nextLine);
			// Value and isr have been pushed to the stack
			assert.equal(3, emul.reverseDbgStack.length);
			let frame = emul.reverseDbgStack[0];
			assert.equal("__INTERRUPT__", frame.name);
			assert.equal(0, frame.stack.length);
			frame = emul.reverseDbgStack[1];
			assert.equal("0018h", frame.name);
			assert.equal(0, frame.stack.length);
			frame = emul.reverseDbgStack[2];
			assert.equal("__TEST_MAIN__", frame.name);
			assert.equal(0, frame.stack.length);
		});

		test('step back from POP to isr', () => {
			// Push something on the stack
			let frame = emul.reverseDbgStack[0];
			frame.stack.push(0x2F01);

		    //	80F1 POP BC
			//  0038 DI
			const currentLine = "PC=80f1 SP=83f3 AF=01c9 BC=0403 HL=0201 DE=0302 IX=03d4 IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=00 R=05 IM0 IFF12 (PC)=c1d1e1c9 (SP)=0403";
			const nextLine = "PC=0038 SP=83f3 AF=01c9 BC=0403 HL=0201 DE=0302 IX=03d4 IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=00 R=07 IM0 IFF-- (PC)=f3dde5e5 (SP)=80f2";

			// Handle step forward
			emul.handleReverseDebugStackForward(currentLine, nextLine);

			// The interrupt must have been pushed to the call stack.
			assert.equal(2, emul.reverseDbgStack.length);
			frame = emul.reverseDbgStack[0];
			assert.equal("__INTERRUPT__", frame.name);
			assert.equal(0, frame.stack.length);
			// The POP must have been pushed to the frame stack.
			frame = emul.reverseDbgStack[1];
			assert.equal("__TEST_MAIN__", frame.name);
			assert.equal(0, frame.stack.length);
		});

		test('step forward from RET to isr', () => {
			// Add a 2nd call stack for the interrupt.
			emul.reverseDbgStack.unshift(new Frame(0, 0, "FUNC"));
			// Prepare memory of caller: CALL 80E5h
			mockSocket.dataArray.push("CDE580");

			//  80E5 RET
			//  0038 DI
			const currentLine = "PC=80e5 SP=8400 AF=01c9 BC=0000 HL=4000 DE=2000 IX=03d4 IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=00 R=29 IM0 IFF12 (PC)=c900ed8a (SP)=8147";
			const nextLine = "PC=0038 SP=8400 AF=01c9 BC=0000 HL=4000 DE=2000 IX=03d4 IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=00 R=2b IM0 IFF-- (PC)=f3dde5e5 (SP)=8147";

			// Handle step forward
			emul.handleReverseDebugStackForward(currentLine, nextLine);

			// The RET must have been removed from the callstack,
			// but the ISR must have been pushed to the call stack.
			assert.equal(2, emul.reverseDbgStack.length);
			let frame = emul.reverseDbgStack[1];
			assert.equal("__TEST_MAIN__", frame.name);
			frame = emul.reverseDbgStack[0];
			assert.equal("__INTERRUPT__", frame.name);
			assert.equal(0, frame.stack.length);
		});


		test('step forward into isr', () => {
			// 80EE NOP
			// 0038 DI
			const currentLine = "PC=80ee SP=8404 AF=01c9 BC=0403 HL=0201 DE=0302 IX=03d4 IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=00 R=63 IM0 IFF12 (PC)=0000ed8a (SP)=814b";
			const nextLine = "PC=0038 SP=8402 AF=01c9 BC=0403 HL=0201 DE=0302 IX=03d4 IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=00 R=65 IM0 IFF-- (PC)=f3dde5e5 (SP)=80ef";

			// Handle step forward
			(<any>emul).handleReverseDebugStackForward(currentLine, nextLine);
			// ISR has been pushed to the callstack
			assert.equal(2, emul.reverseDbgStack.length);
			const frame = emul.reverseDbgStack[0];
			assert.equal(0x0038, frame.addr);
			assert.equal("__INTERRUPT__", frame.name);
			assert.equal(0, frame.stack.length);
		});

		test('LD SP smaller', () => {
			// Put 1 value on frame stack
			let frame = emul.reverseDbgStack[0];
			frame.stack.push(0x0201);

			// 80F5 LD SP,HL // HL = SP-4,	   SP=83F8, adds 2 items to the stack
			// 80F6 POP BC					// SP=83F4
			const currentLine = "PC=80f5 SP=83f8 AF=01d1 BC=0000 HL=83f4 DE=2000 IX=0300 IY=5c3a AF'=3320 BC'=174b HL'=107f DE'=0006 I=00 R=7f IM0 IFF12 (PC)=f9c1d1e1 (SP)=0403";
			const nextLine = "PC=80f6 SP=83f4 AF=01d1 BC=0000 HL=83f4 DE=2000 IX=0300 IY=5c3a AF'=3320 BC'=174b HL'=107f DE'=0006 I=00 R=00 IM0 IFF12 (PC)=c1d1e1c9 (SP)=0000";

			// Handle step forward
			(<any>emul).handleReverseDebugStackForward(currentLine, nextLine);
			// 2 undefined values have been added.
			assert.equal(1, emul.reverseDbgStack.length);
			frame = emul.reverseDbgStack[0];
			assert.equal(3, frame.stack.length);
			assert.equal(0x0201, frame.stack[0]);
			assert.equal(undefined, frame.stack[1]);
			assert.equal(undefined, frame.stack[2]);
		});


		test('LD SP bigger', () => {
			// Put 3 values on frame stack
			let frame = emul.reverseDbgStack[0];
			frame.stack.push(0x0201);
			frame.stack.push(0x0302);
			frame.stack.push(0x0403);

			// 80F5 LD SP,HL // HL = SP+4,	   SP=83F8, adds 2 items to the stack
			// 80F6 POP BC					// SP=83F4
			const currentLine = "PC=80f5 SP=83f8 AF=01c0 BC=0000 HL=83fc DE=2000 IX=0300 IY=5c3a AF'=3320 BC'=174b HL'=107f DE'=0006 I=00 R=62 IM0 IFF12 (PC)=f9c1d1e1 (SP)=0403";
			const nextLine = "PC=80f6 SP=83fc AF=01c0 BC=0000 HL=83fc DE=2000 IX=0300 IY=5c3a AF'=3320 BC'=174b HL'=107f DE'=0006 I=00 R=63  F=SZ------ F'=--5----- MEMPTR=0000 IM0 IFF12 VPS: 0";

			// Handle step forward
			(<any>emul).handleReverseDebugStackForward(currentLine, nextLine);
			// 2 values have been pushed to the frame stack
			assert.equal(1, emul.reverseDbgStack.length);
			frame = emul.reverseDbgStack[0];
			assert.equal(1, frame.stack.length);
			assert.equal(0x0201, frame.stack[0]);
		});

	});


});

