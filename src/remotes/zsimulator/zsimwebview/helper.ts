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
 * - bitvalue: The initial value to show as color. Default is 0.
 * - digitvalue: The initial value to show as 1 or 0. Default is 0.
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
		return ['bitvalue', 'digitvalue', 'oncolor', 'offcolor', 'digitcolor', 'togglemode', 'onchange'];
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
		const self = this as any;
		if (self.bitvalue == undefined)
			self.bitvalue = 0;
		// Note: do not set digitvalue here
		if (self.oncolor == undefined)
			self.oncolor = "red";
		if (self.offcolor == undefined)
			self.offcolor = "white";
		if (self.digitcolor == undefined)
			self.digitcolor = "black";
		this.setColor();

		// Inform about initial bit value
		const bitvalue = self.bitvalue;
		self.bitvalue = undefined;	// To make sure it is different
		this.setBitValue(bitvalue);

		// Inform about initial digit value
		if (self.digitvalue !== undefined) {
			const digitvalue = self.digitvalue;
			self.digitvalue = undefined;	// To make sure it is different
			this.setDigitValue(digitvalue);
		}
		this.setDigitColor(self.digitcolor);

		// Listeners for the mouse, depending on this.onstatechange
		this.registerMouseListeners();
	}


	attributeChangedCallback(name, oldValue, newValue) {
		const self = this as any;
		if (name === "bitvalue") {
			self.bitvalue = newValue;
		}
		if (name === "digitvalue") {
			self.digitvalue = newValue;
		}
		else if (name === "oncolor") {
			self.oncolor = newValue;
		}
		else if (name === "offcolor") {
			self.offcolor = newValue;
		}
		else if (name === "digitcolor") {
			self.digitcolor = newValue;
		}
		else if (name === "togglemode") {
			self.togglemode = (newValue === "true");
		}
		else if (name === "onchange") {
			// Note: eval should not be used with esbuild, instead Function is used:
			//self.onstatechange = eval("() => { " + newValue + " }");
			self.onstatechange = new Function(newValue);
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
		const self = this as any;
		if (self.bitvalue != 0)
			this.style.backgroundColor = self.oncolor;
		else
			this.style.backgroundColor = self.offcolor;
	}

	setDigitColor(dig_color) {
		(this as any).digitcolor = dig_color;
		this.style.color = dig_color;
	}

	setBitValue(newVal) {
		const self = this as any;
		if (self.bitvalue !== newVal) {
			self.bitvalue = newVal;
			// Check if someone waits on a notification
			if (self.onstatechange) {
				self.onstatechange();
			}
		}
		this.setColor();
	}

	setDigitValue(newVal) {
		const self = this as any;
		if (self.digitvalue !== newVal) {
			self.digitvalue = newVal;
			this.innerHTML = newVal;
			// Check if someone waits on a notification
			if (self.onstatechange) {
				self.onstatechange();
			}
		}
	}

	toggle() {
		const self = this as any;
		const newVal = (self.bitvalue == 0) ? 1 : 0;
		this.setBitValue(newVal);
	}
}

customElements.define('ui-bit', UiBit);


