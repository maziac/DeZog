
import * as assert from 'assert';
import {suite, test, setup} from 'mocha';
import { ZesaruxRemote } from '../src/remotes/zesarux/zesaruxremote';
import { Z80RegistersClass } from '../src/remotes/z80registers';
import {Settings} from '../src/settings/settings';


suite('ZesaruxEmulator', () => {

	let emul: any;

	setup(() => {
		const cfg: any={
		};
		const launch = Settings.Init(cfg);
		Z80RegistersClass.Init(launch);
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

