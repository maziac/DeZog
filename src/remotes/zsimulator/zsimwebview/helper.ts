import {vscode} from "./vscode-import";


// Define class for communication
export class CustomUiApi {
	/**
	 * A message has been received from the custom code that
	 * shall be executed by the custom UI code.
	 * User can leave this undefined if he does not generate any message in
	 * the custom code view.
	 * receivedFromCustomUi(message: any) => void;
	 * @param message The message object. User defined.
	 */
	receivedFromCustomLogic: ((msg) => void) | undefined = undefined;

	/**
	 * Method to send something from the Custom UI to the Custom Logic.
	 * Wraps the message.
	 * @param msg The custom message to send.
	 */
	sendToCustomLogic = (msg) => {
		const outerMsg = {
			command: 'sendToCustomLogic',
			value: msg
		};
		vscode.postMessage(outerMsg);
	}

	/**
	 * Writes a log.
	 * @param ...args Any arguments.
	 */
	log = (...args) => {
		const msg = {
			command: 'log',
			args: args
		};
		vscode.postMessage(msg);
	}
}
export const UIAPI = new CustomUiApi();
globalThis.UIAPI = UIAPI;


/**
 * An element that can be used for output and input of bit data.
 * It can show 2 states 'ON' or 'OFF' indicated by colors.
 * The element itself is a square with a border.
 * Inside a number (or letter) can be shown, e.g. to indicate the bit index.
 * If an 'onchange' function is given the element also observes the mouse
 * to change it's internal state. (E.g. a mouse click to toggle the state.)
 * Whenever a change happens the 'onchange' function is called.
 *
 * These values can be set inside the html tag on creation:
 * - bitvalue: The initial value. Default is 0.
 * - oncolor: The color used to indicate state 'ON', e.g. "red".
 * - offcolor: The color used to indicate state 'OFF', e.g. "white".
 * - onchange: If set the element is turned into an input element.
 *     'onchange' is a function that is called when the state changes because of mouse activity.
 * - togglemode: "true" (default) to toggle state on each mouse click.
 *               "false" to set state to 'ON' only during button down.
 *
 * Examples:
 * <ui-bit oncolor="green" offcolor="yellow"/>
 * <ui-bit togglemode="false" onchange="my_func(this)"/>
 * You can get the value (e.g. in 'my_func(this)' with 'this.bitvalue'.
 */
export class UiBit extends HTMLElement {

	static get observedAttributes() {
		return ['bitvalue', 'oncolor', 'offcolor', 'togglemode', 'onchange'];
	}

	connectedCallback() {
		this.innerHTML = "";

		// Set default values.
		// https://www.w3schools.com/jsref/dom_obj_style.asp
		if (!this.style.margin)
			this.style.margin = "0.0em";
		/*
		if (!this.style.padding)
			this.style.padding="0em";
			*/
		if (!this.style.paddingTop)
			this.style.paddingTop = "1px";
		if (!this.style.paddingBottom)
			this.style.paddingBottom = "3px";
		if (!this.style.paddingLeft)
			this.style.paddingLeft = "2px";
		if (!this.style.paddingRight)
			this.style.paddingRight = "2px";
		if (!this.style.textAlign)
			this.style.textAlign = "center";
		if (!this.style.display)
			this.style.display = "inline-block";
		if (!this.style.borderWidth)
			this.style.borderWidth = "thin";
		if (!this.style.borderStyle)
			this.style.borderStyle = "solid";
		if (!this.style.borderColor)
			this.style.borderColor = "black";
		if (!this.style.width)
			this.style.width = "1em";
		if (!this.style.height)
			this.style.height = "1em";
		if (!this.style.userSelect)
			this.style.userSelect = "none";

		// Init undefined
		if ((this as any).bitvalue == undefined)
			(this as any).bitvalue = 0;
		if ((this as any).oncolor == undefined)
			(this as any).oncolor = "red";
		if ((this as any).offcolor == undefined)
			(this as any).offcolor = "white";
		this.setColor();

		// Inform about initial value
		const bitvalue = (this as any).bitvalue;
		(this as any).bitvalue = undefined;	// To make sure it is different
		this.setBitValue(bitvalue);

		// Listeners for the mouse, depending on this.onstatechange
		this.registerMouseListeners();
	}


	attributeChangedCallback(name, oldValue, newValue) {
		if (name === "bitvalue") {
			(this as any).bitvalue = newValue;
		}
		else if (name === "oncolor") {
			(this as any).oncolor = newValue;
		}
		else if (name === "offcolor") {
			(this as any).offcolor = newValue;
		}
		else if (name === "togglemode") {
			(this as any).togglemode = (newValue === "true");
		}
		else if (name === "onchange") {
			// Note: eval should not be used with esbuild, instead Function is used:
			//(this as any).onstatechange = eval("() => { " + newValue + " }");
			(this as any).onstatechange = new Function(newValue);
		}
	}


	registerMouseListeners() {
		if ((this as any).onstatechange != undefined) {
			(this as any).style.cursor = "pointer";
			if ((this as any).togglemode == undefined)
				(this as any).togglemode = true;
			(this as any).addEventListener('click', () => {
				if ((this as any).togglemode)
					(this as any).toggle();
			});
			(this as any).addEventListener('mousedown', () => {
				if (!(this as any).togglemode)
					this.setBitValue(1);
			});
			this.addEventListener('mouseup', () => {
				if (!(this as any).togglemode)
					this.setBitValue(0);
			});
			this.addEventListener('mouseleave', () => {
				if (!(this as any).togglemode)
					this.setBitValue(0);
			});
		}
	}

