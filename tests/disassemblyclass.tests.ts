import { MemAttribute } from './../src/disassembler/memory';
import * as assert from 'assert';
import {DisassemblyClass} from '../src/disassembly/disassembly';

// TODO: When separation between AnalyzeDisassembler and DisassemblyClass is clarified then move testcases to related classes.
suite('Disassembly (DisassemblyClass)', () => {

	class MockDisassemblyClass extends DisassemblyClass {
		/**
		 * Checks that all addresses have attribute CODE_FIRST.
		 * @param addresses A list of addresses.
		 * @returns true if all addresses are of attribute CODE_FIRST.
		 */
		public checkCodeFirst(addresses: number[]) {
			for (const addr of addresses) {
				const memAttr = this.memory.getAttributeAt(addr & 0xFFFF);
				if (!(memAttr & MemAttribute.CODE_FIRST))
					return false;
			}
			// All are addresses have attribute CODE_FIRST.
			return true;
		}
	}

	suite('DisassemblyClass', () => {

		suite('checkCodeFirst', () => {

			test('set', () => {
				const dis = new MockDisassemblyClass();
				dis.initWithCodeAddresses([1000], [
					{
						address: 1000, data: new Uint8Array([2])
					}]);
				(dis as any).collectLabels();	// Sets CODE_FIRST
				assert.ok(dis.checkCodeFirst([1000]));
			});

			test('unset', () => {
				const dis = new MockDisassemblyClass();
				dis.initWithCodeAddresses([1001], [
					{
						address: 1000, data: new Uint8Array([2])
					}]);
				(dis as any).collectLabels();	// Sets CODE_FIRST
				assert.ok(!dis.checkCodeFirst([1000]));
			});

			test('list', () => {
				const dis = new MockDisassemblyClass();
				dis.initWithCodeAddresses([1000, 1004, 1008], [
					{
						address: 1000, data: new Uint8Array([1, 2, 3, 4, 5,  6, 7, 8, 9, 10, 11, 12])
					}]);
				(dis as any).collectLabels();	// Sets CODE_FIRST
				assert.ok(dis.checkCodeFirst([1000, 1004, 1008]));
			});

			test('list, one not CODE_FIRST', () => {
				const dis = new MockDisassemblyClass();
				dis.initWithCodeAddresses([1000, 1008], [
					{
						address: 1000, data: new Uint8Array([0 /*NOP*/, 0xC9 /*RET*/, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
					}]);
				(dis as any).collectLabels();	// Sets CODE_FIRST
				assert.ok(!dis.checkCodeFirst([1000, 1004, 1008]));
			});
		});
	});
});

