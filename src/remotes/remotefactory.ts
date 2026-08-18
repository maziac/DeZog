import {Remote, RemoteBase} from './remotebase';
import {ZSimRemote} from './zsimulator/zsimremote';
import {CSpectRemote} from './dzrpbuffer/cspectremote';
import {Utility} from '../misc/utility';
import {ZesaruxRemote} from './zesarux/zesaruxremote';
import {ZxNextSerialRemote} from './dzrpbuffer/zxnextserialremote';
import {ZxNextSocketRemote} from './dzrpbuffer/zxnextsocketremote';
import {MameGdbRemote} from './mame/mamegdbremote';
import {Settings, SettingsParameters} from '../settings/settings';
import {DzrpGenericSocketRemote, DzrpGenericSerialRemote} from './dzrpbuffer/dzrpgenericremote';



/**
 * The factory creates a new remote.
 */
export class RemoteFactory {
	/**
	 * Factory method to create an emulator.
	 * @param remoteType 'zrcp', 'cspect', 'zxnext' or 'zsim'.
	 */
	public static createRemote(launch: SettingsParameters) {
		let remote: RemoteBase;
		switch (launch.remoteType) {
			case 'zrcp':	// ZEsarUX Remote Control Protocol
				remote = new ZesaruxRemote();
				break;
			case 'cspect':	// CSpect socket
				remote = new CSpectRemote(launch.cspect);
				break;
			case 'zxnext':	// The ZX Next. USB/serial or socket connection.
				// 'serial' selects the serial connection, otherwise a socket is used.
				if (Settings.launch.zxnext.serial === undefined)
					remote = new ZxNextSocketRemote(launch.zxnext);
				else
					remote = new ZxNextSerialRemote(launch.zxnext);
				break;
			case 'zsim':	// Simulator
				remote = new ZSimRemote(launch);
				break;
			case 'mame':
				remote = new MameGdbRemote();
				break;
			case 'dzrp':	// Generic dzrp. USB/serial or socket connection.
				// 'serial' selects the serial connection, otherwise a socket is used.
				if (Settings.launch.zxnext.serial === undefined)
					remote = new DzrpGenericSocketRemote(launch.dzrp);
				else
					remote = new DzrpGenericSerialRemote(launch.dzrp);
				break;
			default:
				Utility.assert(false);
		}
		RemoteFactory.setGlobalRemote(remote!);
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


