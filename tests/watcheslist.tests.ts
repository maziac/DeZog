
import * as assert from 'assert';
import {WatchesList} from '../src/misc/watcheslist';

suite('WatchesList', () => {

	let wl: WatchesList;

	setup(() => {
		wl = new WatchesList();
	});


	test('empty', () => {
		// Checks
		let resp = wl.get('something');
		assert.equal(resp, undefined);
	});

	test('push/get', () => {
		wl.push('a', {val: 1} as any);
		wl.push('b', {val: 2} as any);

		// Checks
		let resp = wl.get('a') as any;
		assert.equal(resp.val, 1);
		resp = wl.get('b') as any;
		assert.equal(resp.val, 2);
		resp = wl.get('c');
		assert.equal(resp, undefined);
	});

	test('clearUnused', () => {
		wl.push('a', {variablesReference: 1} as any);
		wl.push('b', {variablesReference: 2}  as any);
		let removedRefs = wl.clearUnused();
		assert.equal(removedRefs.length, 0);

		// Checks
		let respBody = wl.get('a') as any;
		assert.equal(respBody.variablesReference, 1);

		removedRefs = wl.clearUnused();	// Should remove 'b'
		assert.equal(removedRefs.length, 1);
		assert.equal(removedRefs[0], 2);

		respBody = wl.get('b');
		assert.equal(respBody, undefined);

		// Next call will removed everything
		removedRefs = wl.clearUnused();
		assert.equal(removedRefs.length, 1);

		// Now everything is removed
		removedRefs = wl.clearUnused();
		assert.equal(removedRefs.length, 0);
	});

});
