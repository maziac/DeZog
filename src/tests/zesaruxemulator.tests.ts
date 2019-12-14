
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

	suite('ZesaruxStack', () => {
		setup(() => {
			emul = new ZesaruxEmulator();
		});

		test('getInterruptName', () => {
			const name = emul.getInterruptName();
			assert.equal("__INTERRUPT__", name);
		});

		test('getMainName', () => {
			emul.topOfStack = 100;
			let name = emul.getMainName(100);
			assert.equal("__MAIN__", name);

			name = emul.getMainName(102);
			assert.equal("__MAIN-2__", name);

			name = emul.getMainName(98);
			assert.equal("__MAIN+2__", name);

			emul.topOfStack = undefined;
			name = emul.getMainName(102);
			assert.equal("__MAIN__", name);
		});
	});


	suite('handleReverseDebugStackBack', () => {
		setup(() => {
			emul = new ZesaruxEmulator();
			emul.cpuHistory = new ZesaruxCpuHistory();
			mockSocket = new MockZesaruxSocket();
			(<any>zSocket) = mockSocket;
			// Push one frame on the stack
			emul.reverseDbgStack = new RefList();
			emul.reverseDbgStack.unshift(new Frame(0, 0, "__TEST_MAIN__"));
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
		});


		test('step back push', () => {
			// Prepare stack
			let frame = emul.reverseDbgStack[0];
			frame.stack.push(0x2F01);	// push something on the stack

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

		test('step back pop', () => {
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
		});

		test('step back call', () => {
			// Add something to remove
			emul.reverseDbgStack.unshift(new Frame(0, 0, "FUNC"));

			// 80D3 LD A,02h
		    // 80F2 CALL 80D3h
			const currentLine = "PC=80f2 SP=83fd AF=3f08 BC=0000 HL=4000 DE=2000 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=3b IM0 IFF12 (PC)=cdd380c1 (SP)=0303";
			const prevLine = "PC=80d3 SP=83fb AF=3f08 BC=0000 HL=4000 DE=2000 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=3c IM0 IFF12 (PC)=3e020603 (SP)=80f5";

			// Handle step back
			emul.handleReverseDebugStackBack(currentLine, prevLine);
			// Value has been removed from the callstack
			assert.equal(1, emul.reverseDbgStack.length);
		});

		test('step back ret', () => {
			// 80F5 POP BC
			// 80E4 RET
			const currentLine = "PC=80e4 SP=83fb AF=0208 BC=0304 HL=4000 DE=0202 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=48 IM0 IFF12 (PC)=c9ed8a01 (SP)=80f5";
			const prevLine = "PC=80f5 SP=83fd AF=0208 BC=0304 HL=4000 DE=0202 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=49 IM0 IFF12 "; //(PC)=c1d1e100 (SP)=0303";

			// Caller
			mockSocket.dataArray.push("CD3412");	// memory content at CALL nnnn, e.g. CD

			// Handle step back
			emul.handleReverseDebugStackBack(currentLine, prevLine);
			// Value has been pushed to the callstack
			assert.equal(2, emul.reverseDbgStack.length);
			const frame = emul.reverseDbgStack[0];
			assert.equal(0x80e4, frame.addr);
			assert.equal("1234h", frame.name);
		});

		test('step back from isr', () => {
			// Add something to remove
			emul.reverseDbgStack.unshift(new Frame(0, 0, "ISR"));

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
			emul.reverseDbgStack.unshift(new Frame(0, 0, "FUNC"));

			// 0038 DI
			// 80E5 PUSH 0101h
			const currentLine = "PC=80e5 SP=8403 AF=0208 BC=0303 HL=0101 DE=0202 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=5f IM0 IFF12 (PC)=ed8a0101 (SP)=8148";
			const prevLine = "PC=0038 SP=83ff AF=0208 BC=0303 HL=0101 DE=0202 IX=ffff IY=5c3a AF'=0044 BC'=0001 HL'=f3f3 DE'=0001 I=00 R=62 IM0 IFF-- "; //(PC)=f3dde5e5 (SP)=80e9";

			// Handle step back
			emul.handleReverseDebugStackBack(currentLine, prevLine);
			// Value has been removed from the callstack
			assert.equal(1, emul.reverseDbgStack.length);
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
			const frame = emul.reverseDbgStack[0];
			assert.equal(0x0049, frame.addr);
			assert.equal("__INTERRUPT__", frame.name);
		});

	});


});

