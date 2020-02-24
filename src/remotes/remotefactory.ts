
import * as assert from 'assert';
import { ZesaruxExtRemote } from './zesarux/zesaruxextremote';
import { RemoteClass } from './remoteclass';
import {ZxNextUsbSerialRemote} from './zxnext/zxnextusbserialremote';
import {ZxSimulatorRemote} from './zxsimulator/zxsimremote';



/**
 * The factory creates a new remote.
 */
export class RemoteFactory {
	/**
	 * Factory method to create an emulator.
	 * @param remoteType 'zrcp', 'serial' or 'zxsim'. For 'zrcp' always the ZesaruxExtEmulator is created.
	 * It will fallback to Zesarux if no ZesaruxExt is connected.
	 */
	public static createRemote(remoteType: string) {
		switch (remoteType) {
			case 'zrcp':	// ZEsarUX Remote Control Protocol
				RemoteFactory.setEmulator(new ZesaruxExtRemote());
				break;
			case 'serial':	// USB/serial connection
				RemoteFactory.setEmulator(new ZxNextUsbSerialRemote());
				break;
			case 'zxsim':	// Simulator
				RemoteFactory.setEmulator(new ZxSimulatorRemote());
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
