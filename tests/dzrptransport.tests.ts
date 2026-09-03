import * as assert from 'assert';
import * as sinon from 'sinon';
import {suite, test, setup, teardown} from 'mocha';
import {Utility} from '../src/misc/utility';
import {DzrpTransportRemote} from '../src/remotes/dzrptransport/dzrptransportremote';



suite('DzrpTransportRemote', () => {
	let dzrp: DzrpTransportRemote;
	let mockDzrp: sinon.SinonMock;
	let dzrpAny: any; // Same as any

	suite('dataReceived', () => {

		setup(() => {
			Utility.setExtensionPath('.');
			const cfg = {
				serialPort: 'some-port',
				timeout: 1000
			};
			dzrp = new DzrpTransportRemote(cfg);
			mockDzrp = sinon.mock(dzrp);
			dzrpAny = dzrp as any;
			dzrpAny.receivedData = Buffer.alloc(0);
			dzrpAny.expectedLength = 4;
			dzrpAny.receivingHeader = true;
			sinon.stub(dzrpAny, 'startChunkTimeout').returns(undefined);;
			sinon.stub(dzrpAny, 'stopChunkTimeout').returns(undefined);

		});

		teardown(() => {
			//sinon.restore();
		});

		test('Empty packet', () => {
			mockDzrp.expects('dataReceived').once();
			mockDzrp.expects('receivedMsg').never();
			dzrpAny.dataReceived(Buffer.from([]));
			assert.ok(dzrpAny.receivingHeader);
			mockDzrp.verify();
		});

		test('Add data up to header', () => {
			mockDzrp.expects('receivedMsg').never();
			dzrpAny.dataReceived(Buffer.from([1]));
			assert.ok(dzrpAny.receivingHeader);
			dzrpAny.dataReceived(Buffer.from([2]));
			assert.ok(dzrpAny.receivingHeader);
			dzrpAny.dataReceived(Buffer.from([3]));
			assert.ok(dzrpAny.receivingHeader);
			dzrpAny.dataReceived(Buffer.from([4]));
			assert.ok(!dzrpAny.receivingHeader);
			mockDzrp.verify();
		});

		test('Receive full packet', () => {
			mockDzrp.expects('receivedMsg').once();
			dzrpAny.dataReceived(Buffer.from([10, 0, 0, 0, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19]));
			assert.ok(dzrpAny.receivingHeader);
			mockDzrp.verify();
		});

		test('Receive full packet in chunks', () => {
			const receivedMessages: Buffer[] = [];
			mockDzrp.expects('receivedMsg').once().callsFake((data: Buffer) => {
				receivedMessages.push(data);
			});
			const sepData = [10, 0, 0, 0, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
			for (const data of sepData) {
				dzrpAny.dataReceived(Buffer.from([data]));
			}
			assert.ok(dzrpAny.receivingHeader);
			assert.deepEqual(receivedMessages, [Buffer.from([10, 11, 12, 13, 14, 15, 16, 17, 18, 19])]);
			mockDzrp.verify();
		});

		test('Receive 2 packets at once', () => {
			const receivedMessages: Buffer[] = [];
			mockDzrp.expects('receivedMsg').twice().callsFake((data: Buffer) => {
				receivedMessages.push(data);
			});
			dzrpAny.dataReceived(Buffer.from([
				2, 0, 0, 0, 1, 2,	// 1rst message
				3, 0, 0, 0, 11, 12, 13	// 2nd message
			]));
			assert.ok(dzrpAny.receivingHeader);
			assert.deepEqual(receivedMessages, [Buffer.from([1, 2]), Buffer.from([11, 12, 13])]);
			mockDzrp.verify();
		});

		test('Receive 1 full packet plus 1 half (header)', () => {
			const receivedMessages: Buffer[] = [];
			mockDzrp.expects('receivedMsg').once().callsFake((data: Buffer) => {
				receivedMessages.push(data);
			});
			dzrpAny.dataReceived(Buffer.from([
				2, 0, 0, 0, 1, 2,	// 1rst message
				3, 0,   // 2nd message half message
			]));
			assert.ok(dzrpAny.receivingHeader);
			assert.deepEqual(receivedMessages, [Buffer.from([1, 2])]);
			mockDzrp.verify();
		});

		test('Receive 1 full packet plus 1 half (payload)', () => {
			const receivedMessages: Buffer[] = [];
			mockDzrp.expects('receivedMsg').once().callsFake((data: Buffer) => {
				receivedMessages.push(data);
			});
			dzrpAny.dataReceived(Buffer.from([
				2, 0, 0, 0, 1, 2,	// 1rst message
				3, 0, 0, 0, 11, 12	// 2nd message
			]));
			assert.ok(!dzrpAny.receivingHeader);
			assert.deepEqual(receivedMessages, [Buffer.from([1, 2])]);
			mockDzrp.verify();
		});

		test('Receive 2 packets in chunks', () => {
			const receivedMessages: Buffer[] = [];
			mockDzrp.expects('receivedMsg').twice().callsFake((data: Buffer) => {
				receivedMessages.push(data);
			});
			const sepData = [
				2, 0, 0, 0, 1, 2,	// 1rst message
				3, 0, 0, 0, 11, 12, 13	// 2nd message
			];
			for (const data of sepData) {
				dzrpAny.dataReceived(Buffer.from([data]));
			}
			assert.ok(dzrpAny.receivingHeader);
			assert.deepEqual(receivedMessages, [Buffer.from([1, 2]), Buffer.from([11, 12, 13])]);
			mockDzrp.verify();
		});
	});
});

