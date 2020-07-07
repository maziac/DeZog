import { ZesaruxExtRemote } from './zesarux/zesaruxextremote';
import { RemoteBase } from './remotebase';
//import {ZxNextUsbSerialRemote} from './zxnext/zxnextusbserialremote';
import {ZxSimulatorRemote} from './zxsimulator/zxsimremote';
//import {ZxNextSocketRemote} from './zxnext/zxnextsocketremote';
import {CSpectRemote} from './dzrpbuffer/cspectremote';
import {Utility} from '../misc/utility';
import {ZxNextSocketRemote} from './dzrpbuffer/zxnextsocketremote';



/**
 * The factory creates a new remote.
 */
export class RemoteFactory {
	/**
	 * Factory method to create an emulator.
	 * @param remoteType 'zrcp', 'zxnext' or 'zsim'. For 'zrcp' always the ZesaruxExtEmulator is created.
	 * It will fallback to Zesarux if no ZesaruxExt is connected.
	 */
	public static createRemote(remoteType: string) {
		switch (remoteType) {
			case 'zrcp':	// ZEsarUX Remote Control Protocol
				RemoteFactory.setRemote(new ZesaruxExtRemote());
				break;
			case 'cspect':	// CSpect socket
				RemoteFactory.setRemote(new CSpectRemote());
				break;
			case 'zxnext':	// The ZX Next USB/serial connection
				RemoteFactory.setRemote(new ZxNextSocketRemote());
				break;
			case 'zsim':	// Simulator
				RemoteFactory.setRemote(new ZxSimulatorRemote());
				break;
			case 'mame':
				Utility.assert(false);	// needs to be implemented
				break;
			default:
				Utility.assert(false);
				break;
		}
	}


	/**
	 * Sets the emulator variable.
	 */
	protected static setRemote(emulator: RemoteBase) {
		Remote=emulator;
	}

	/**
	 * Clears the emulator variable.
	 */
	public static removeRemote() {
		Remote=undefined as any;
	}

}


export var Remote: RemoteBase;
