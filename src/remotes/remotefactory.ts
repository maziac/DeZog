import {Remote, RemoteBase} from './remotebase';
import {ZSimRemote} from './zsimulator/zsimremote';
import {CSpectRemote} from './dzrpbuffer/cspectremote';
import {Utility} from '../misc/utility';
import {ZesaruxRemote} from './zesarux/zesaruxremote';
import {ZxNextSerialRemote} from './dzrpbuffer/zxnextserialremote';
import {MameGdbRemote} from './mame/mamegdbremote';
import {Trs80Remote} from './trs80/trs80remote';
import {Settings} from '../settings/settings';



/**
 * The factory creates a new remote.
 */
export class RemoteFactory {
	/**
	 * Factory method to create an emulator.
	 * @param remoteType 'zrcp', 'cspect', 'zxnext', 'zsim', 'mame', or 'trs80gp'.
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
				RemoteFactory.setGlobalRemote(new ZxNextSerialRemote());
				break;
			case 'zsim':	// Simulator
				RemoteFactory.setGlobalRemote(new ZSimRemote(Settings.launch));
				break;
			case 'mame':
				RemoteFactory.setGlobalRemote(new MameGdbRemote());
				break;
			case 'trs80gp':	// trs80gp emulator (supports multiple TRS-80 models)
				RemoteFactory.setGlobalRemote(new Trs80Remote());
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


