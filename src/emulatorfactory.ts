
import * as assert from 'assert';
import { ZesaruxEmulator } from './zesaruxemulator';
import { ZesaruxExtEmulator } from './zesaruxextemulator';


/// Different machine emulators.
export enum EmulatorType {
	UNKNOWN = 0,
	ZESARUX,		/// ZEsarUX
	ZESARUX_EXT,	/// ZEsarUX with own extensions (e.g. fast breakpoints)
	MAME,			/// MAME
}

/**
 * The representation of the Z80 machine.
 * It receives the requests from the EmulDebugAdapter and commincates with
 * the EmulConnector.
 */
export class EmulatorFactory {
	/**
	 * Factory method to create an emulator.
	 */
	public static createEmulator(emul: EmulatorType) {
		switch(emul) {
			case EmulatorType.ZESARUX:
				Emulator = new ZesaruxEmulator();
				break;
			case EmulatorType.ZESARUX_EXT:	// Zesarux with own extensions.
				Emulator = new ZesaruxExtEmulator();
				break;
			case EmulatorType.MAME:
				assert(false);	// needs to be implemented
				break;
			default:
				assert(false);
				break;
		}
	}

}


export var Emulator;
