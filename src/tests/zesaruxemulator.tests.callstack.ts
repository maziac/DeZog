
import * as assert from 'assert';
import { ZesaruxEmulator } from '../zesaruxemulator';
import { Z80Registers } from '../z80Registers';


suite('ZesaruxEmulator', () => {

	let emul: any;

	setup(() => {
		Z80Registers.init();
	});

/*
	teardown( () => dc.disconnect() );
*/

	suite('ZesaruxCallStack', () => {
		setup(() => {
			emul = new ZesaruxEmulator();
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

