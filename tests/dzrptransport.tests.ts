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

	suite('CMD_READ_MEM', () => {

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

			const result = await remoteAny.sendDzrpCmdReadMem([{addr64k: 0x1234, size: 3}]);

			assert.ok(sendDzrpCmd.calledOnce);
			assert.equal(sendDzrpCmd.firstCall.args[0], DZRP.CMD_READ_MEM);
			assert.deepEqual(sendDzrpCmd.firstCall.args[1], [0, 0x34, 0x12, 3, 0]);
			assert.equal(result.length, 1);
			assert.deepEqual([...result[0]], [1, 2, 3]);
		});

		test('several blocks: one command per block (workaround)', async () => {
			// Returns 'size' bytes with the low byte of the address
			const sendDzrpCmd = sinon.stub(remoteAny, 'sendDzrpCmd').callsFake(async (_cmd: number, data: number[]) => Buffer.alloc(data[3] + 256 * data[4], data[1]));

			const result = await remoteAny.sendDzrpCmdReadMem([
				{addr64k: 0x1234, size: 3},
				{addr64k: 0xFFFE, size: 4}
			]);

			assert.equal(sendDzrpCmd.callCount, 2);
			assert.equal(sendDzrpCmd.firstCall.args[0], DZRP.CMD_READ_MEM);
			assert.deepEqual(sendDzrpCmd.firstCall.args[1], [0, 0x34, 0x12, 3, 0]);
			assert.equal(sendDzrpCmd.secondCall.args[0], DZRP.CMD_READ_MEM);
			assert.deepEqual(sendDzrpCmd.secondCall.args[1], [0, 0xFE, 0xFF, 4, 0]);
			assert.equal(result.length, 2);
			assert.deepEqual([...result[0]], [0x34, 0x34, 0x34]);
			assert.deepEqual([...result[1]], [0xFE, 0xFE, 0xFE, 0xFE]);
		});

		test('0x10000 bytes: 2 commands', async () => {
			const sendDzrpCmd = sinon.stub(remoteAny, 'sendDzrpCmd').callsFake(async (_cmd: number, data: number[]) => Buffer.alloc(0x8000, data[2]));

			const result = await remoteAny.sendDzrpCmdReadMem([{addr64k: 0, size: 0x10000}]);

			assert.equal(sendDzrpCmd.callCount, 2);
			assert.deepEqual(sendDzrpCmd.firstCall.args[1], [0, 0, 0, 0, 0x80]);
			assert.deepEqual(sendDzrpCmd.secondCall.args[1], [0, 0, 0x80, 0, 0x80]);
			assert.equal(result.length, 1);
			assert.equal(result[0].length, 0x10000);
			assert.equal(result[0][0x7FFF], 0);
			assert.equal(result[0][0x8000], 0x80);
		});
	});
});
