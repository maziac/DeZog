
import * as assert from 'assert';
import {suite, test} from 'mocha';
import {DzrpRemote} from '../src/remotes/dzrp/dzrpremote';
import {NexFile} from '../src/remotes/dzrp/nexfile';
import {Z80_REG} from '../src/remotes/z80registers';
import {Z80Cpu} from '../src/remotes/zsimulator/z80cpu';
import {Z80Ports} from '../src/remotes/zsimulator/z80ports';
import {SimulatedMemory} from '../src/remotes/zsimulator/simulatedmemory';
import {MemoryModelAllRam} from '../src/remotes/MemoryModel/genericmemorymodels';

suite('NexFile related', () => {

	test('NexFile - all used values', () => {
		const nexFile = new NexFile();
		nexFile.readFile('./tests/data/nexfiles/project/main.nex');
		assert.equal(nexFile.entryBank, 42);
		assert.equal(nexFile.borderColor, 4);
		assert.equal(nexFile.pc, 0x7A12);
		assert.equal(nexFile.sp, 0x6EDA);

		// Check the memory banks
		assert.equal(nexFile.memBanks.length, 5);
		assert.equal(nexFile.memBanks[0].bank, 5);
		assert.equal(nexFile.memBanks[1].bank, 2);
		assert.equal(nexFile.memBanks[2].bank, 40);
		assert.equal(nexFile.memBanks[3].bank, 41);
		assert.equal(nexFile.memBanks[4].bank, 42);
	});


	test('NexFile - ULA loading screen', () => {
		// Header (512) + ULA screen (6912) + bank 5 (16k)
		const buf = Buffer.alloc(512 + 6912 + 0x4000);
		buf[10] = 0x02;	// ULA loading screen
		buf[18 + 5] = 1;	// Bank 5 used
		buf.fill(0xAA, 512, 512 + 6912);
		buf.fill(0x55, 512 + 6912);
		const nexFile = new NexFile();
		nexFile.readBuffer(buf);
		assert.equal(nexFile.ulaScreen!.length, 6912);
		assert.ok(nexFile.ulaScreen!.every(v => v === 0xAA));
		assert.equal(nexFile.memBanks.length, 1);
		assert.equal(nexFile.memBanks[0].bank, 5);
		assert.ok(nexFile.memBanks[0].data.every(v => v === 0x55));

		// Without loading screen
		const nexFile2 = new NexFile();
		nexFile2.readFile('./tests/data/nexfiles/project/main.nex');
		assert.equal(nexFile2.ulaScreen, undefined);
	});

	test('DzrpRemote - loadBinNex', async () => {
		class MockDzrpRemote extends DzrpRemote {
			public outBorderColor: number;
			public outPc: number;
			public outSp: number;
			public outSlotBanks = new Array<number>(8);
			public outBanks = new Set<number>();
			public async sendDzrpCmdWritePort(port: number, value: number): Promise<void> {
				if (port === 0xFE)
					this.outBorderColor = value;
			}
			public async sendDzrpCmdWriteBankMem(bank: number, offset: number, dataArray: Buffer | Uint8Array): Promise<void> {
				// Check that it is not assigned 2 times
				assert.ok(!this.outBanks.has(bank));
				this.outBanks.add(bank);
			}
			public async sendDzrpCmdSetSlot(slot: number, bank: number): Promise<number> {
				this.outSlotBanks[slot] = bank;
				return 0;
			}
			public async sendDzrpCmdSetRegister(regIndex: Z80_REG, value: number): Promise<void> {
				switch (regIndex) {
					case Z80_REG.PC:
						this.outPc = value;
						break;
					case Z80_REG.SP:
						this.outSp = value;
						break;
				}
			}
		}

		const remote = new MockDzrpRemote() as any;
		await remote.loadBinNex('./tests/data/nexfiles/project/main.nex');

		assert.equal(remote.outSlotBanks[0], 255);
		assert.equal(remote.outSlotBanks[1], 255);
		assert.equal(remote.outSlotBanks[2], 10);
		assert.equal(remote.outSlotBanks[3], 11);
		assert.equal(remote.outSlotBanks[4], 4);
		assert.equal(remote.outSlotBanks[5], 5);
		assert.equal(remote.outSlotBanks[6], 2 * 42);
		assert.equal(remote.outSlotBanks[7], 2 * 42 + 1);

		assert.equal(remote.outBanks.size, 10);
		assert.ok(remote.outBanks.has(2 * 5));
		assert.ok(remote.outBanks.has(2 * 5 + 1));
		assert.ok(remote.outBanks.has(2 * 2));
		assert.ok(remote.outBanks.has(2 * 2 + 1));
		assert.ok(remote.outBanks.has(2 * 40));
		assert.ok(remote.outBanks.has(2 * 40 + 1));
		assert.ok(remote.outBanks.has(2 * 41));
		assert.ok(remote.outBanks.has(2 * 41 + 1));
		assert.ok(remote.outBanks.has(2 * 42));
		assert.ok(remote.outBanks.has(2 * 42 + 1));

		assert.equal(remote.outBorderColor, 4);
		assert.equal(remote.outPc, 0x7A12);
		assert.equal(remote.outSp, 0x6EDA);
	});


	/** Creates a NEX file buffer with the given loading screen flags.
	 * Each block is filled with a different value: palette 0x11,
	 * screens 0x22 (Layer2), 0x33 (ULA), 0x44 (LoRes), 0x55 (HiRes),
	 * 0x66 (HiCol), bank 5 with 0x77.
	 */
	function createNexBuffer(flags: number, hiResColor = 0): Buffer {
		const blocks: Buffer[] = [];
		const header = Buffer.alloc(512);
		header[10] = flags;
		header[18 + 5] = 1;	// Bank 5 used
		header[138] = hiResColor;
		blocks.push(header);
		if (!(flags & 0x80) && (flags & 0x45))
			blocks.push(Buffer.alloc(512, 0x11));
		if (flags & 0x01)
			blocks.push(Buffer.alloc(49152, 0x22));
		if (flags & 0x02)
			blocks.push(Buffer.alloc(6912, 0x33));
		if (flags & 0x04)
			blocks.push(Buffer.alloc(12288, 0x44));
		if (flags & 0x08)
			blocks.push(Buffer.alloc(12288, 0x55));
		if (flags & 0x10)
			blocks.push(Buffer.alloc(12288, 0x66));
		if (flags & 0x40)
			blocks.push(Buffer.alloc(81920, 0xEE));
		blocks.push(Buffer.alloc(0x4000, 0x77));
		return Buffer.concat(blocks);
	}

	test('NexFile - loading screens', () => {
		// Layer2 with palette
		let nexFile = new NexFile();
		nexFile.readBuffer(createNexBuffer(0x01));
		assert.ok(nexFile.palette!.every(v => v === 0x11));
		assert.equal(nexFile.palette!.length, 512);
		assert.equal(nexFile.layer2Screen!.length, 49152);
		assert.ok(nexFile.layer2Screen!.every(v => v === 0x22));
		assert.equal(nexFile.ulaScreen, undefined);
		assert.ok(nexFile.memBanks[0].data.every(v => v === 0x77));
		let writes = nexFile.getLoadingScreenBankWrites();
		assert.deepEqual(writes.map(w => w.bank8), [18, 19, 20, 21, 22, 23]);
		assert.ok(writes.every(w => w.offset === 0 && w.data.length === 0x2000));

		// Layer2 without palette
		nexFile = new NexFile();
		nexFile.readBuffer(createNexBuffer(0x81));
		assert.equal(nexFile.palette, undefined);
		assert.ok(nexFile.layer2Screen!.every(v => v === 0x22));
		assert.ok(nexFile.memBanks[0].data.every(v => v === 0x77));

		// LoRes
		nexFile = new NexFile();
		nexFile.readBuffer(createNexBuffer(0x04));
		assert.ok(nexFile.palette!.every(v => v === 0x11));
		assert.ok(nexFile.loResScreen!.every(v => v === 0x44));
		assert.ok(nexFile.memBanks[0].data.every(v => v === 0x77));
		writes = nexFile.getLoadingScreenBankWrites();
		assert.deepEqual(writes.map(w => w.bank8), [10, 11]);
		assert.ok(writes.every(w => w.offset === 0 && w.data.length === 0x1800));

		// Timex HiRes (no palette)
		nexFile = new NexFile();
		nexFile.readBuffer(createNexBuffer(0x08, 0xFF));
		assert.equal(nexFile.palette, undefined);
		assert.ok(nexFile.timexHiResScreen!.every(v => v === 0x55));
		assert.equal(nexFile.timexHiResColor, 0b0011_1000);
		assert.ok(nexFile.memBanks[0].data.every(v => v === 0x77));

		// Timex HiCol
		nexFile = new NexFile();
		nexFile.readBuffer(createNexBuffer(0x10));
		assert.ok(nexFile.timexHiColScreen!.every(v => v === 0x66));
		assert.ok(nexFile.memBanks[0].data.every(v => v === 0x77));

		// Extended Layer2 (not loaded, but palette and size are skipped)
		nexFile = new NexFile();
		nexFile.readBuffer(createNexBuffer(0x40));
		assert.ok(nexFile.palette!.every(v => v === 0x11));
		assert.equal(nexFile.getLoadingScreenBankWrites().length, 0);
		assert.ok(nexFile.memBanks[0].data.every(v => v === 0x77));
	});

	suite('DzrpRemote - loadNexLoadingScreens', () => {
		class MockDzrpRemote extends DzrpRemote {
			public outPorts = new Array<{port: number, value: number}>();
			public outNextRegs = new Map<number, number>();
			public outPaletteValues = new Array<number>();
			public outBankWrites = new Array<number>();
			protected selectedReg = 0;
			public async sendDzrpCmdWritePort(port: number, value: number): Promise<void> {
				if (port === 0x243B)
					this.selectedReg = value;
				else if (port === 0x253B) {
					if (this.selectedReg === 0x44)
						this.outPaletteValues.push(value);
					else
						this.outNextRegs.set(this.selectedReg, value);
				}
				else
					this.outPorts.push({port, value});
			}
			public async sendDzrpCmdWriteBankMem(bank: number, offset: number, dataArray: Buffer | Uint8Array): Promise<void> {
				this.outBankWrites.push(bank);
			}
			public async sendDzrpCmdGetTbblueReg(register: number): Promise<number> {
				return 0b1000_0000;
			}
		}

		test('No loading screen', async () => {
			const remote = new MockDzrpRemote() as any;
			const nexFile = new NexFile();
			nexFile.readFile('./tests/data/nexfiles/project/main.nex');
			await remote.loadNexLoadingScreens(nexFile);
			assert.equal(remote.outPorts.length, 0);
			assert.equal(remote.outNextRegs.size, 0);
			assert.equal(remote.outBankWrites.length, 0);
		});

		test('Layer2', async () => {
			const remote = new MockDzrpRemote() as any;
			const nexFile = new NexFile();
			nexFile.readBuffer(createNexBuffer(0x01));
			await remote.loadNexLoadingScreens(nexFile);
			assert.equal(remote.outPaletteValues.length, 512);
			assert.ok(remote.outPaletteValues.every(v => v === 0x11));
			assert.equal(remote.outNextRegs.get(0x43), 0x10);
			assert.equal(remote.outNextRegs.get(0x40), 0);
			assert.equal(remote.outNextRegs.get(0x12), 9);
			assert.equal(remote.outNextRegs.get(0x15), 0x01);
			assert.deepEqual(remote.outBankWrites, [18, 19, 20, 21, 22, 23]);
			assert.deepEqual(remote.outPorts, [{port: 0x123B, value: 2}, {port: 0xFF, value: 0}]);
		});

		test('ULA', async () => {
			const remote = new MockDzrpRemote() as any;
			const nexFile = new NexFile();
			nexFile.readBuffer(createNexBuffer(0x02));
			await remote.loadNexLoadingScreens(nexFile);
			assert.equal(remote.outPaletteValues.length, 0);
			assert.deepEqual(remote.outBankWrites, [10]);
			assert.equal(remote.outNextRegs.get(0x15), 0x01);
			assert.deepEqual(remote.outPorts, [{port: 0x123B, value: 0}, {port: 0xFF, value: 0}]);
		});

		test('LoRes', async () => {
			const remote = new MockDzrpRemote() as any;
			const nexFile = new NexFile();
			nexFile.readBuffer(createNexBuffer(0x04));
			await remote.loadNexLoadingScreens(nexFile);
			assert.equal(remote.outPaletteValues.length, 512);
			assert.equal(remote.outNextRegs.get(0x43), 0x01);
			assert.equal(remote.outNextRegs.get(0x15), 0x81);
			assert.deepEqual(remote.outBankWrites, [10, 11]);
			assert.deepEqual(remote.outPorts, [{port: 0x123B, value: 0}, {port: 0xFF, value: 3}]);
		});

		test('Timex HiRes', async () => {
			const remote = new MockDzrpRemote() as any;
			const nexFile = new NexFile();
			nexFile.readBuffer(createNexBuffer(0x08, 0b0010_1000));
			await remote.loadNexLoadingScreens(nexFile);
			assert.equal(remote.outPaletteValues.length, 0);
			assert.equal(remote.outNextRegs.get(0x08), 0b1000_0100);	// Timex enabled
			assert.deepEqual(remote.outBankWrites, [10, 11]);
			assert.deepEqual(remote.outPorts, [{port: 0x123B, value: 0}, {port: 0xFF, value: 0b0010_1110}]);
		});

		test('Palette via CMD_EXEC_ASM', async () => {
			class MockExecAsmRemote extends MockDzrpRemote {
				public outCalls = new Array<string>();
				public outCodes = new Array<number[]>();
				public async sendDzrpCmdWriteBankMem(bank: number, offset: number, dataArray: Buffer | Uint8Array): Promise<void> {
					this.outCalls.push('bank' + bank + ':' + dataArray[0].toString(16));
				}
				public async sendDzrpCmdExecAsm(code: Array<number>): Promise<{error: number, a: number, f: number, bc: number, de: number, hl: number}> {
					this.outCalls.push('asm');
					this.outCodes.push(code);
					return {error: 0, f: 0, a: 0, bc: 0, de: 0, hl: 0};
				}
			}
			// Layer2: palette is temporarily stored in 8k bank 18
			let remote = new MockExecAsmRemote() as any;
			remote.supportsExecAsm = true;
			let nexFile = new NexFile();
			nexFile.readBuffer(createNexBuffer(0x01));
			await remote.loadNexLoadingScreens(nexFile);
			assert.equal(remote.outPaletteValues.length, 0);
			assert.deepEqual(remote.outCalls, ['bank18:11', 'asm', 'bank18:22', 'bank19:22', 'bank20:22', 'bank21:22', 'bank22:22', 'bank23:22', 'asm']);
			assert.deepEqual(remote.outCodes[0], remote.createPaletteUploadAsm(18, 0x10));
			// The display setup is done by the Z80, not by port writes
			assert.equal(remote.outPorts.length, 0);
			assert.equal(remote.outNextRegs.size, 0);

			// LoRes: palette is temporarily stored in 8k bank 10
			remote = new MockExecAsmRemote() as any;
			remote.supportsExecAsm = true;
			nexFile = new NexFile();
			nexFile.readBuffer(createNexBuffer(0x04));
			await remote.loadNexLoadingScreens(nexFile);
			assert.deepEqual(remote.outCalls, ['bank10:11', 'asm', 'bank10:44', 'bank11:44', 'asm']);
			assert.deepEqual(remote.outCodes[0], remote.createPaletteUploadAsm(10, 0x01));
		});

		test('createPaletteUploadAsm - execute', () => {
			// Setup a Z80N with simple Next register emulation
			const memModel = new MemoryModelAllRam();
			const ports = new Z80Ports('AND', 0xFF);
			const cpu = new Z80Cpu(new SimulatedMemory(memModel, ports), ports, {cpuFrequency: 3500000, Z80N: true} as any) as any;
			let selectedReg = 0;
			const nextRegs = new Map<number, number>([[0x56, 0x07]]);	// Slot 6 = bank 7
			const regWrites = new Array<{reg: number, value: number}>();
			ports.registerSpecificOutPortFunction(0x243B, (port, value) => selectedReg = value);
			ports.registerSpecificOutPortFunction(0x253B, (port, value) => {
				regWrites.push({reg: selectedReg, value});
				if (selectedReg !== 0x44)
					nextRegs.set(selectedReg, value);
			});
			ports.registerSpecificInPortFunction(0x253B, port => nextRegs.get(selectedReg) ?? 0);

			// Palette data at 0xC000 (all RAM, slot switching is not emulated)
			const palette = new Array<number>();
			for (let i = 0; i < 512; i++)
				palette.push((i * 7) & 0xFF);
			cpu.memory.writeBlock64k(0xC000, palette);
			// Code + RET at 0x8000
			const remote = new MockDzrpRemote() as any;
			const code = [...remote.createPaletteUploadAsm(42, 0x10), 0xC9];
			cpu.memory.writeBlock64k(0x8000, code);
			// Return address 0x0000
			cpu.memory.writeBlock64k(0x7FFE, [0x00, 0x00]);
			cpu.sp = 0x7FFE;
			cpu.pc = 0x8000;

			// Run until RET
			let count = 0;
			while (cpu.pc !== 0x0000) {
				cpu.z80.run_instruction();
				assert.ok(++count < 10000, "Endless loop");
			}

			// Check
			assert.equal(cpu.sp, 0x8000);
			const palWrites = regWrites.filter(w => w.reg === 0x44).map(w => w.value);
			assert.deepEqual(palWrites, palette);
			const otherWrites = regWrites.filter(w => w.reg !== 0x44);
			assert.deepEqual(otherWrites, [
				{reg: 0x56, value: 42},
				{reg: 0x43, value: 0x10},
				{reg: 0x40, value: 0},
				{reg: 0x56, value: 0x07}	// Restored
			]);
			// Palette control/index are written before the palette values
			const firstPalIndex = regWrites.findIndex(w => w.reg === 0x44);
			assert.ok(regWrites.findIndex(w => w.reg === 0x40) < firstPalIndex);
		});

		test('executeIoWrites - split into chunks', async () => {
			class MockExecAsmRemote extends MockDzrpRemote {
				public outCodes = new Array<number[]>();
				public async sendDzrpCmdExecAsm(code: Array<number>): Promise<{error: number, a: number, f: number, bc: number, de: number, hl: number}> {
					this.outCodes.push(code);
					return {error: 0, f: 0, a: 0, bc: 0, de: 0, hl: 0};
				}
			}
			const remote = new MockExecAsmRemote() as any;
			remote.supportsExecAsm = true;
			const ioWrites = new Array<any>();
			for (let i = 0; i < 40; i++)
				ioWrites.push({reg: i, value: i});	// 4 bytes each
			await remote.executeIoWrites(ioWrites);
			assert.equal(remote.outCodes.length, 2);
			assert.ok(remote.outCodes.every(c => c.length <= 90));
			assert.deepEqual([...remote.outCodes[0], ...remote.outCodes[1]], remote.createIoWritesAsm(ioWrites));
		});

		test('createIoWritesAsm - execute', () => {
			const memModel = new MemoryModelAllRam();
			const ports = new Z80Ports('AND', 0xFF);
			const cpu = new Z80Cpu(new SimulatedMemory(memModel, ports), ports, {cpuFrequency: 3500000, Z80N: true} as any) as any;
			let selectedReg = 0;
			const nextRegs = new Map<number, number>([[0x68, 0b1001_0000]]);
			const writes = new Array<string>();
			ports.registerGenericOutPortFunction((port, value) => {
				if (port === 0x243B)
					selectedReg = value;
				else if (port === 0x253B) {
					nextRegs.set(selectedReg, value);
					writes.push('reg' + selectedReg.toString(16) + '=' + value.toString(16));
				}
				else
					writes.push('port' + port.toString(16) + '=' + value.toString(16));
			});
			ports.registerSpecificInPortFunction(0x253B, port => nextRegs.get(selectedReg) ?? 0);

			const remote = new MockDzrpRemote() as any;
			const code = [...remote.createIoWritesAsm([
				{reg: 0x12, value: 9},
				{port: 0x123B, value: 2},
				{reg: 0x68, and: 0x7F, or: 0x01},
				{port: 0xFF, value: 0x2E}
			]), 0xC9];
			cpu.memory.writeBlock64k(0x8000, code);
			cpu.memory.writeBlock64k(0x7FFE, [0x00, 0x00]);
			cpu.sp = 0x7FFE;
			cpu.pc = 0x8000;
			let count = 0;
			while (cpu.pc !== 0x0000) {
				cpu.z80.run_instruction();
				assert.ok(++count < 1000, "Endless loop");
			}
			assert.deepEqual(writes, ['reg12=9', 'port123b=2', 'reg68=11', 'portff=2e']);
		});

		test('Timex HiCol', async () => {
			const remote = new MockDzrpRemote() as any;
			const nexFile = new NexFile();
			nexFile.readBuffer(createNexBuffer(0x10));
			await remote.loadNexLoadingScreens(nexFile);
			assert.deepEqual(remote.outBankWrites, [10, 11]);
			assert.deepEqual(remote.outPorts, [{port: 0x123B, value: 0}, {port: 0xFF, value: 2}]);
		});
	});

});
