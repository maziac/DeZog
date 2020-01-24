
import * as assert from 'assert';
import { ZesaruxEmulator } from './remotes/zesarux/zesaruxemulator';
import { ZesaruxExtEmulator } from './remotes/zesarux/zesaruxextemulator';
import { EmulatorClass } from './emulator';


/// Different machine emulators.
export enum EmulatorType {
	UNKNOWN = 0,
	ZESARUX,		/// ZEsarUX
	ZESARUX_EXT,	/// ZEsarUX with own extensions (e.g. fast breakpoints)
	ZXNEXT,			/// ZXNEXT HW connected via UART
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
				EmulatorFactory.setEmulator(new ZesaruxEmulator());
				break;
			case EmulatorType.ZESARUX_EXT:	// Zesarux with own extensions.
				EmulatorFactory.setEmulator(new ZesaruxExtEmulator());
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
	protected static setEmulator(emulator: EmulatorClass) {
		Emulator = emulator;
	}

}


export var Emulator: EmulatorClass;
