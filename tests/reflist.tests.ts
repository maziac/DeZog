
import * as assert from 'assert';
import {RefList} from '../src/misc/reflist';

suite('RefList', () => {

	let refs: RefList<Object>;

	setup(() => {
		refs = new RefList<Object>();
	});


	test('no ref', () => {
		// Checks
		let obj = refs.getObject(1);
		assert.equal(obj, undefined);
		const origObj = new Object();
		const r = refs.addObject(origObj);
		obj = refs.getObject(r+1);
		assert.equal(obj, undefined);
	});

	test('1 var', () => {
		const origObj = new Object();
		const r = refs.addObject(origObj);
		assert.equal(r, 1);
		// Checks
		let obj = refs.getObject(r);
		assert.equal(obj, origObj);
		obj = refs.getObject(r - 1);
		assert.equal(obj, undefined);
		obj = refs.getObject(r + 1);
		assert.equal(obj, undefined);
	});

	test('2 vars', () => {
		const origObj1 = new Object();
		const r1 = refs.addObject(origObj1);
		const origObj2 = new Object();
		const r2 = refs.addObject(origObj2);
		// Checks
		let obj = refs.getObject(r1);
		assert.equal(obj, origObj1);
		obj = refs.getObject(r2);
		assert.equal(obj, origObj2);
	});

	test('clear', () => {
		const origObj1 = new Object();
		const r1 = refs.addObject(origObj1);
		assert.equal(r1, 1);

		const origObj2 = new Object();
		const r2 = refs.addObject(origObj2);
		assert.equal(r2, 2);

		refs.clear();

		const origObj3 = new Object();
		const r3 = refs.addObject(origObj3);
		assert.equal(r3, 1);
	});
});
