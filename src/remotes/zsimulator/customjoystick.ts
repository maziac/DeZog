import {CustomJoyType, JoyBitPort} from "../../settings/settings";
import {Z80Ports} from "./z80ports";



/** Extends the joystick setup by a 'pressed' variable.
 */
interface JoyConfig extends JoyBitPort{
	// Additionally: if button is pressed or not
	pressed: boolean;
}


// The array indexes of the joystick buttons.
const enum JoyButton {
	FIRE = 0,
	FIRE2 = 1,
	FIRE3 = 2,
	FIRE4 = 3,
	UP = 4,
	LEFT = 5,
	RIGHT = 6,
	DOWN = 7
};


/** A customizable joystick.
 */
export class CustomJoystick {
	// The joystick configuration.
	config: (JoyConfig | undefined)[];

	// The keyboard values, each low bit is an activated key.
	protected keyboardMatrix = new Uint8Array([0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]);

	// The default value returned if no peripheral is attached.
	protected defaultPortIn: 0xFF | 0x00;

	/** Constructor.
	 */
	constructor(ports: Z80Ports, customJoy: CustomJoyType) {
		// Copy default port value
		this.defaultPortIn= ports.defaultPortIn;
		// Copy the configuration
		this.config = [
			customJoy.fire ?	{...customJoy.fire, pressed: false} : undefined,
			customJoy.fire2 ? {...customJoy.fire2, pressed: false} : undefined,
			customJoy.fire3 ? {...customJoy.fire3, pressed: false} : undefined,
			customJoy.fire4 ? {...customJoy.fire4, pressed: false} : undefined,
			customJoy.up ? 		{...customJoy.up, pressed: false} : undefined,
			customJoy.left ? 	{...customJoy.left, pressed: false} : undefined,
			customJoy.right ? 	{...customJoy.right, pressed: false} : undefined,
			customJoy.down ? 	{...customJoy.down, pressed: false} : undefined,
		];
		// Register the port
		ports.registerGenericInPortFunction((port: number) => this.readPort(port));
	}


	/** Returns the value of the read port.
	 * @param port The port to read.
	 */
	protected readPort(port: number): number {
		let value;
		for(const button of this.config) {
			if (button) {
				// Check address
				if ((port & button.portMask) === button.port) {
					if (value === undefined)
						value = this.defaultPortIn;
					value &= ~button.bit;
					// Check button
					if (button.pressed)
						value |= button.bit;
					if (button.lowActive)
						value ^= button.bit;
				}
			}
		}
		return value;
	}


	/** Sets a key in the keyboard matrix.
	 * @param row The row of the key.
	 * @param bit The bit that correspondents to the column, active high.
	 * @param pressed True, if the key is pressed.
	 */
	public setButton(id: string, pressed: boolean) {
		let button;
		switch (id) {
			case 'customJoy.joy1.fire':	button = this.config![JoyButton.FIRE]; break;
			case 'customJoy.joy1.fire2': button = this.config![JoyButton.FIRE2]; break;
			case 'customJoy.joy1.fire3': button = this.config![JoyButton.FIRE3]; break;
			case 'customJoy.joy1.fire4': button = this.config![JoyButton.FIRE4]; break;
			case 'customJoy.joy1.up': button = this.config![JoyButton.UP]; break;
			case 'customJoy.joy1.left': button = this.config![JoyButton.LEFT]; break;
			case 'customJoy.joy1.right': button = this.config![JoyButton.RIGHT]; break;
			case 'customJoy.joy1.down': button = this.config![JoyButton.DOWN]; break;
		}
		if (button) {
			button.pressed = pressed;
		}
	}
}
