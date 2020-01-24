
import * as assert from 'assert';
import { ZesaruxEmulator } from './zesarux/zesaruxemulator';
import { ZesaruxExtEmulator } from './zesarux/zesaruxextemulator';
import { RemoteClass } from './remote';


/// Different machine emulators.
export enum EmulatorType {
	UNKNOWN = 0,
	ZESARUX,		/// ZEsarUX
	ZESARUX_EXT,	/// ZEsarUX with own extensions (e.g. fast breakpoints)
	ZXNEXT,			/// ZXNEXT HW connected via UART
	MAME,			/// MAME
}

/**
 * The factory creates a new remote.
 */
export class RemoteFactory {
	/**
	 * Factory method to create an emulator.
	 */
	public static createEmulator(emul: EmulatorType) {
		switch(emul) {
			case EmulatorType.ZESARUX:
				RemoteFactory.setEmulator(new ZesaruxEmulator());
				break;
			case EmulatorType.ZESARUX_EXT:	// Zesarux with own extensions.
				RemoteFactory.setEmulator(new ZesaruxExtEmulator());
				break;
			case EmulatorType.ZXNEXT:
				assert(false);	// needs to be implemented
				break;
			case EmulatorType.MAME:
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
