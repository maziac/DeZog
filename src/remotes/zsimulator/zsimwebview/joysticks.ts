import {UiBit} from "./helper";


// Type for the joystick data.
export type JoystickData = {
	fire: UiBit,
	fire2?: UiBit,
	fire3?: UiBit,
	up: UiBit,
	left: UiBit,
	right: UiBit,
	down: UiBit
}


// Pointer to the joystick html elements
export const joystickObjs = new Array<JoystickData>();


/** Initializes the joystick polling.
 */
export function initJoystickPolling() {
	// Poll gamepads regularly if at least one joystick was enabled
	if (joystickObjs.length > 0) {
		// Check every 50 ms
		setInterval(() => {
			const gps = navigator.getGamepads();
			let j = 0;
			for (const gp of gps) {
				if (gp) {
					const obj = joystickObjs[j];
					// Fire button(s)
					const pressed = (gp.buttons[0].pressed) ? 1 : 0;
					obj.fire.setBitValue(pressed);
					if (obj.fire2) {
						const pressed = (gp.buttons[1].pressed) ? 1 : 0;
						obj.fire2.setBitValue(pressed);
					}
					if (obj.fire3) {
						const pressed = (gp.buttons[2].pressed) ? 1 : 0;
						obj.fire3.setBitValue(pressed);
					}
					// Check all axis
					const axes = gp.axes;
					const axesLen = axes.length;
					if (axesLen >= 2) {
						const lr = axes[0];
						const ud = axes[1];
						obj.up.setBitValue((ud < -0.5) ? 1 : 0);
						obj.down.setBitValue((ud > 0.5) ? 1 : 0);
						obj.left.setBitValue((lr < -0.5) ? 1 : 0);
						obj.right.setBitValue((lr > 0.5) ? 1 : 0);
					}
					// Next
					j++;
				}
			}
		}, 50);
	}
}
