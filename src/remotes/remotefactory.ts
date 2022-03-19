import {Remote, RemoteBase} from './remotebase';
import {ZSimRemote} from './zsimulator/zsimremote';
import {CSpectRemote} from './dzrpbuffer/cspectremote';
import {Utility} from '../misc/utility';
import {ZxNextSocketRemote} from './dzrpbuffer/zxnextsocketremote';
import {ZesaruxRemote} from './zesarux/zesaruxremote';
import {ZxNextSerialRemote} from './dzrpbuffer/zxnextserialremote';
import {Settings} from '../settings';



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
				RemoteFactory.setGlobalRemote(new ZesaruxRemote());
				break;
			case 'cspect':	// CSpect socket
				RemoteFactory.setGlobalRemote(new CSpectRemote());
				break;
			case 'zxnext':	// The ZX Next USB/serial connection
				// Check if socket or usb serial should be used
				if (Settings.launch.zxnext.serial)
					RemoteFactory.setGlobalRemote(new ZxNextSerialRemote());	// TODO:
				else
					RemoteFactory.setGlobalRemote(new ZxNextSocketRemote());
				break;
			case 'zsim':	// Simulator
				RemoteFactory.setGlobalRemote(new ZSimRemote());
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
	protected static setGlobalRemote(remote: RemoteBase) {
		RemoteBase.setGlobalRemote(remote);
	}

	/**
	 * Clears the emulator variable.
	 */
	public static removeRemote() {
		if (Remote)
			Remote.dispose();
	}

}


