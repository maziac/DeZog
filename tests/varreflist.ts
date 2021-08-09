
import * as assert from 'assert';
import {VarRefList} from '../src/misc/varreflist';

suite('VarRefList', () => {

	let refs: VarRefList<Object>;

	setup(() => {
		refs = new VarRefList<Object>();
	});


	test('no ref (tmp)', () => {
		// Checks
		let obj = refs.getObject(1);
		assert.equal(obj, undefined);
		const origObj = new Object();
		const r = refs.addTmpObject(origObj);
		assert.ok(r > 1);
		obj = refs.getObject(r + 1);
		assert.equal(obj, undefined);
	});

	test('1 tmp var', () => {
		const origObj = new Object();
		const r = refs.addTmpObject(origObj);
		// Checks
		let obj = refs.getObject(r);
		assert.equal(obj, origObj);
		obj = refs.getObject(r - 1);
		assert.equal(obj, undefined);
		obj = refs.getObject(r + 1);
		assert.equal(obj, undefined);
	});

	test('2 tmp vars', () => {
		const origObj1 = new Object();
		const r1 = refs.addTmpObject(origObj1);
		const origObj2 = new Object();
		const r2 = refs.addTmpObject(origObj2);
		// Checks
		let obj = refs.getObject(r1);
		assert.equal(obj, origObj1);
		obj = refs.getObject(r2);
		assert.equal(obj, origObj2);
	});

	test('clearTemporary', () => {
		const tmpObj1 = new Object();
		const r1 = refs.addTmpObject(tmpObj1);
		assert.notEqual(r1, 0);

		const origObj2 = new Object();
		const r2 = refs.addObject(origObj2);
		assert.equal(r2, 1);
		assert.ok(r2 < r1);

		refs.clearTemporary();

		// Tmp object gone
		let obj = refs.getObject(r1);
		assert.equal(obj, undefined);

		// Persistent obj remains
		obj = refs.getObject(r2);
		assert.equal(obj, origObj2);

		// Create new temporary
		const tmpObj1b = new Object();
		const r1b = refs.addTmpObject(tmpObj1b);
		assert.equal(r1b, r1);
	});

	test('clear', () => {
		const tmpObj1 = new Object();
		const r1 = refs.addTmpObject(tmpObj1);
		assert.notEqual(r1, 0);

		const origObj2 = new Object();
		const r2 = refs.addObject(origObj2);
		assert.equal(r2, 1);
		assert.ok(r2 < r1);

		refs.clear();

		// Tmp object gone
		let obj = refs.getObject(r1);
		assert.equal(obj, undefined);

		// Persistent obj gone
		obj = refs.getObject(r2);
		assert.equal(obj, undefined);

		// Create new temporary
		const tmpObj1b = new Object();
		const r1b = refs.addTmpObject(tmpObj1b);
		assert.equal(r1b, r1);

		// Create new persistent
		const origObj2b = new Object();
		const r2b = refs.addObject(origObj2b);
		assert.equal(r2b, r2);
	});

});
