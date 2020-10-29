
import * as assert from 'assert';
import {CodeCoverageArray} from '../remotes/zsimulator/codecovarray';

suite('CodeCoverageArray', () => {

	test('no data', () => {
		const cov=new CodeCoverageArray();
		const addrs=cov.getAddresses();
		assert.equal(0, addrs.size);
	});

	test('one address', () => {
		const cov=new CodeCoverageArray();
		cov.storeAddress(0x0005);
		let addrs=cov.getAddresses();
		assert.equal(1, addrs.size);
		assert.ok(addrs.has(0x0005));

		cov.clearAll();
		addrs=cov.getAddresses();
		assert.equal(0, addrs.size);

		cov.storeAddress(0x0005);
		addrs=cov.getAddresses();
		assert.equal(1, addrs.size);
		assert.ok(addrs.has(0x0005));
	});

	test('max/min address', () => {
		const cov=new CodeCoverageArray();
		cov.storeAddress(0x0000);
		cov.storeAddress(0xFFFF);
		let addrs=cov.getAddresses();
		assert.equal(2, addrs.size);
		assert.ok(addrs.has(0x0000));
		assert.ok(addrs.has(0xFFFF));

		cov.clearAll();
		addrs=cov.getAddresses();
		assert.equal(0, addrs.size);
	});

	test('address range > 8', () => {
		const cov=new CodeCoverageArray();
		cov.storeAddress(0x122F);
		cov.storeAddress(0x1230);
		cov.storeAddress(0x1231);
		cov.storeAddress(0x1232);
		cov.storeAddress(0x1233);
		cov.storeAddress(0x1234);
		cov.storeAddress(0x1235);
		cov.storeAddress(0x1236);
		cov.storeAddress(0x1237);
		cov.storeAddress(0x1238);
		cov.storeAddress(0x1239);
		let addrs=cov.getAddresses();
		assert.equal(11, addrs.size);
		assert.ok(addrs.has(0x122F));
		assert.ok(addrs.has(0x1230));
		assert.ok(addrs.has(0x1231));
		assert.ok(addrs.has(0x1230));
		assert.ok(addrs.has(0x1233));
		assert.ok(addrs.has(0x1234));
		assert.ok(addrs.has(0x1235));
		assert.ok(addrs.has(0x1236));
		assert.ok(addrs.has(0x1237));
		assert.ok(addrs.has(0x1238));
		assert.ok(addrs.has(0x1239));
	});

	test('same address', () => {
		const cov=new CodeCoverageArray();
		cov.storeAddress(0x1230);
		cov.storeAddress(0x1230);
		cov.storeAddress(0x1232);
		cov.storeAddress(0x1232);
		cov.storeAddress(0x1234);
		cov.storeAddress(0x1230);
		cov.storeAddress(0x1232);
		let addrs=cov.getAddresses();
		assert.equal(3, addrs.size);
		assert.ok(addrs.has(0x1230));
		assert.ok(addrs.has(0x1232));
		assert.ok(addrs.has(0x1234));
	});

	test('all address', () => {
		const cov=new CodeCoverageArray();
		for (let rep=0; rep<3; rep++) {
			for (let addr=0; addr<0x10000; addr++) {
				cov.storeAddress(addr);
			}
		}

		const addrs=cov.getAddresses();
		assert.equal(0x10000, addrs.size);
		for (let addr=0; addr<0x10000; addr++) {
			assert.ok(addrs.has(addr));
		}
	});

});

