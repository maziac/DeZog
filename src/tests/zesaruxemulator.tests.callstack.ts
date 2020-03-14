
import * as assert from 'assert';
import { ZesaruxRemote } from '../remotes/zesarux/zesaruxremote';
import { Z80RegistersClass } from '../remotes/z80registers';


suite('ZesaruxEmulator', () => {

	let emul: any;

	setup(() => {
		Z80RegistersClass.Init();
	});


	suite('ZesaruxCallStack', () => {
		setup(() => {
			emul = new ZesaruxRemote();
		});

		test('getInterruptName', () => {
			const name = emul.getInterruptName();
			assert.equal("__INTERRUPT__", name);
		});

		test('getMainName', () => {
			emul.topOfStack = 100;
			let name = emul.getMainName(100);
			assert.equal("__MAIN__", name);

			name = emul.getMainName(102);
			assert.equal("__MAIN-2__", name);

			name = emul.getMainName(98);
			assert.equal("__MAIN+2__", name);

			emul.topOfStack = undefined;
			name = emul.getMainName(102);
			assert.equal("__MAIN__", name);
		});
	});
});