/**
 * Combines 8 UiBit elements into one.
 *
 * These values can be set inside the html tag on creation:
 * - bytevalue: The initial value to show with colors. Default is 0.
 * - digitvalue: The initial value to show as 1's and 0's. Default is 0.
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
		return ['startindex', 'bytevalue', 'digitvalue', 'oncolor', 'offcolor', 'togglemode', 'onchange', 'digitcolor', 'numberofbits'];
	}

	connectedCallback() {
		this.innerHTML = "";
		if (!this.style.display) {
			this.style.display = 'inline-flex';
			this.style.flexWrap = 'nowrap';
			this.style.alignItems = 'center';
		}

		// Init undefined
		const self = this as any;
		const useDigitValue = (self.initialdigitvalue !== undefined);
		if (self.initialbytevalue == undefined)
			self.initialbytevalue = 0;
		if (self.initialdigitvalue == undefined)
			self.initialdigitvalue = 0;
		if (self.oncolor == undefined)
			self.oncolor = "red";
		if (self.offcolor == undefined)
			self.offcolor = "white";
		if (self.togglemode == undefined)
			self.togglemode = true;
		if (self.digitcolor == undefined)
			self.digitcolor = "black";
		if (self.numberofbits == undefined)	// undocumented, you can create UiByte with e.g. just 7 bits
			self.numberofbits = 8;

		// Create byte from bits
		self.bits = [];
		let k, j;
		if (self.startindex && !useDigitValue) {
			k = parseInt(self.startindex);
			j = self.numberofbits - 1;
		}
		for (let i = 0; i < self.numberofbits; i++) {
			const bit = document.createElement('ui-bit');
			// Togglemode
			(bit as any).togglemode = self.togglemode;
			// Add object
			this.appendChild(bit);
			self.bits[i] = bit;
			// Use start index and show as text inside the box
			if (k !== undefined) {
				(bit as any).setBitIndex(j + k);
				j--;
			}
			// Color
			(bit as any).setDigitColor(self.digitcolor);
			(bit as any).oncolor = self.oncolor;
			(bit as any).offcolor = self.offcolor;
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
		this.bytevalue = self.initialbytevalue;
		if (useDigitValue)
			this.digitvalue = self.initialdigitvalue;

		// Set onchange
		if (self.onstatechange) {
			for (let i = 0; i < self.numberofbits; i++) {
				const bit = self.bits[i];
				bit.onstatechange = () => {
					self.onstatechange();
				};
				bit.registerMouseListeners();
			}
		}
	}


	attributeChangedCallback(name, oldValue, newValue) {
		const self = this as any;
		if (name === "startindex") {
			self.startindex = newValue;
		}
		else if (name === "bytevalue") {
			self.initialbytevalue = parseInt(newValue);
		}
		else if (name === "digitvalue") {
			self.initialdigitvalue = parseInt(newValue);
		}
		else if (name === "digitcolor") {
			self.digitcolor = newValue;
		}
		else if (name === "oncolor") {
			self.oncolor = newValue;
		}
		else if (name === "offcolor") {
			self.offcolor = newValue;
		}
		else if (name === "togglemode") {
			self.togglemode = (newValue === "true");
		}
		else if (name === "onchange") {
			// Note: eval should not be used with esbuild, instead Function is used:
			//self.onstatechange = eval("() => { " + newValue + " }");
			self.onstatechange = new Function(newValue);

			//self.onstatechange = new Function("() => { " + newValue + " }");
		}
		else if (name === "numberofbits") {
			self.numberofbits = parseInt(newValue);
		}
	}

	// Get value
	get bytevalue() {
		const self = this as any;
		let bitMaskIndex = self.numberofbits - 1;
		let value = 0;
		for (let i = 0; i < self.numberofbits; i++) {
			const bit = self.bits[i];
			// Set value
			const bitvalue = bit.bitvalue;
			value += bitvalue << bitMaskIndex;
			bitMaskIndex--;
		}
		return value;
	}

	// Set value
	set bytevalue(newVal) {
		const self = this as any;
		let bitMaskIndex = self.numberofbits - 1;
		for (let i = 0; i < self.numberofbits; i++) {
			const bit = self.bits[i];
			// Set value
			bit.setBitValue((newVal >> bitMaskIndex) & 0x01);
			bitMaskIndex--;
			// Color
			bit.setColor();
		}
		// Notify
		if (self.onstatechange)
			self.onstatechange();
	}

	// Get value
	get digitvalue() {
		const self = this as any;
		let bitMaskIndex = self.numberofbits - 1;
		let value = 0;
		for (let i = 0; i < self.numberofbits; i++) {
			const bit = self.bits[i];
			// Set value
			const bitvalue = bit.digitvalue;
			value += bitvalue << bitMaskIndex;
			bitMaskIndex--;
		}
		return value;
	}

	// Set value
	set digitvalue(newVal) {
		const self = this as any;
		let bitMaskIndex = self.numberofbits - 1;
		for (let i = 0; i < self.numberofbits; i++) {
			const bit = self.bits[i];
			// Set value
			bit.setDigitValue((newVal >> bitMaskIndex) & 0x01);
			bitMaskIndex--;
		}
		// Notify
		if (self.onstatechange)
			self.onstatechange();
	}

}

customElements.define('ui-byte', UiByte);
