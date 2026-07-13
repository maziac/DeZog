import {Trs80Model1Remote} from './trs80model1remote';
import {Trs80Model3Remote} from './trs80model3remote';
import {Trs80GpRemote} from './trs80gpremote';
import {Settings} from '../../settings/settings';
import {LogTransport} from '../../log';

/**
 * Creates the appropriate TRS-80 remote for the configured model.
 *
 * Note: this is a plain factory, NOT a facade. The returned remote is a full
 * DzrpRemote/RemoteBase, so all of DeZog's high-level logic (stepping,
 * breakpoints, call stack, ...) works on it directly. Emulator/mock-server
 * launching is handled inside Trs80GpRemote.doInitialization().
 */
export class Trs80RemoteFactory {
	public static createRemote(): Trs80GpRemote {
		const model = Settings.launch.trs80?.emulator?.model || 1;
		switch (model) {
			case 3:
				LogTransport.log('TRS-80: Using Model 3 implementation');
				return new Trs80Model3Remote();
			case 1:
				LogTransport.log('TRS-80: Using Model 1 implementation');
				return new Trs80Model1Remote();
			default:
				LogTransport.log(`TRS-80: Model ${model} not (yet) supported, defaulting to Model 1`);
				return new Trs80Model1Remote();
		}
	}
}
