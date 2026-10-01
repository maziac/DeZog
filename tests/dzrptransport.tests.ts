import * as assert from 'assert';
import * as sinon from 'sinon';
import {suite, test, setup} from 'mocha';
import {WorkspacePaths} from '../src/misc/workspacepaths';
import {DzrpTransportRemote} from '../src/remotes/dzrptransport/dzrptransportremote';
import {DZRP} from '../src/remotes/dzrp/dzrpremote';



suite('DzrpTransportRemote', () => {
	let mockRemote: sinon.SinonMock;
	let remote: DzrpTransportRemote;
	let remoteAny: any; // Same as any

	suite('dataReceived', () => {

		setup(() => {
			WorkspacePaths.setExtensionPath('.');
			const cfg = {
				serialPort: 'some-port',
				timeout: 1000
			};
			remote = new DzrpTransportRemote(cfg);
			mockRemote = sinon.mock(remote);
			remoteAny = remote as any;
			remoteAny.receivedData = Buffer.alloc(0);
			remoteAny.expectedLength = 4;
			remoteAny.receivingHeader = true;
			sinon.stub(remoteAny, 'startChunkTimeout').returns(undefined);;
			sinon.stub(remoteAny, 'stopChunkTimeout').returns(undefined);

		});

		test('Empty packet', () => {
			mockRemote.expects('dataReceived').once();
			mockRemote.expects('receivedMsg').never();
			remoteAny.dataReceived(Buffer.from([]));
			assert.ok(remoteAny.receivingHeader);
			mockRemote.verify();
		});

		test('Add data up to header', () => {
			mockRemote.expects('receivedMsg').never();
			remoteAny.dataReceived(Buffer.from([1]));
			assert.ok(remoteAny.receivingHeader);
			remoteAny.dataReceived(Buffer.from([2]));
			assert.ok(remoteAny.receivingHeader);
			remoteAny.dataReceived(Buffer.from([3]));
			assert.ok(remoteAny.receivingHeader);
			remoteAny.dataReceived(Buffer.from([4]));
			assert.ok(!remoteAny.receivingHeader);
			mockRemote.verify();
		});

		test('Receive full packet', () => {
			const receivedMessages: Buffer[] = [];
			mockRemote.expects('receivedMsg').once().callsFake((data: Buffer) => {
				receivedMessages.push(data);
			});
			remoteAny.dataReceived(Buffer.from([10, 0, 0, 0, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]));
			assert.ok(remoteAny.receivingHeader);
			assert.deepEqual(receivedMessages, [Buffer.from([10, 11, 12, 13, 14, 15, 16, 17, 18, 19])]);
			mockRemote.verify();
		});

		test('Receive full packet in chunks', () => {
			const receivedMessages: Buffer[] = [];
			mockRemote.expects('receivedMsg').once().callsFake((data: Buffer) => {
				receivedMessages.push(data);
			});
			const sepData = [10, 0, 0, 0, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
			for (const data of sepData) {
				remoteAny.dataReceived(Buffer.from([data]));
			}
			assert.ok(remoteAny.receivingHeader);
			assert.deepEqual(receivedMessages, [Buffer.from([10, 11, 12, 13, 14, 15, 16, 17, 18, 19])]);
			mockRemote.verify();
		});

		test('Receive 2 packets at once', () => {
			const receivedMessages: Buffer[] = [];
			mockRemote.expects('receivedMsg').twice().callsFake((data: Buffer) => {
				receivedMessages.push(data);
			});
			remoteAny.dataReceived(Buffer.from([
				2, 0, 0, 0, 1, 2,	// 1rst message
				3, 0, 0, 0, 11, 12, 13	// 2nd message
			]));
			assert.ok(remoteAny.receivingHeader);
			assert.deepEqual(receivedMessages, [Buffer.from([1, 2]), Buffer.from([11, 12, 13])]);
			mockRemote.verify();
		});

		test('Receive 1 full packet plus 1 half (header)', () => {
			const receivedMessages: Buffer[] = [];
			mockRemote.expects('receivedMsg').once().callsFake((data: Buffer) => {
				receivedMessages.push(data);
			});
			remoteAny.dataReceived(Buffer.from([
				2, 0, 0, 0, 1, 2,	// 1rst message
				3, 0,   // 2nd message half message
			]));
			assert.ok(remoteAny.receivingHeader);
			assert.deepEqual(receivedMessages, [Buffer.from([1, 2])]);
			mockRemote.verify();
		});

		test('Receive 1 full packet plus 1 half (payload)', () => {
			const receivedMessages: Buffer[] = [];
			mockRemote.expects('receivedMsg').once().callsFake((data: Buffer) => {
				receivedMessages.push(data);
			});
			remoteAny.dataReceived(Buffer.from([
				2, 0, 0, 0, 1, 2,	// 1rst message
				3, 0, 0, 0, 11, 12	// 2nd message
			]));
			assert.ok(!remoteAny.receivingHeader);
			assert.deepEqual(receivedMessages, [Buffer.from([1, 2])]);
			mockRemote.verify();
		});

		test('Receive 2 packets in chunks', () => {
			const receivedMessages: Buffer[] = [];
			mockRemote.expects('receivedMsg').twice().callsFake((data: Buffer) => {
				receivedMessages.push(data);
			});
			const sepData = [
				2, 0, 0, 0, 1, 2,	// 1rst message
				3, 0, 0, 0, 11, 12, 13	// 2nd message
			];
			for (const data of sepData) {
				remoteAny.dataReceived(Buffer.from([data]));
			}
			assert.ok(remoteAny.receivingHeader);
			assert.deepEqual(receivedMessages, [Buffer.from([1, 2]), Buffer.from([11, 12, 13])]);
			mockRemote.verify();
		});
	});

	suite('CMD_READ_MEM_BLOCKS', () => {

		/** The simulated memory content of the remote. */
		function memValue(addr64k: number): number {
			return (addr64k * 7 + 3) & 0xFF;
		}

		/** Simulates the remote: decodes the blocks from the command data
		 * and returns the memory content of all blocks.
		 */
		async function fakeReadMemBlocks(_cmd: number, data: number[]): Promise<Buffer> {
			const values: number[] = [];
			for (let i = 4; i < data.length; i += 4) {
				const addr64k = data[i] + 256 * data[i + 1];
				const size = data[i + 2] + 256 * data[i + 3];
				for (let k = 0; k < size; k++)
					values.push(memValue((addr64k + k) & 0xFFFF));
			}
			return Buffer.from(values);
		}

		/** Checks that the blocks contain the simulated memory content. */
		function checkBlocks(blocks: Array<{addr64k: number, size: number}>, result: Uint8Array[]) {
			assert.equal(result.length, blocks.length);
			for (let i = 0; i < blocks.length; i++) {
				const {addr64k, size} = blocks[i];
				assert.equal(result[i].length, size);
				for (let k = 0; k < size; k++)
					assert.equal(result[i][k], memValue((addr64k + k) & 0xFFFF));
			}
		}

		setup(() => {
			WorkspacePaths.setExtensionPath('.');
			const cfg = {
				serialPort: 'some-port',
				timeout: 1000
			};
			remote = new DzrpTransportRemote(cfg);
			remoteAny = remote as any;
		});

		test('one block', async () => {
			const sendDzrpCmd = sinon.stub(remoteAny, 'sendDzrpCmd').resolves(Buffer.from([1, 2, 3]));

			const result = await remoteAny.sendDzrpCmdReadMemBlocks([{addr64k: 0x1234, size: 3}]);

			assert.ok(sendDzrpCmd.calledOnce);
			assert.equal(sendDzrpCmd.firstCall.args[0], DZRP.CMD_READ_MEM_BLOCKS);
			assert.deepEqual(sendDzrpCmd.firstCall.args[1], [
				4, 0, 0, 0,		// Response length: 3 + seq no
				0x34, 0x12, 3, 0
			]);
			assert.equal(result.length, 1);
			assert.deepEqual([...result[0]], [1, 2, 3]);
		});

		test('several blocks: one command', async () => {
			const sendDzrpCmd = sinon.stub(remoteAny, 'sendDzrpCmd').callsFake(fakeReadMemBlocks);
			const blocks = [
				{addr64k: 0x1234, size: 3},
				{addr64k: 0xFFFE, size: 4},	// Wrap around
				{addr64k: 0x8000, size: 0x0102}
			];

			const result = await remoteAny.sendDzrpCmdReadMemBlocks(blocks);

			assert.ok(sendDzrpCmd.calledOnce);
			assert.equal(sendDzrpCmd.firstCall.args[0], DZRP.CMD_READ_MEM_BLOCKS);
			assert.deepEqual(sendDzrpCmd.firstCall.args[1], [
				0x0A, 0x01, 0, 0,	// Response length: 3 + 4 + 0x102 + seq no = 0x10A
				0x34, 0x12, 3, 0,
				0xFE, 0xFF, 4, 0,
				0x00, 0x80, 0x02, 0x01
			]);
			checkBlocks(blocks, result);
		});

		test('blocks do not share the response buffer', async () => {
			const response = Buffer.from([1, 2, 3, 4]);
			sinon.stub(remoteAny, 'sendDzrpCmd').resolves(response);

			const result = await remoteAny.sendDzrpCmdReadMemBlocks([
				{addr64k: 0x1000, size: 2},
				{addr64k: 0x2000, size: 2}
			]);

			response.fill(0);
			assert.deepEqual([...result[0]], [1, 2]);
			assert.deepEqual([...result[1]], [3, 4]);
		});

		test('0x10000 bytes: split into 2 blocks in one command', async () => {
			const sendDzrpCmd = sinon.stub(remoteAny, 'sendDzrpCmd').callsFake(fakeReadMemBlocks);
			const blocks = [{addr64k: 0, size: 0x10000}];

			const result = await remoteAny.sendDzrpCmdReadMemBlocks(blocks);

			assert.ok(sendDzrpCmd.calledOnce);
			assert.deepEqual(sendDzrpCmd.firstCall.args[1], [
				0x01, 0x00, 0x01, 0x00,	// Response length: 0x10000 + seq no
				0x00, 0x00, 0x00, 0x80,
				0x00, 0x80, 0x00, 0x80
			]);
			checkBlocks(blocks, result);
		});

		test('0x10000 bytes at an odd address together with other blocks', async () => {
			const sendDzrpCmd = sinon.stub(remoteAny, 'sendDzrpCmd').callsFake(fakeReadMemBlocks);
			const blocks = [
				{addr64k: 0x0010, size: 2},
				{addr64k: 0x9234, size: 0x10000},	// Wraps around
				{addr64k: 0x0020, size: 1}
			];

			const result = await remoteAny.sendDzrpCmdReadMemBlocks(blocks);

			assert.ok(sendDzrpCmd.calledOnce);
			assert.deepEqual(sendDzrpCmd.firstCall.args[1], [
				0x04, 0x00, 0x01, 0x00,	// Response length: 2 + 0x10000 + 1 + seq no = 0x10004
				0x10, 0x00, 0x02, 0x00,
				0x34, 0x92, 0x00, 0x80,
				0x34, 0x12, 0x00, 0x80,
				0x20, 0x00, 0x01, 0x00
			]);
			checkBlocks(blocks, result);
		});

		test('size too big', async () => {
			const sendDzrpCmd = sinon.stub(remoteAny, 'sendDzrpCmd').callsFake(fakeReadMemBlocks);

			await assert.rejects(remoteAny.sendDzrpCmdReadMemBlocks([{addr64k: 0, size: 0x10001}]), /Size too big/);
			assert.ok(sendDzrpCmd.notCalled);
		});

		test('wrong response size', async () => {
			sinon.stub(remoteAny, 'sendDzrpCmd').resolves(Buffer.from([1, 2]));

			await assert.rejects(remoteAny.sendDzrpCmdReadMemBlocks([
				{addr64k: 0x1000, size: 2},
				{addr64k: 0x2000, size: 1}
			]), /does not match/);
		});
	});
});
