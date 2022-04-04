
import * as assert from 'assert';
import {DzrpRemote} from '../src/remotes/dzrp/dzrpremote';
import {NexFile} from '../src/remotes/dzrp/nexfile';
import {Z80_REG} from '../src/remotes/z80registers';

suite('NexFile related', () => {

	test('NexFile - all used values', () => {
		const nexFile = new NexFile();
		nexFile.readFile('./tests/data/nexfiles/project/example.nex');
		assert.equal(nexFile.entryBank, 9);
		assert.equal(nexFile.borderColor, 4);
		assert.equal(nexFile.pc, 0x7E12);
		assert.equal(nexFile.sp, 0xFEDA);

		// Check the memory banks
		assert.equal(nexFile.memBanks.length, 3);
		assert.equal(nexFile.memBanks[0].bank, 5);
		assert.equal(nexFile.memBanks[1].bank, 100);
		assert.equal(nexFile.memBanks[2].bank, 101);
	});

	class MockDzrpRemote extends DzrpRemote {
		public outBorderColor: number;
		public outPc: number;
		public outSp: number;
		public outSlotBanks = new Array<number>(8);
		public outBanks = new Set<number>();
		public async sendDzrpCmdSetBorder(borderColor: number): Promise<void> {
			this.outBorderColor = borderColor;
		}
		public async sendDzrpCmdWriteBank(bank: number, dataArray: Buffer | Uint8Array): Promise<void> {
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

	test('DzrpRemote - loadBinNex', async () => {
		const remote = new MockDzrpRemote() as any;
		await remote.loadBinNex('./tests/data/nexfiles/project/example.nex');

		assert.equal(remote.outSlotBanks[0], 254);
		assert.equal(remote.outSlotBanks[1], 255);
		assert.equal(remote.outSlotBanks[2], 10);
		assert.equal(remote.outSlotBanks[3], 11);
		assert.equal(remote.outSlotBanks[4], 4);
		assert.equal(remote.outSlotBanks[5], 5);
		assert.equal(remote.outSlotBanks[6], 2 * 9);
		assert.equal(remote.outSlotBanks[7], 2 * 9 + 1);

		assert.equal(remote.outBanks.serializeState, 6);
		assert.ok(remote.outBanks.has(2 * 5));
		assert.ok(remote.outBanks.has(2 * 5 + 1));
		assert.ok(remote.outBanks.has(2 * 100));
		assert.ok(remote.outBanks.has(2 * 100 + 1));
		assert.ok(remote.outBanks.has(2 * 101));
		assert.ok(remote.outBanks.has(2 * 101 + 1));

		assert.equal(remote.outBorderColor, 4);
		assert.equal(remote.outPc, 0x7E12);
		assert.equal(remote.outSp, 0xFEDA);
	});

});