	setBitIndex(index) {
		this.innerHTML = index;
	}

	setColor() {
		if ((this as any).bitvalue != 0)
			this.style.backgroundColor = (this as any).oncolor;
		else
			this.style.backgroundColor = (this as any).offcolor;
	}

	setBitValue(newVal) {
		if ((this as any).bitvalue != newVal) {
			(this as any).bitvalue = newVal;
			// Check if someone waits on a notification
			if ((this as any).onstatechange) {
				(this as any).onstatechange();
			}
		}
		this.setColor();
	}

	toggle() {
		const newVal = ((this as any).bitvalue == 0) ? 1 : 0;
		this.setBitValue(newVal);
	}
}

customElements.define('ui-bit', UiBit);


/**
 * Combines 8 UiBit elements into one.
 *
 * These values can be set inside the html tag on creation:
 * - bytevalue: The initial value. Default is 0.
 * - startindex: If set an index is shown in the bits. The indices start
 *     at startindex.
 * - oncolor: The color used to indicate state 'ON' of a bit, e.g. "red".
 * - offcolor: The color used to indicate state 'OFF' of a bit, e.g. "white".
 * - onchange: If set the element is turned into an input element.
 *     'onchange' is a function that is called when the state changes because of mouse activity.
 * - togglemode: "true" (default) to toggle state on each mouse click.
 *               "false" to set state of a bit to 'ON' only during button down.
 *
 * Examples:
 * <ui-byte oncolor="green" offcolor="yellow"/>
 * <ui-byte togglemode="false" onchange="my_func(this)"/>
 * You can get the value (e.g. in 'my_func(this)' with 'this.bytevalue'.
 */
class UiByte extends HTMLElement {

	static get observedAttributes() {
		return ['startindex', 'bytevalue', 'oncolor', 'offcolor', 'togglemode', 'onchange'];
	}

	connectedCallback() {
		this.innerHTML = "";
		if (!this.style.display)
			this.style.display = "inline-block";

		// Init undefined
		if ((this as any).initialbytevalue == undefined)
			(this as any).initialbytevalue = 0;
		if ((this as any).oncolor == undefined)
			(this as any).oncolor = "red";
		if ((this as any).offcolor == undefined)
			(this as any).offcolor = "white";
		if ((this as any).togglemode == undefined)
			(this as any).togglemode = true;

		// Create byte from bits
		(this as any).bits = [];
		let k = (this as any).startindex;
		if (k != undefined)
			k = 7 + parseInt(k);
		for (let i = 0; i < 8; i++) {
			const bit = document.createElement('ui-bit');
			// Togglemode
			(bit as any).togglemode = (this as any).togglemode;
			// Add object
			this.appendChild(bit);
			(this as any).bits[i] = bit;
			// Bit index
			if (k != undefined) {
				(bit as any).setBitIndex(k);
				k--;
			}
			// Color
			(bit as any).oncolor = (this as any).oncolor;
			(bit as any).offcolor = (this as any).offcolor;
			// Copy style (e.g. border-radius)
			bit.style.borderWidth = this.style.borderWidth;
			bit.style.borderRadius = this.style.borderRadius;
			bit.style.borderRadius = this.style.borderRadius;
			if (this.style.borderWidth)
				bit.style.borderWidth = this.style.borderWidth;
			if (this.style.borderStyle)
				bit.style.borderStyle = this.style.borderStyle;
			if (this.style.borderColor)
				bit.style.borderColor = this.style.borderColor;
		}

		// Set the value through setter. Send notification.
		this.bytevalue = (this as any).initialbytevalue;

		// Set onchange
		if ((this as any).onstatechange) {
			for (let i = 0; i < 8; i++) {
				const bit = (this as any).bits[i];
				bit.onstatechange = () => {
					(this as any).onstatechange();
				};
				bit.registerMouseListeners();
			}
		}
	}


	attributeChangedCallback(name, oldValue, newValue) {
		if (name === "startindex") {
			(this as any).startindex = newValue;
		}
		else if (name === "bytevalue") {
			(this as any).initialbytevalue = parseInt(newValue);
		}
		else if (name === "oncolor") {
			(this as any).oncolor = newValue;
		}
		else if (name === "offcolor") {
			(this as any).offcolor = newValue;
		}
		else if (name === "togglemode") {
			(this as any).togglemode = (newValue === "true");
		}
		else if (name === "onchange") {
			// Note: eval should not be used with esbuild, instead Function is used:
			//(this as any).onstatechange = eval("() => { " + newValue + " }");
			(this as any).onstatechange = new Function(newValue);

			//(this as any).onstatechange = new Function("() => { " + newValue + " }");
		}
	}

	// Get value
	get bytevalue() {
		let bitMaskIndex = 7;
		let value = 0;
		for (let i = 0; i < 8; i++) {
			const bit = (this as any).bits[i];
			// Set value
			const bitvalue = bit.bitvalue;
			value += bitvalue << bitMaskIndex;
			bitMaskIndex--;
		}
		return value;
	}

	// Set value
	set bytevalue(newVal) {
		let bitMaskIndex = 7;
		for (let i = 0; i < 8; i++) {
			const bit = (this as any).bits[i];
			// Set value
			bit.bitvalue = (newVal >> bitMaskIndex) & 0x01;
			bitMaskIndex--;
			// Color
			bit.setColor();
		}
		// Notify
		if ((this as any).onstatechange)
			(this as any).onstatechange();
	}

}

customElements.define('ui-byte', UiByte);
