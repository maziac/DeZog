import * as assert from 'assert';
import * as sinon from 'sinon';
import {suite, test, setup} from 'mocha';
import {WorkspacePaths} from '../src/misc/workspacepaths';
import {DzrpTransportRemote} from '../src/remotes/dzrptransport/dzrptransportremote';



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
});

