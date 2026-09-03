import * as assert from 'assert';
import {suite, test, setup} from 'mocha';
import {Settings} from '../src/settings/settings';
import {Utility} from '../src/misc/utility';
import {ZxNextSerialRemote} from '../src/remotes/dzrptransport/zxnextserialremote';



suite('ZxNextSerialRemote', () => {
	let znext: ZxNextSerialRemote;
	let znextAny: any; // Same as any

	suite('findMessageStart', () => {

		setup(() => {
			Utility.setExtensionPath('.');
			const cfg: any = {
				remoteType: 'zxnext',
				zxnext: {
					serialPort: 'some-port'
				},
			};
			const launch = Settings.Init(cfg);
			Settings.launch = launch;
			znext = new ZxNextSerialRemote(launch.zxnext);
			znextAny = znext as any;
		});

		test('Empty packet', () => {
			const dataIn = Buffer.from([]);
			const result = znextAny.findMessageStart(dataIn);
			assert.deepEqual(result, Buffer.from([]));
		});

		test('Just one 0xA5', () => {
			const dataIn = Buffer.from([0xA5]);
			const result = znextAny.findMessageStart(dataIn);
			assert.deepEqual(result, Buffer.from([]));
		});

		test('Many 0xA5', () => {
			const dataIn = Buffer.from([0xA5, 0xA5, 0xA5]);
			const result = znextAny.findMessageStart(dataIn);
			assert.deepEqual(result, Buffer.from([0xA5, 0xA5]));
		});

		test('0xA5 not the first', () => {
			const dataIn = Buffer.from([0, 1, 2, 0xA5, 0xA5, 0xA5]);
			const result = znextAny.findMessageStart(dataIn);
			assert.deepEqual(result, Buffer.from([0xA5, 0xA5]));
		});

		test('Just one 0xA5 followed by data', () => {
			{
				const dataIn = Buffer.from([0xA5, 0]);
				const result = znextAny.findMessageStart(dataIn);
				assert.deepEqual(result, Buffer.from([0]));
			}
			{
				const dataIn = Buffer.from([0xA5, 0, 0, 0, 0]);
				const result = znextAny.findMessageStart(dataIn);
				assert.deepEqual(result, Buffer.from([0, 0, 0, 0]));
			}
		});

		test('Many 0xA5 followed by data', () => {
			{
				const dataIn = Buffer.from([0xA5, 0xA5, 0xA5, 0,]);
				const result = znextAny.findMessageStart(dataIn);
				assert.deepEqual(result, Buffer.from([0xA5, 0xA5, 0]));
			}
			{
				const dataIn = Buffer.from([0xA5, 0xA5, 0xA5, 0, 0, 0, 0]);
				const result = znextAny.findMessageStart(dataIn);
				assert.deepEqual(result, Buffer.from([0xA5, 0xA5, 0, 0, 0, 0]));
			}
		});


	});
});

