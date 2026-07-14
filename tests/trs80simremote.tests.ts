import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {suite, test, setup} from 'mocha';
import {Trs80SimRemote} from '../src/remotes/trs80/trs80simremote';
import {Settings} from '../src/settings/settings';
import {Utility} from '../src/misc/utility';
import {Z80RegistersClass, Z80Registers, Z80_REG} from '../src/remotes/z80registers';
import {BREAK_REASON_NUMBER} from '../src/remotes/remotebase';
import {BreakInfo} from '../src/remotes/dzrp/dzrpremote';


suite('Trs80SimRemote', () => {
	let remote: Trs80SimRemote;
	let remoteAny: any;

	// The spike program at 0x4000 (start of Model I RAM):
	// 4000: 3C        INC A
	// 4001: 3C        INC A
	// 4002: 00        NOP
	// 4003: C3 03 40  JP 0x4003   (self-loop; the breakpoint target)
	const PROG_START = 0x4000;
	const BP_ADDR = 0x4003;
	const PROGRAM = Uint8Array.from([0x3C, 0x3C, 0x00, 0xC3, 0x03, 0x40]);

	setup(() => {
		Utility.setExtensionPath('.');
		const cfg: any = {
			remoteType: 'trs80sim',
			trs80sim: {
				model: 1
			},
			history: {
				reverseDebugInstructionCount: 0,
				spotCount: 0,
				codeCoverageEnabled: false
			}
		};
		const launch = Settings.Init(cfg);
		Settings.launch = launch;
		Z80RegistersClass.createRegisters(launch);
		remote = new Trs80SimRemote(launch);
		remoteAny = remote as any;
		remote.configureMachine();
	});


	/** Loads the spike program and points PC at it. */
	function loadTestProgram() {
		remote.trs80.writeMemoryBlock(PROG_START, PROGRAM);
		remote.trs80.z80.regs.pc = PROG_START;
		remote.trs80.z80.regs.af = 0x0000;	// A = 0
	}

	/** Runs sendDzrpCmdContinue and returns the BreakInfo of the stop. */
	async function continueUntilBreak(bp1?: number, bp2?: number): Promise<BreakInfo> {
		return new Promise<BreakInfo>(resolve => {
			remoteAny.funcContinueResolve = async (breakInfo: BreakInfo) => {
				resolve(breakInfo);
			};
			void remote.sendDzrpCmdContinue(bp1, bp2);
		});
	}


	test('machine configured: Model I ROM present, memory model set', () => {
		// Level II ROM starts with DI (0xF3)
		assert.equal(remote.trs80.readMemory(0x0000), 0xF3);
		assert.notEqual(remote.memoryModel, undefined);
		assert.equal(remote.memoryModel.name, 'TRS80_MODEL1');
	});


	test('sendDzrpCmdWriteMem/ReadMem roundtrip', async () => {
		const data = Uint8Array.from([0x01, 0x02, 0xFE, 0xFF, 0x80]);
		await remote.sendDzrpCmdWriteMem(0x8000, data);
		const readback = await remote.sendDzrpCmdReadMem(0x8000, data.length);
		assert.deepEqual([...readback], [...data]);
	});


	test('sendDzrpCmdSetRegister/GetRegisters', async () => {
		await remote.sendDzrpCmdSetRegister(Z80_REG.PC, 0x5000);
		await remote.sendDzrpCmdSetRegister(Z80_REG.SP, 0xFF00);
		await remote.sendDzrpCmdSetRegister(Z80_REG.HL, 0x1234);
		await remote.sendDzrpCmdSetRegister(Z80_REG.A, 0x42);
		await remote.sendDzrpCmdSetRegister(Z80_REG.BC2, 0xABCD);
		await remote.sendDzrpCmdSetRegister(Z80_REG.A2, 0x99);
		await remote.sendDzrpCmdSetRegister(Z80_REG.IM, 2);

		const regs = await remote.sendDzrpCmdGetRegisters();
		assert.equal(regs[Z80_REG.PC], 0x5000);
		assert.equal(regs[Z80_REG.SP], 0xFF00);
		assert.equal(regs[Z80_REG.HL], 0x1234);
		assert.equal(regs[Z80_REG.AF] >> 8, 0x42);
		assert.equal(regs[Z80_REG.BC2], 0xABCD);
		assert.equal(regs[Z80_REG.AF2] >> 8, 0x99);
		assert.equal(regs[Z80_REG.IM], 2);

		// Slots are appended after IM: count first, then the initial slots.
		const slots = remote.memoryModel.initialSlots;
		assert.equal(regs[Z80_REG.IM + 1], slots.length);
		for (let i = 0; i < slots.length; i++)
			assert.equal(regs[Z80_REG.IM + 2 + i], slots[i]);
	});


	test('continue stops at guard breakpoint, instruction-precise', async () => {
		loadTestProgram();

		const breakInfo = await continueUntilBreak(BP_ADDR);

		// Stopped exactly at the guard bp, after INC A; INC A; NOP.
		assert.equal(remote.trs80.z80.regs.pc, BP_ADDR);
		assert.equal(remote.trs80.z80.regs.a, 2);
		// Guard bp is no "real" breakpoint: reason stays NO_REASON (like zsim).
		assert.equal(breakInfo.reasonNumber, BREAK_REASON_NUMBER.NO_REASON);
		const expectedLong = Z80Registers.createLongAddress(BP_ADDR, remote.memoryModel.initialSlots);
		assert.equal(breakInfo.longAddr, expectedLong);
	});


	test('continue stops at real breakpoint with BREAKPOINT_HIT', async () => {
		loadTestProgram();

		// Add a "real" breakpoint at 0x4002 (the NOP) via the tmpBreakpoints map.
		const longAddr = Z80Registers.createLongAddress(0x4002, remote.memoryModel.initialSlots);
		const bp: any = {bpId: 1, longAddress: longAddr, condition: '', log: undefined};
		remoteAny.tmpBreakpoints.set(longAddr, [bp]);

		const breakInfo = await continueUntilBreak();

		assert.equal(remote.trs80.z80.regs.pc, 0x4002);
		assert.equal(remote.trs80.z80.regs.a, 2);	// Both INC A executed
		assert.equal(breakInfo.reasonNumber, BREAK_REASON_NUMBER.BREAKPOINT_HIT);
		assert.equal(breakInfo.longAddr, longAddr);
	});


	test('pause stops a running program with MANUAL_BREAK', async () => {
		loadTestProgram();

		// No breakpoints: the program spins in JP 0x4003 until paused.
		const breakPromise = continueUntilBreak();
		await Utility.timeout(20);
		await remote.sendDzrpCmdPause();
		const breakInfo = await breakPromise;

		assert.equal(breakInfo.reasonNumber, BREAK_REASON_NUMBER.MANUAL_BREAK);
		assert.equal(remote.trs80.z80.regs.pc, BP_ADDR);	// pinned in the self-loop
	});


	test('breakpoints get increasing ids, remove is a no-op', async () => {
		const bp1: any = {bpId: undefined};
		const bp2: any = {bpId: undefined};
		await remote.sendDzrpCmdAddBreakpoint(bp1);
		await remote.sendDzrpCmdAddBreakpoint(bp2);
		assert.equal(bp1.bpId, 1);
		assert.equal(bp2.bpId, 2);
		await remote.sendDzrpCmdRemoveBreakpoint(bp1);	// must not throw
	});


	test('loadBin loads a .cmd deterministically', async () => {
		// Minimal .cmd: load block "3E 42" (LD A,0x42) at 0x6000, transfer 0x6000.
		const cmdBytes = Uint8Array.from([
			0x01, 0x04, 0x00, 0x60, 0x3E, 0x42,	// load block
			0x02, 0x02, 0x00, 0x60					// transfer address
		]);
		const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trs80sim-test-'));
		const cmdPath = path.join(tmpDir, 'test.cmd');
		fs.writeFileSync(cmdPath, cmdBytes);

		try {
			remote.trs80.z80.regs.iff1 = 1;
			remote.trs80.z80.regs.iff2 = 1;
			await remote.loadBin(cmdPath);

			// Payload landed immediately, pc == entry, interrupts disabled.
			assert.equal(remote.trs80.readMemory(0x6000), 0x3E);
			assert.equal(remote.trs80.readMemory(0x6001), 0x42);
			assert.equal(remote.trs80.z80.regs.pc, 0x6000);
			assert.equal(remote.trs80.z80.regs.iff1, 0);
			assert.equal(remote.trs80.z80.regs.iff2, 0);
			// SP initialized (no topOfStack configured -> top of RAM)
			assert.equal(remote.trs80.z80.regs.sp, 0xFFFF);

			// Executing the loaded instruction sets A=0x42.
			remote.trs80.z80.regs.af = 0;
			remote.trs80.step();
			assert.equal(remote.trs80.z80.regs.a, 0x42);
		}
		finally {
			fs.rmSync(tmpDir, {recursive: true, force: true});
		}
	});


	test('loadBin rejects non-.cmd files', async () => {
		await assert.rejects(remote.loadBin('/tmp/does-not-matter.sna'), /not supported/);
	});


	/** Renders the screen buffer as text (Model I bit-6 folding). */
	function renderScreenText(chars: Uint8Array): string {
		let out = '';
		for (let row = 0; row < 16; row++) {
			for (let col = 0; col < 64; col++) {
				const c = chars[row * 64 + col] & 0x3F;
				out += String.fromCharCode((c < 0x20) ? c + 0x40 : c);
			}
			out += '\n';
		}
		return out;
	}

	test('screen buffer: coherent with VRAM, VRAM writes land in the buffer', async () => {
		// Coherence with VRAM (initial state).
		for (let i = 0; i < 1024; i++) {
			assert.equal(remote.screen.chars[i], remote.trs80.readMemory(0x3C00 + i),
				'screen buffer diverges from VRAM at index ' + i);
		}

		// A memory write to VRAM (e.g. from the debugger or the program) must
		// flow through the emulator into the buffering screen.
		remote.screen.dirty = false;
		// "HELLO" in Model I screen codes (bit-6 folded: 'H'=0x48 -> 0x08 etc.)
		const hello = Uint8Array.from([0x08, 0x05, 0x0C, 0x0C, 0x0F]);
		await remote.sendDzrpCmdWriteMem(0x3C00 + 2 * 64, hello);	// row 2

		assert.equal(remote.screen.dirty, true, 'VRAM write must set the dirty flag');
		for (let i = 0; i < hello.length; i++)
			assert.equal(remote.screen.chars[2 * 64 + i], hello[i]);
		const text = renderScreenText(remote.screen.chars);
		assert.ok(text.includes('HELLO'), 'expected HELLO on screen, got:\n' + text);
	});


	test('write watchpoint stops the run at the accessing instruction', async () => {
		// 4000: 3E 42     LD A,0x42
		// 4002: 32 00 70  LD (0x7000),A
		// 4005: C3 05 40  JP 0x4005
		remote.trs80.writeMemoryBlock(0x4000, Uint8Array.from([0x3E, 0x42, 0x32, 0x00, 0x70, 0xC3, 0x05, 0x40]));
		remote.trs80.z80.regs.pc = 0x4000;
		await remote.sendDzrpCmdAddWatchpoint(0x7000, 1, 'w');

		const breakInfo = await continueUntilBreak();

		assert.equal(breakInfo.reasonNumber, BREAK_REASON_NUMBER.WATCHPOINT_WRITE);
		const expectedLong = Z80Registers.createLongAddress(0x7000, remote.memoryModel.initialSlots);
		assert.equal(breakInfo.longAddr, expectedLong);
		// Stopped right after the writing instruction.
		assert.equal(remote.trs80.z80.regs.pc, 0x4005);
		assert.equal(remote.trs80.readMemory(0x7000), 0x42);
	});


	test('read watchpoint stops the run; removed watchpoint does not fire', async () => {
		// 4000: 3A 00 70  LD A,(0x7000)
		// 4003: C3 03 40  JP 0x4003
		remote.trs80.writeMemoryBlock(0x4000, Uint8Array.from([0x3A, 0x00, 0x70, 0xC3, 0x03, 0x40]));
		remote.trs80.z80.regs.pc = 0x4000;
		await remote.sendDzrpCmdAddWatchpoint(0x7000, 1, 'r');

		const breakInfo = await continueUntilBreak();
		assert.equal(breakInfo.reasonNumber, BREAK_REASON_NUMBER.WATCHPOINT_READ);
		assert.equal(remote.trs80.z80.regs.pc, 0x4003);

		// Remove the watchpoint: now the program spins in JP until paused.
		await (remote as any).sendDzrpCmdRemoveWatchpoint(0x7000, 1, 'r');
		remote.trs80.z80.regs.pc = 0x4000;
		const breakPromise = continueUntilBreak();
		await Utility.timeout(20);
		await remote.sendDzrpCmdPause();
		const breakInfo2 = await breakPromise;
		assert.equal(breakInfo2.reasonNumber, BREAK_REASON_NUMBER.MANUAL_BREAK);
	});


	test('keyEvent reaches the memory-mapped keyboard matrix (0x3801)', async () => {
		// Key presses are queued and applied during step().
		remote.keyEvent('a', true);
		let steps = 0;
		while (steps < 100000 && remote.trs80.readMemory(0x3801) === 0) {
			remote.trs80.step();
			steps++;
		}
		assert.equal(remote.trs80.readMemory(0x3801), 0x02, "bit 1 = key 'A' in row 0x3801");

		remote.keyEvent('a', false);
		steps = 0;
		while (steps < 200000 && remote.trs80.readMemory(0x3801) !== 0) {
			remote.trs80.step();
			steps++;
		}
		assert.equal(remote.trs80.readMemory(0x3801), 0x00, 'key released again');
	});
});
