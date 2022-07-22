import { Settings } from './../src/settings/settings';
import * as assert from 'assert';
import {MemAttribute} from '../src/disassembler/memory';
import {AnalyzeDisassembler} from './../src/disassembly/analyzedisassembler';


suite('Disassembly (AnalyzeDisassembler)', () => {

	class MockAnalyzeDisassembler extends AnalyzeDisassembler {
		/**
		 * Constructor.
		 * Prefill slot related data.
		 */
		constructor() {
			super();
			this.setSlotBankInfo(0, 0xFFFF, 0, true);
			this.setCurrentSlots([0]);
		}

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

	suite('AnalyzeDisassembler', () => {

		setup(() => {
			const cfgEmpty: any = {
				"disassemblerArgs": {
					"esxdosRst": true
				}
			};
			Settings.launch = Settings.Init(cfgEmpty);
		});

		suite('checkCodeFirst', () => {

			test('set', () => {
				const dis = new MockAnalyzeDisassembler();
				dis.initWithCodeAddresses([1000], [
					{
						address: 1000, data: new Uint8Array([2])
					}]);
				(dis as any).collectLabels(65536);	// Sets CODE_FIRST
				assert.ok(dis.checkCodeFirst([1000]));
			});

			test('unset', () => {
				const dis = new MockAnalyzeDisassembler();
				dis.initWithCodeAddresses([1001], [
					{
						address: 1000, data: new Uint8Array([2])
					}]);
				(dis as any).collectLabels(65536);	// Sets CODE_FIRST
				assert.ok(!dis.checkCodeFirst([1000]));
			});

			test('list', () => {
				const dis = new MockAnalyzeDisassembler();
				dis.initWithCodeAddresses([1000, 1004, 1008], [
					{
						address: 1000, data: new Uint8Array([1, 2, 3, 4, 5,  6, 7, 8, 9, 10, 11, 12])
					}]);
				(dis as any).collectLabels(65536);	// Sets CODE_FIRST
				assert.ok(dis.checkCodeFirst([1000, 1004, 1008]));
			});

			test('list, one not CODE_FIRST', () => {
				const dis = new MockAnalyzeDisassembler();
				dis.initWithCodeAddresses([1000, 1008], [
					{
						address: 1000, data: new Uint8Array([0 /*NOP*/, 0xC9 /*RET*/, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
					}]);
				(dis as any).collectLabels(65536);	// Sets CODE_FIRST
				assert.ok(!dis.checkCodeFirst([1000, 1004, 1008]));
			});
		});
	});
});
