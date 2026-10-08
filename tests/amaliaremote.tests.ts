import * as assert from 'assert';
import {suite, test, setup} from 'mocha';
import {AmaliaGdbRemote} from '../src/remotes/amalia/amaliagdbremote';
import {Z80RegisterAmaliaDecoder} from '../src/remotes/amalia/z80registersamaliadecoder';
import {MemBlock} from '../src/remotes/remotebase';
import {Settings} from '../src/settings/settings';



suite('AmaliaRemote', () => {

	suite('Z80RegisterAmaliaDecoder', () => {
		// The 'g' packet reply includes the unavailable IR field before the slots.
		// af   bc   de   hl   af2  bc2  de2  hl2  ix   iy   sp   pc   ir   s0   s1   s2   s3
		const regs = 'CDAB' + '9825' + '5611' + '4222' + '1122' + '2233' + '3344' + '2077'
			+ 'FFFA' + 'E7CC' + 'FEFF' + '09A7' + 'xxxx' + '0400' + '0500' + '0600' + '0700';
		const Decoder = new Z80RegisterAmaliaDecoder();

		test('registers', () => {
			assert.equal(Decoder.parseAF(regs), 0xABCD);
			assert.equal(Decoder.parseBC(regs), 0x2598);
			assert.equal(Decoder.parseDE(regs), 0x1156);
			assert.equal(Decoder.parseHL(regs), 0x2242);
			assert.equal(Decoder.parseAF2(regs), 0x2211);
			assert.equal(Decoder.parseBC2(regs), 0x3322);
			assert.equal(Decoder.parseDE2(regs), 0x4433);
			assert.equal(Decoder.parseHL2(regs), 0x7720);
			assert.equal(Decoder.parseIX(regs), 0xFAFF);
			assert.equal(Decoder.parseIY(regs), 0xCCE7);
			assert.equal(Decoder.parseSP(regs), 0xFFFE);
			assert.equal(Decoder.parsePC(regs), 0xA709);
		});

		test('slots', () => {
			assert.equal(regs.length, 68);
			assert.deepEqual(Decoder.parseSlots(regs), [4, 5, 6, 7]);
		});
	});


	suite('initial stop query', () => {
		let amalia;
		let sent: string[];

		setup(() => {
			const cfg: any = {remoteType: 'amalia'};
			const launch = Settings.Init(cfg);
			Settings.launch = launch;
			amalia = new AmaliaGdbRemote(launch.mame) as any;
			sent = [];
			amalia.sendPacketData = async (packetData: string) => {
				sent.push(packetData);
				return packetData.startsWith('qXfer') ? '<architecture>z80</architecture>' : 'T050b:0000;thread:01;';
			};
			amalia.createMemoryModel = () => ({init: () => {}});
			amalia.load = async () => {};
		});

		test('queries the initial stop reply after reading target XML', async () => {
			await amalia.onConnect();
			assert.deepEqual(sent, ['qXfer:features:read:target.xml:00,FFFF', '?']);
		});

		test('a stop reply completes the initial stop query', async () => {
			let reply: string | undefined;
			const response = new Promise<string>(resolve => {
				amalia.messageQueue.push({
					customData: {packetData: '?'},
					resolve,
					reject: () => {}
				});
			});
			amalia.sendNextMessage = async () => {};
			amalia.receivedMsg('T050b:0000;thread:01;');
			reply = await response;
			assert.equal(reply, 'T050b:0000;thread:01;');
			assert.equal(amalia.messageQueue.length, 0);
		});
	});


	suite('sendDzrpCmdReadMemBlocks', () => {

		let amalia;
		// The 'm' commands that were sent.
		let reads: {addr64k: number, size: number}[];

		setup(() => {
			// Initialize Settings
			const cfg: any = {
				remoteType: 'amalia'
			};
			const launch = Settings.Init(cfg);
			Settings.launch = launch;
			amalia = new AmaliaGdbRemote(launch.mame) as any;

			// Fake the memory: the value of a byte is its address modulo 256.
			reads = [];
			amalia.readMemWithM = async (addr64k: number, size: number) => {
				reads.push({addr64k, size});
				const data = new Uint8Array(size);
				for (let i = 0; i < size; i++)
					data[i] = (addr64k + i) & 0xFF;
				return data;
			};
		});

		/** Checks that every block holds the expected memory content. */
		function assertContents(blocks: MemBlock[], result: Uint8Array[]) {
			assert.equal(result.length, blocks.length);
			for (let i = 0; i < blocks.length; i++) {
				const {addr64k, size} = blocks[i];
				const expected = new Uint8Array(size);
				for (let k = 0; k < size; k++)
					expected[k] = (addr64k + k) & 0xFF;
				assert.deepEqual(Array.from(result[i]), Array.from(expected), 'block ' + i);
			}
		}

		test('single block is read as is', async () => {
			const blocks = [{addr64k: 0x8000, size: 4}];
			const result = await amalia.sendDzrpCmdReadMemBlocks(blocks);
			assert.deepEqual(reads, [{addr64k: 0x8000, size: 4}]);
			assertContents(blocks, result);
		});

		test('neighbouring blocks are merged into one read', async () => {
			const blocks = [
				{addr64k: 0x8000, size: 3},
				{addr64k: 0x8010, size: 3},
				{addr64k: 0x8020, size: 3}
			];
			const result = await amalia.sendDzrpCmdReadMemBlocks(blocks);
			assert.equal(reads.length, 1);
			assert.deepEqual(reads[0], {addr64k: 0x8000, size: 0x23});
			assertContents(blocks, result);
		});

		test('blocks are merged independent of their order', async () => {
			const blocks = [
				{addr64k: 0x8020, size: 3},
				{addr64k: 0x8000, size: 3},
				{addr64k: 0x8010, size: 3}
			];
			const result = await amalia.sendDzrpCmdReadMemBlocks(blocks);
			assert.equal(reads.length, 1);
			// The result is in the order of the requested blocks
			assertContents(blocks, result);
		});

		test('a big gap is not merged', async () => {
			const blocks = [
				{addr64k: 0x8000, size: 3},
				{addr64k: 0x9000, size: 3}
			];
			const result = await amalia.sendDzrpCmdReadMemBlocks(blocks);
			assert.deepEqual(reads, [{addr64k: 0x8000, size: 3}, {addr64k: 0x9000, size: 3}]);
			assertContents(blocks, result);
		});

		test('a merged read is limited in size', async () => {
			// Gaps are small enough to merge but the total would exceed MAX_READ_BLOCK
			const blocks: MemBlock[] = [];
			for (let addr = 0x8000; addr < 0x8000 + 0x600; addr += 0x80)
				blocks.push({addr64k: addr, size: 3});
			const result = await amalia.sendDzrpCmdReadMemBlocks(blocks);
			assert.ok(reads.length > 1, 'expected more than one read');
			for (const read of reads)
				assert.ok(read.size <= 0x400, 'read too big: ' + read.size);
			assertContents(blocks, result);
		});

		test('duplicate and overlapping blocks', async () => {
			const blocks = [
				{addr64k: 0x8000, size: 3},
				{addr64k: 0x8000, size: 3},
				{addr64k: 0x8001, size: 3}
			];
			const result = await amalia.sendDzrpCmdReadMemBlocks(blocks);
			assert.equal(reads.length, 1);
			assert.deepEqual(reads[0], {addr64k: 0x8000, size: 4});
			assertContents(blocks, result);
		});

		test('a block at the end of the memory is read on its own', async () => {
			const blocks = [
				{addr64k: 0xFFFE, size: 4},	// Wraps around
				{addr64k: 0x8000, size: 3}
			];
			const result = await amalia.sendDzrpCmdReadMemBlocks(blocks);
			assert.deepEqual(reads, [{addr64k: 0xFFFE, size: 4}, {addr64k: 0x8000, size: 3}]);
			assertContents(blocks, result);
		});
	});


	suite('breakpoints', () => {

		let amalia;
		// The packets that were sent.
		let sent: string[];

		setup(() => {
			const cfg: any = {
				remoteType: 'amalia'
			};
			const launch = Settings.Init(cfg);
			Settings.launch = launch;
			amalia = new AmaliaGdbRemote(launch.mame) as any;
			sent = [];
			amalia.sendPacketData = async (packetData: string) => {
				sent.push(packetData);
				return 'OK';
			};
		});

		test('a 64k address is sent as is', async () => {
			// No bank bits, i.e. the breakpoint is valid in any bank
			const bp: any = {longAddress: 0x8000};
			await amalia.sendDzrpCmdAddBreakpoint(bp);
			await amalia.sendDzrpCmdRemoveBreakpoint(bp);
			assert.deepEqual(sent, ['Z0,8000,0', 'z0,8000,0']);
		});

		test('a long address keeps its bank', async () => {
			// Bank 4 is stored as bank+1 in bits 16+
			const bp: any = {longAddress: 0x58000};
			await amalia.sendDzrpCmdAddBreakpoint(bp);
			await amalia.sendDzrpCmdRemoveBreakpoint(bp);
			assert.deepEqual(sent, ['Z0,58000,0', 'z0,58000,0']);
		});

		test('the highest PCW bank', async () => {
			// Bank 127 -> bank+1 = 128 (0x80)
			const bp: any = {longAddress: 0x80C000};
			await amalia.sendDzrpCmdAddBreakpoint(bp);
			assert.deepEqual(sent, ['Z0,80c000,0']);
		});

		test('an id is set so that the breakpoint can be removed', async () => {
			const bp: any = {longAddress: 0x58000};
			await amalia.sendDzrpCmdAddBreakpoint(bp);
			assert.notEqual(bp.bpId, 0);
			assert.notEqual(bp.bpId, undefined);
		});
	});
});
