import * as assert from 'assert';
import {DisassemblyClass} from '../src/disassembly/disassembly';

suite('Disassembly', () => {

	suite('DisassemblyClass', () => {

		suite('checkCodeFirst', () => {

			test('set', () => {
				const dis = new DisassemblyClass();
				dis.initWithCodeAdresses([1000], [
					{
						address: 1000, data: new Uint8Array([2])
					}]);
				(dis as any).collectLabels();	// Sets CODE_FIRST
				assert.ok(dis.checkCodeFirst([1000]));
			});

			test('unset', () => {
				const dis = new DisassemblyClass();
				dis.initWithCodeAdresses([1001], [
					{
						address: 1000, data: new Uint8Array([2])
					}]);
				(dis as any).collectLabels();	// Sets CODE_FIRST
				assert.ok(!dis.checkCodeFirst([1000]));
			});

			test('list', () => {
				const dis = new DisassemblyClass();
				dis.initWithCodeAdresses([1000, 1004, 1008], [
					{
						address: 1000, data: new Uint8Array([1, 2, 3, 4, 5,  6, 7, 8, 9, 10, 11, 12])
					}]);
				(dis as any).collectLabels();	// Sets CODE_FIRST
				assert.ok(dis.checkCodeFirst([1000, 1004, 1008]));
			});

			test('list, one not CODE_FIRST', () => {
				const dis = new DisassemblyClass();
				dis.initWithCodeAdresses([1000, 1008], [
					{
						address: 1000, data: new Uint8Array([0 /*NOP*/, 0xC9 /*RET*/, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
					}]);
				(dis as any).collectLabels();	// Sets CODE_FIRST
				assert.ok(!dis.checkCodeFirst([1000, 1004, 1008]));
			});
		});
	});

});

