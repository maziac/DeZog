import {RemoteBase} from './remotebase';
import {ZSimRemote} from './zsimulator/zsimremote';
import {CSpectRemote} from './dzrpbuffer/cspectremote';
import {Utility} from '../misc/utility';
import {ZxNextSocketRemote} from './dzrpbuffer/zxnextsocketremote';
import {ZesaruxRemote} from './zesarux/zesaruxremote';



/**
 * The factory creates a new remote.
 */
export class RemoteFactory {
	/**
	 * Factory method to create an emulator.
	 * @param remoteType 'zrcp', 'cspect', 'zxnext' or 'zsim'.
	 */
	public static createRemote(remoteType: string) {
		switch (remoteType) {
			case 'zrcp':	// ZEsarUX Remote Control Protocol
				RemoteFactory.setRemote(new ZesaruxRemote());
				break;
			case 'cspect':	// CSpect socket
				RemoteFactory.setRemote(new CSpectRemote());
				break;
			case 'zxnext':	// The ZX Next USB/serial connection
				RemoteFactory.setRemote(new ZxNextSocketRemote());
				break;
			case 'zsim':	// Simulator
				RemoteFactory.setRemote(new ZSimRemote());
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
		Remote = emulator;
	}

	/**
	 * Clears the emulator variable.
	 */
	public static removeRemote() {
		Remote = undefined as any;
	}

}


export let Remote: RemoteBase;
