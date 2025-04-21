import * as assert from 'assert';
import {suite, test, setup} from 'mocha';
import {DisassemblyClass} from '../../src/disassembler/disassembly';
import { Settings } from '../../src/settings/settings';


suite('Disassembly - DisassemblyClass', () => {

	suite('DisassemblyClass', () => {

		setup(() => {
			const cfgEmpty: any = {
				"disassemblerArgs": {
				}
			};
			Settings.launch = Settings.Init(cfgEmpty);
		});

		test('slotsChanged', () => {
			const dis = new DisassemblyClass() as any;

			assert.ok(dis.slotsChanged([1]));

			dis.setCurrentSlots([1]);
			assert.ok(!dis.slotsChanged([1]));

			assert.ok(dis.slotsChanged([1, 2]));
			dis.setCurrentSlots([1, 2]);
			assert.ok(!dis.slotsChanged([1, 2]));

			assert.ok(dis.slotsChanged([1, 3]));
			assert.ok(dis.slotsChanged([3, 1]));
		});
	});
});

