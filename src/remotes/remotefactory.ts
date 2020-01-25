
import * as assert from 'assert';
import { ZesaruxExtRemote } from './zesarux/zesaruxextremote';
import { ZxNextRemote } from './zxnext/zxnextremote';
import { RemoteClass } from './remote';



/**
 * The factory creates a new remote.
 */
export class RemoteFactory {
	/**
	 * Factory method to create an emulator.
	 * @param remoteType 'zesarux' or 'zxnext'. For 'zesarux' always the ZesaruxExtEmulator is created.
	 * It will fallback to Zesarux if no ZesaruxExt is connected.
	 */
	public static createRemote(remoteType: string) {
		switch (remoteType) {
			case 'zesarux':
				RemoteFactory.setEmulator(new ZesaruxExtRemote());
				break;
			case 'zxnext':
				RemoteFactory.setEmulator(new ZxNextRemote());
				break;
			case 'mame':
				assert(false);	// needs to be implemented
				break;
			default:
				assert(false);
				break;
		}
	}


	/**
	 * Sets the emulator variable.
	 */
	protected static setEmulator(emulator: RemoteClass) {
		Remote = emulator;
	}

}


export var Remote: RemoteClass;
