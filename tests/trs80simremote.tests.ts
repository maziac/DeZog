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
});
