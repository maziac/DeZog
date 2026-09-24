
import * as assert from 'assert';
import {suite, test} from 'mocha';
import {Utility} from '../src/misc/utility';


suite('Utility', () => {

	suite('hjoin', () => {
		test('empty', () => {
			assert.equal(Utility.hjoin([]), '');
		});
		test('1', () => {
			assert.equal(Utility.hjoin(["1"]), '1');
		});
		test('1 or 2', () => {
			assert.equal(Utility.hjoin(["1", "2"], 'x', ' or '), '1 or 2');
		});
		test('1; 2 or 3', () => {
			assert.equal(Utility.hjoin(["1", "2", "3"], '; ', ' or '), '1; 2 or 3');
		});
		test('1; 2; 3 or 4', () => {
			assert.equal(Utility.hjoin(["1", "2", "3", "4"], '; ', ' or '), '1; 2; 3 or 4');
		});
		test('default', () => {
			assert.equal(Utility.hjoin(["1", "2", "3"]), '1, 2 and 3');
		});
	});
});
