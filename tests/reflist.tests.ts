
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

	test('2 vars, startIndex', () => {
		const rs = new RefList<Object>(10);
		const origObj1 = new Object();
		const r1 = rs.addObject(origObj1);
		assert.equal(r1, 11);
		const origObj2 = new Object();
		const r2 = rs.addObject(origObj2);
		assert.equal(r2, 12);
		// Checks
		let obj = rs.getObject(r1);
		assert.equal(obj, origObj1);
		obj = rs.getObject(r2);
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

	test('remove', () => {
		const rs = new RefList<Object>(10);
		const r1 = rs.addObject(new Object());
		const r2 = rs.addObject(new Object());
		const r3 = rs.addObject(new Object());
		assert.equal(rs.length, 3);

		// Pre-checks
		let obj = rs.getObject(r1);
		assert.notEqual(obj, undefined);
		obj = rs.getObject(r2);
		assert.notEqual(obj, undefined);
		obj = rs.getObject(r3);
		assert.notEqual(obj, undefined);
		obj = rs.getObject(r3 + 1);
		assert.equal(obj, undefined);

		// Remove-checks
		rs.removeObjects([r1, r3]);
		obj = rs.getObject(r1);
		assert.equal(obj, undefined);
		obj = rs.getObject(r2);
		assert.notEqual(obj, undefined);
		obj = rs.getObject(r3);
		assert.equal(obj, undefined);
		obj = rs.getObject(r3 + 1);
		assert.equal(obj, undefined);
		assert.equal(rs.length, 3);	// White box test, length is unchanged.

		// Last removal
		rs.removeObjects([r2]);
		obj = rs.getObject(r1);
		assert.equal(obj, undefined);
		obj = rs.getObject(r2);
		assert.equal(obj, undefined);
		obj = rs.getObject(r3);
		assert.equal(obj, undefined);
		obj = rs.getObject(r3 + 1);
		assert.equal(obj, undefined);
		assert.equal(rs.length, 3);	// White box test, length is unchanged.

		// Remove already removed item
		rs.removeObjects([r3]);	// Should not crash
	});

	test('remove and addObject', () => {
		const rs = new RefList<Object>(10);
		const r1 = rs.addObject(new Object());
		/*const r2 = */ rs.addObject(new Object());
		const r3 = rs.addObject(new Object());
		assert.equal(rs.length, 3);

		// Remove
		rs.removeObjects([r1, r3]);

		// Re-use (white box test)
		const r1b = rs.addObject(new Object());
		const r3b = rs.addObject(new Object());
		const r4 = rs.addObject(new Object());
		assert.equal(r1, r1b);
		assert.equal(r3, r3b);
		assert.ok(r4 > r3);
	});

});
