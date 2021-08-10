
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
		wl.push('a', {val: 1} as any);
		wl.push('b', {val: 2} as any);
		wl.clearUnused();

		// Checks
		let resp = wl.get('a') as any;
		assert.equal(resp.val, 1);

		wl.clearUnused();	// Should remove 'b'

		resp = wl.get('b');
		assert.equal(resp, undefined);
	});

});
