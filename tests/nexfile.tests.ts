
import * as assert from 'assert';
import {suite, test} from 'mocha';
import {DzrpRemote} from '../src/remotes/dzrp/dzrpremote';
import {NexFile} from '../src/remotes/dzrp/nexfile';
import {Z80_REG} from '../src/remotes/z80registers';

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
			public outPorts = new Array<[number, number]>();
			// All written registers in order: [reg, value]
			public outRegs = new Array<[number, number]>();
			public outSetNextRegsCount = 0;
			public outBankWrites = new Array<number>();
			public inRegs = new Map<number, number>([[0x08, 0b1000_0000], [0x68, 0b1001_0000]]);
			public async sendDzrpCmdWritePort(port: number, value: number): Promise<void> {
				this.outPorts.push([port, value]);
			}
			public async sendDzrpCmdSetNextregs(regValues: Array<[number, number]>): Promise<void> {
				this.outSetNextRegsCount++;
				this.outRegs.push(...regValues);
			}
			public async sendDzrpCmdWriteBankMem(bank: number, offset: number, dataArray: Buffer | Uint8Array): Promise<void> {
				this.outBankWrites.push(bank);
			}
			public async sendDzrpCmdGetTbblueReg(register: number): Promise<number> {
				return this.inRegs.get(register)!;
			}
			// Returns the registers without the palette values.
			public getRegsWithoutPalette(): Array<[number, number]> {
				return this.outRegs.filter(([reg]) => reg !== 0x44);
			}
			// Returns the palette values.
			public getPaletteValues(): number[] {
				return this.outRegs.filter(([reg]) => reg === 0x44).map(([, value]) => value);
			}
		}

		// Loads a NEX file with the given loading screen flags and checks the result.
		function testLoad(name: string, flags: number, check: (remote: MockDzrpRemote) => void) {
			test(name, async () => {
				const remote = new MockDzrpRemote() as any;
				const nexFile = new NexFile();
				nexFile.readBuffer(createNexBuffer(flags, 0b0010_1000));
				await remote.loadNexLoadingScreens(nexFile);
				assert.ok(remote.outSetNextRegsCount > 0);
				assert.equal(remote.outPorts.length, 0);
				check(remote);
			});
		}

		test('No loading screen', async () => {
			const remote = new MockDzrpRemote() as any;
			const nexFile = new NexFile();
			nexFile.readFile('./tests/data/nexfiles/project/main.nex');
			await remote.loadNexLoadingScreens(nexFile);
			assert.equal(remote.outPorts.length, 0);
			assert.equal(remote.outRegs.length, 0);
			assert.equal(remote.outSetNextRegsCount, 0);
			assert.equal(remote.outBankWrites.length, 0);
		});

		testLoad('Layer2', 0x01, remote => {
			assert.deepEqual(remote.getPaletteValues(), new Array(512).fill(0x11));
			assert.deepEqual(remote.getRegsWithoutPalette(), [
				[0x43, 0x10], [0x40, 0],	// Palette
				[0x12, 9], [0x70, 0], [0x16, 0], [0x17, 0],
				[0x1C, 1], [0x18, 0], [0x18, 255], [0x18, 0], [0x18, 191],
				[0x15, 0x01], [0x69, 0x80]
			]);
			// Palette is written before the index 0x44 values
			assert.deepEqual(remote.outRegs.slice(0, 3), [[0x43, 0x10], [0x40, 0], [0x44, 0x11]]);
			assert.deepEqual(remote.outBankWrites, [18, 19, 20, 21, 22, 23]);
		});

		testLoad('ULA', 0x02, remote => {
			assert.deepEqual(remote.getPaletteValues(), []);
			assert.deepEqual(remote.getRegsWithoutPalette(), [
				[0x68, 0b0001_0000], [0x15, 0x01], [0x69, 0]
			]);
			assert.deepEqual(remote.outBankWrites, [10]);
		});

		testLoad('LoRes', 0x04, remote => {
			assert.deepEqual(remote.getPaletteValues(), new Array(512).fill(0x11));
			assert.deepEqual(remote.getRegsWithoutPalette(), [
				[0x43, 0x01], [0x40, 0],	// Palette
				[0x68, 0b0001_0000], [0x32, 0], [0x33, 0], [0x15, 0x81], [0x69, 0x03]
			]);
			assert.deepEqual(remote.outBankWrites, [10, 11]);
		});

		testLoad('Timex HiRes', 0x08, remote => {
			assert.deepEqual(remote.getPaletteValues(), []);
			assert.deepEqual(remote.getRegsWithoutPalette(), [
				[0x68, 0b0001_0000], [0x08, 0b1000_0100], [0x15, 0x01], [0x69, 0b0010_1110]
			]);
			assert.deepEqual(remote.outBankWrites, [10, 11]);
		});

		testLoad('Timex HiCol', 0x10, remote => {
			assert.deepEqual(remote.getRegsWithoutPalette(), [
				[0x68, 0b0001_0000], [0x08, 0b1000_0100], [0x15, 0x01], [0x69, 0x02]
			]);
			assert.deepEqual(remote.outBankWrites, [10, 11]);
		});
	});

});
