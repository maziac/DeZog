
import * as assert from 'assert';
import {ExpressionsList} from '../src/misc/watcheslist';

suite('WatchesList', () => {

	let wl: ExpressionsList;

	setup(() => {
		wl = new ExpressionsList();
	});


	test('empty', async () => {
		// Checks
		let resp = await wl.get('something');
		assert.equal(resp, undefined);
	});

	test('push/get', async () => {
		wl.push('a', {val: 1} as any);
		wl.push('b', {val: 2} as any);

		// Checks
		let resp = await wl.get('a') as any;
		assert.equal(resp.val, 1);
		resp = await wl.get('b') as any;
		assert.equal(resp.val, 2);
		resp = await wl.get('c');
		assert.equal(resp, undefined);
	});

});
