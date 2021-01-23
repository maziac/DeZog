import * as vscode from 'vscode';
import {EventEmitter} from 'events';
import {BaseView} from '../../views/baseview';
import {ZSimRemote} from './zsimremote';
import {Settings} from '../../settings';
import {Utility} from '../../misc/utility';
import {readFileSync} from 'fs';
import {LogCustomCode} from '../../log';

/**
 * A Webview that shows the simulated peripherals.
 * E.g. in case of the Spectrum the ULA screen or the keyboard.
 */
export class ZSimulationView extends BaseView {

	// The max. number of message in the queue. If reached the ZSimulationView will ask
	// for processing time.
	static MESSAGE_HIGH_WATERMARK=100;
	static MESSAGE_LOW_WATERMARK=10;

	// Holds the gif image a string.
	protected screenGifString;

	// A map to hold the values of the simulated ports.
	protected simulatedPorts: Map<number, number>;	// Port <-> value

	/// We listen for 'update' on this emitter to update the html.
	protected parent: EventEmitter;

	// A pointer to the simulator.
	protected simulator: ZSimRemote;

	// Taken from Settings. Path to the extra javascript code.
	protected customUiPath: string;

	// Counts the number of outstanding (not processed) webview messages.
	// Is used to insert "pauses" so that the webview can catch up.
	protected countOfOutstandingMessages: number;

	/**
	 * Factory method which creates a new view and handles it's lifecycle.
	 * I.e. the events.
	 * @param simulator The simulator Remote which emits the signals.
	 */
	public static SimulationViewFactory(simulator: ZSimRemote) {
		// Safety check
		if (!simulator)
			return;

		// Create new instance
		const zxview: ZSimulationView=new ZSimulationView(simulator);
		simulator.once('closed', () => {
			zxview.close();
			//zxview=undefined;
		});
		simulator.on('update', async (reason) => {
			await zxview.update();
		});
		simulator.customCode?.on('sendToCustomUi', (message: any) => {
			LogCustomCode.log('UI: UIAPI.receivedFromCustomLogic: '+JSON.stringify(message));
			// Wrap message from custom code
			const outerMsg={
				command: 'receivedFromCustomLogic',
				value: message
			};
			zxview.sendMessageToWebView(outerMsg);
		});
	}


	/**
	 * Creates the basic view.
	 * @param memory The memory of the CPU.
	 */
	constructor(simulator: ZSimRemote) {
		super(false);
		// Init
		this.simulator=simulator;
		this.countOfOutstandingMessages=0;

		// ZX Keyboard?
		this.simulatedPorts = new Map<number, number>();
		if (Settings.launch.zsim.zxKeyboard) {
			// Prepare all used ports
			this.simulatedPorts.set(0xFEFE, 0xFF);
			this.simulatedPorts.set(0xFDFE, 0xFF);
			this.simulatedPorts.set(0xFBFE, 0xFF);
			this.simulatedPorts.set(0xF7FE, 0xFF);
			this.simulatedPorts.set(0xEFFE, 0xFF);
			this.simulatedPorts.set(0xDFFE, 0xFF);
			this.simulatedPorts.set(0xBFFE, 0xFF);
			this.simulatedPorts.set(0x7FFE, 0xFF);
		}
		else {
			// If keyboard id not defined, check for ZX Interface 2
			if (Settings.launch.zsim.zxInterface2Joy) {
				// Prepare all used ports
				this.simulatedPorts.set(0xF7FE, 0xFF);	// Joystick 2 (left): Bits: xxxLRDUF, low active, keys 1-5
				this.simulatedPorts.set(0xEFFE, 0xFF);	// Joystick 1 (right): Bits: xxxFUDRL, low active, keys 6-0

				// Set call backs
				for (const [port,] of this.simulatedPorts) {
					this.simulator.ports.registerSpecificInPortFunction(port, (port: number) => {
						const value = this.simulatedPorts.get(port)!;
						return value;
					});
				}
			}
		}

		// Check for Kempston Joystick
		if (Settings.launch.zsim.kempstonJoy) {
			// Prepare port:  Port 0x001f, 000FUDLR, Active = 1
			this.simulatedPorts.set(0x001F, 0x00);
		}

		// Set callbacks for all simulated ports.
		for (const [port,] of this.simulatedPorts) {
			this.simulator.ports.registerSpecificInPortFunction(port, (port: number) => {
				const value = this.simulatedPorts.get(port)!;
				return value;
			});
		}


		// Add title
		Utility.assert(this.vscodePanel);
		this.vscodePanel.title='Z80 Simulator - '+Settings.launch.zsim.memoryModel;

		// Read path for additional javascript code
		this.customUiPath=Settings.launch.zsim.customCode.uiPath;

		// Initial html page.
		this.setHtml();
		//this.update(); Is done by the webview

		// Inform custom code that UI is ready.
		this.simulator.customCode?.uiReady();
	}


	/**
	 * Closes the view.
	 */
	public close() {
		this.vscodePanel.dispose();
	}


	/**
	 * Dispose the view (called e.g. on close).
	 * Use this to clean up additional stuff.
	 * Normally not required.
	 */
	public disposeView() {
	}


	/**
	 * The web view posted a message to this view.
	 * @param message The message. message.command contains the command as a string. E.g. 'keyChanged'
	 */
	protected webViewMessageReceived(message: any) {
		switch (message.command) {
			case 'updateRequest':
				// The webview requests an update, e.g. because it has been
				// moved from background to foreground (vscode does not preserve the state)
				this.update();	// No need to call 'await'
				break;
			case 'keyChanged':
				this.keyChanged(message.key, message.value);
				break;
			case 'portBit':
				this.setPortBit(message.value.port, message.value.on, message.value.bitByte);
				break;
			case 'sendToCustomLogic':
				// Unwrap message
				const innerMsg=message.value;
				LogCustomCode.log("UI: UIAPI.sendToCustomLogic: "+JSON.stringify(innerMsg));
				this.sendToCustomLogic(innerMsg);
				break;
			case 'reloadCustomLogicAndUi':
				// Reload the custom code
				const jsPath=Settings.launch.zsim.customCode?.jsPath;
				if (jsPath) {
					// Can throw an error
					const jsCode=readFileSync(jsPath).toString();
					this.simulator.customCode.load(jsCode);
				}
				// Reload the custom UI code
				this.setHtml();
				// Inform custom code that UI is ready.
				this.simulator.customCode?.uiReady();
				break;
			case 'log':
				// Log a message
				const text=message.args.map(elem => elem.toString()).join(', ');
				LogCustomCode.log("UI: "+text);
				break;
			case 'countOfProcessedMessages':
				// For balancing the number of processed messages (since last time) is provided.;
				this.countOfOutstandingMessages-=message.value;
				Utility.assert(this.countOfOutstandingMessages>=0);
				// For balancing: Remove request for procesing time
				if (this.countOfOutstandingMessages<=ZSimulationView.MESSAGE_LOW_WATERMARK) {
					this.simulator.setTimeoutRequest(false);
				}
				break;
			default:
				super.webViewMessageReceived(message);
				break;
		}
	}


	/**
	 * A message is posted to the web view.
	 * Overwritten to count the number of messages for balancing.
	 * @param message The message. message.command should contain the command as a string.
	 * This needs to be evaluated inside the web view.
	 * @param baseView The webview to post to. Can be omitted, default is 'this'.
	 */
	protected sendMessageToWebView(message: any, baseView: BaseView=this) {
		this.countOfOutstandingMessages++;
		super.sendMessageToWebView(message, baseView);
		// For balancing: Ask for processing time if messages cannot be processed in time.
		if (this.countOfOutstandingMessages>=ZSimulationView.MESSAGE_HIGH_WATERMARK) {
			this.simulator.setTimeoutRequest(true);
		}
	}


	/**
	 * Called if the custom UI code wants to send something to the custom logic/the javascript code.
	 */
	protected sendToCustomLogic(msg: any) {
		this.simulator.customCode?.receivedFromCustomUi(msg);
	}


	/**
	 * Called on key press or key release.
	 * Sets/clears the corresponding port bits.
	 * @param key E.g. "key_Digit2", "key_KeyQ", "key_Enter", "key_Space", "key_ShiftLeft" (CAPS) or "key_ShiftRight" (SYMBOL).
	 * @param on true=pressed, false=released
	 */
	protected keyChanged(key: string, on: boolean) {
		// Determine port
		let port;
		switch (key) {
			case 'key_Digit1':
			case 'key_Digit2':
			case 'key_Digit3':
			case 'key_Digit4':
			case 'key_Digit5':
				port=0xF7FE;
				break;
			case 'key_Digit6':
			case 'key_Digit7':
			case 'key_Digit8':
			case 'key_Digit9':
			case 'key_Digit0':
				port=0xEFFE;
				break;
			case 'key_KeyQ':
			case 'key_KeyW':
			case 'key_KeyE':
			case 'key_KeyR':
			case 'key_KeyT':
				port=0xFBFE;
				break;
			case 'key_KeyY':
			case 'key_KeyU':
			case 'key_KeyI':
			case 'key_KeyO':
			case 'key_KeyP':
				port=0xDFFE;
				break;
			case 'key_KeyA':
			case 'key_KeyS':
			case 'key_KeyD':
			case 'key_KeyF':
			case 'key_KeyG':
				port=0xFDFE;
				break;
			case 'key_KeyH':
			case 'key_KeyJ':
			case 'key_KeyK':
			case 'key_KeyL':
			case 'key_Enter':
				port=0xBFFE;
				break;
			case 'key_ShiftLeft':	// CAPS
			case 'key_KeyZ':
			case 'key_KeyX':
			case 'key_KeyC':
			case 'key_KeyV':
				port=0xFEFE;
				break;
			case 'key_KeyB':
			case 'key_KeyN':
			case 'key_KeyM':
			case 'key_ShiftRight':	// SYMBOL
			case 'key_Space':
				port=0x7FFE;
				break;
			default:
				Utility.assert(false);
		}
		Utility.assert(port);

		// Determine bit
		let bit;
		switch (key) {
			case 'key_ShiftLeft':	// CAPS
			case 'key_KeyA':
			case 'key_KeyQ':
			case 'key_Digit1':
			case 'key_Digit0':
			case 'key_KeyP':
			case 'key_Enter':
			case 'key_Space':
				bit=0b00001;
				break;
			case 'key_KeyZ':
			case 'key_KeyS':
			case 'key_KeyW':
			case 'key_Digit2':
			case 'key_Digit9':
			case 'key_KeyO':
			case 'key_KeyL':
			case 'key_ShiftRight':	// SYMBOL
				bit=0b00010;
				break;
			case 'key_KeyX':
			case 'key_KeyD':
			case 'key_KeyE':
			case 'key_Digit3':
			case 'key_Digit8':
			case 'key_KeyI':
			case 'key_KeyK':
			case 'key_KeyM':
				bit=0b00100;
				break;
			case 'key_KeyC':
			case 'key_KeyF':
			case 'key_KeyR':
			case 'key_Digit4':
			case 'key_Digit7':
			case 'key_KeyU':
			case 'key_KeyJ':
			case 'key_KeyN':
				bit=0b01000;
				break;
			case 'key_KeyV':
			case 'key_KeyG':
			case 'key_KeyT':
			case 'key_Digit5':
			case 'key_Digit6':
			case 'key_KeyY':
			case 'key_KeyH':
			case 'key_KeyB':
				bit=0b10000;
				break;
			default:
				Utility.assert(false);
		}
		Utility.assert(bit);

		// Get port value
		Utility.assert(this.simulatedPorts);
		let value=this.simulatedPorts.get(port)!;
		Utility.assert(value!=undefined);
		if (on)
			value&=~bit;
		else
			value|=bit;
		// And set
		this.simulatedPorts.set(port, value);
	}


	/**
	 * Called if a bit for a port should change.
	 * @param port The port number.
	 * @param on true = bit should be set, false = bit should be cleared
	 * @param bitByte A byte with the right bit set.
	 */
	protected setPortBit(port: number, on: boolean, bitByte: number) {		// Get port value
		Utility.assert(this.simulatedPorts);
		let value = this.simulatedPorts.get(port)!;
		Utility.assert(value != undefined);
		if (on)
			value |= bitByte;
		else
			value &= ~bitByte;
		// And set
		this.simulatedPorts.set(port, value);
	}


	/**
	 * Converts an image into a base64 string.
	 */
	public createBase64String(imgBuffer: number[]): string {
		let screenGifString='';
		try {
			// Create gif
			const buf=Buffer.from(imgBuffer);
			screenGifString='data:image/gif;base64,'+buf.toString('base64');
		}
		catch {}
		return screenGifString;
	}


	/**
	 * Retrieves the screen memory content and displays it.
	 * @param reason Not used.
	 */
	public async update(): Promise<void> {
		try {
			let cpuLoad;
			let slots;
			let slotNames;
			let visualMemImg;
			let screenImg;
			// Update values
			if (Settings.launch.zsim.cpuLoadInterruptRange>0)
				cpuLoad=(this.simulator.z80Cpu.cpuLoad*100).toFixed(0).toString();

			// Visual Memory
			if (Settings.launch.zsim.visualMemory) {
				slots=this.simulator.getSlots();
				const banks=this.simulator.memoryModel.getMemoryBanks(slots);
				slotNames=banks.map(bank => bank.name);
				visualMemImg=this.createBase64String(this.simulator.memory.getVisualMemoryImage());
			}

			if (Settings.launch.zsim.ulaScreen) {
				// A time in ms which is used for the flashing of the color attributes. The flash frequency is 1.6Hz = 625ms.
				const time = this.simulator.getTstatesSync()/this.simulator.getCpuFrequencySync()*1000;
				const ulaData = this.simulator.getUlaScreen();
				screenImg = {
					time,
					ulaData
				};
			}

			// Create message to update the webview
			const message = {
				command: 'update',
				cpuLoad,
				slotNames,
				visualMemImg,
				screenImg
			};
			this.sendMessageToWebView(message);
			// Clear
			this.simulator.memory.clearVisualMemory();
		}
		catch {}
	}


	/**
	 * Sets the html code to display the ula screen, visual memory etc.
	 * Depending on the Settings selection.
	 */
	protected setHtml() {
		// Resource path
		const extPath = Utility.getExtensionPath();
		const resourcePath = vscode.Uri.file(extPath);
		const vscodeResPath = this.vscodePanel.webview.asWebviewUri(resourcePath).toString();

		let html=
`
<head>
	<meta charset="utf-8">
	<base href="${vscodeResPath}/">
</head>

<html>

<style>
.td_on {border: 3px solid;
margin:0em;
padding:0em;
text-align:center;
border-color:black;
background:red;
width:70px;
}

.td_off {border: 3px solid;
margin:0em;
padding:0em;
text-align:center;
border-color:black;
width:70px;
}

</style>

<script>
	var exports = {};
</script>

  <script src="out/src/remotes/zsimulator/zsimwebview/ulascreen.js"></script>
  <script src="out/src/remotes/zsimulator/zsimwebview/helper.js"></script>
  <script src="out/src/remotes/zsimulator/zsimwebview/main.js"></script>


<body>

`;

		if (Settings.launch.zsim.cpuLoadInterruptRange>0) {
			html+=
				`<!-- Z80 CPU load -->
<p>
	<label>Z80 CPU load:</label>
	<label id="cpu_load_id">100</label>
	<label>%</label>
</p>
<script>
	<!-- Store the cpu_load_id -->
	var cpuLoad=document.getElementById("cpu_load_id");
</script>

`;
		}

		// Memory Pages / Visual Memory
		const zx=Settings.launch.zsim.memoryModel.includes("ZX");
		const slots=this.simulator.getSlots();
		const banks=this.simulator.memoryModel.getMemoryBanks(slots);
		html+=
				`<!-- Visual Memory (memory activity) -->
<!-- Legend, Slots -->
<div style="position:relative; width:100%; height:4.5em;">
    <style>
        .border {
            outline: 1px solid var(--vscode-foreground);
            outline-offset: 0;
            height:1em;
            position:absolute;
            text-align: center;
		}
		.slot {
			height:2em;
			background: gray
        }
		.transparent {
			height:2em;
			background: transparent
        }
    </style>

	<!-- Legend -->
    <span style="position:absolute; top: 0em; left:0%">
		<label style="background:blue">&ensp;&ensp;</label><label>&nbsp;PROG &ensp;&ensp;</label>
		<label style="background:yellow">&ensp;&ensp;</label><label>&nbsp;READ &ensp;&ensp;</label>
		<label style="background:red">&ensp;&ensp;</label><label>&nbsp;WRITE</label>
	</span>

	<!-- Address labels -->
	<label style="position:absolute; top:2em; left:0%">0x0000</label>
	<label style="position:absolute; top:2em; left:12.5%">0x2000</label>`;
		// ZX screen memory marker
		if (zx) {
			html+=`
	<label style="position:absolute; top:1.1em; left:25%">0x4000</label>
	<label style="position:absolute; top:1.1em; left:35.5%">0x5B00</label>`;
		}
		else {
			html+=`
			<label style="position:absolute; top:2em; left:25%">0x4000</label>`;
		}

		html+=`
	<label style="position:absolute; top:2em; left:37.5%">0x6000</label>
	<label style="position:absolute; top:2em; left:50%">0x8000</label>
	<label style="position:absolute; top:2em; left:62.5%">0xA000</label>
	<label style="position:absolute; top:2em; left:75%">0xC000</label>
	<label style="position:absolute; top:2em; left:87.5%">0xE000</label>

    <!-- Marker ticks -->
	<span class="border" style="top: 3em; left:0%; height: 1.7em"></span>
	<span class="border" style="top: 3em; left:12.5%; height:1em;"></span>`;
		if (zx) {
			// ZX screen memory marker
			html+=`
	<span class="border" style="top: 2.0em; left:25%; height:2.5em;"></span>
	<span class="border" style="top: 2.0em; left:34.4%; height:2.5em;"></span> <!-- 0x5800 -->
	<span class="border" style="top: 2.0em; left:35.5%; height:2.5em;"></span> <!-- 0x5B00 -->`;
		}
		else {
			// ZX screen memory marker
			html+=`
	<span class="border" style="top: 3em; left:25%; height:1em;"></span>`;
		}

		html+=`
	<span class="border" style="top: 3em; left:37.5%; height:1em;"></span>
	<span class="border" style="top: 3em; left:50%; height:1em;"></span>
	<span class="border" style="top: 3em; left:62.5%; height:1em;"></span>
	<span class="border" style="top: 3em; left:75%; height:1em;"></span>
    <span class="border" style="top: 3em; left:87.5%; height:1em;"></span>
`;
		if (zx) {
			// Markers for display
			html+=`
	<!-- Extra "Screen" range display -->
    <div class="border slot" style="top:2.2em; left:25%; width:9.4%;">SCREEN</div>
	<div class="border slot" style="top:2.2em; left:34.4%; width:1.1%;"></div>`;
		}

		html+=`
	<!-- Visual memory image, is mainly transparent and put on top -->
	<img class="slot" id="visual_mem_img_id" style="image-rendering:pixelated; position:absolute; top:3.5em; left:0; width:100%;">

	<!-- Slots  2nd -->
	`;
		const count=banks.length;
		for (let i=0; i<count; i++) {
			const bank=banks[i];
			const pos=bank.start*100/0x10000;
			const width=(bank.end+1-bank.start)*100/0x10000;
			const add=`<div class="border transparent" id="slot${i}_id" style="top:3.5em; left:${pos}%; width:${width}%;">${bank.name}</div>
			`;
			html+=add;
		}

		html+=`
    <script>
        <!-- Store the visual mem image source -->
        var visualMemImg=document.getElementById("visual_mem_img_id");
	    <!-- Store the slots -->
	    var slots = [
			`;

		for (let i=0; i<count; i++) {
			const add=`document.getElementById("slot${i}_id"),
			`;
			html+=add;
		}

		html+=`
		];
 	</script>
</div>
<br><br>
`;

		// Add code for the screen
		if (Settings.launch.zsim.ulaScreen) {
			html+=
				`<!-- Display the screen gif -->
<canvas id="screen_img_id" style="border:1px solid white;width:100%;"></canvas>
<script>
	<!-- Store the screen image source -->
	var screenImg=document.getElementById("screen_img_id");
</script>
`;
		}


		// Add code for the keyboard
		if (Settings.launch.zsim.zxKeyboard) {
			html +=
				`<!-- Keyboard -->
<details open="true">
  <summary>ZX Keyboard</summary>

	<table style="width:100%">

	<tr>
		<td id="key_Digit1" class="td_off" onClick="cellClicked(this)">1</td>
		<td id="key_Digit2" class="td_off" onClick="cellClicked(this)">2</td>
		<td id="key_Digit3" class="td_off" onClick="cellClicked(this)">3</td>
		<td id="key_Digit4" class="td_off" onClick="cellClicked(this)">4</td>
		<td id="key_Digit5" class="td_off" onClick="cellClicked(this)">5</td>
		<td id="key_Digit6" class="td_off" onClick="cellClicked(this)">6</td>
		<td id="key_Digit7" class="td_off" onClick="cellClicked(this)">7</td>
		<td id="key_Digit8" class="td_off" onClick="cellClicked(this)">8</td>
		<td id="key_Digit9" class="td_off" onClick="cellClicked(this)">9</td>
		<td id="key_Digit0" class="td_off" onClick="cellClicked(this)">0</td>
	</tr>

	<tr>
		<td id="key_KeyQ" class="td_off" onClick="cellClicked(this)">Q</td>
		<td id="key_KeyW" class="td_off" onClick="cellClicked(this)">W</td>
		<td id="key_KeyE" class="td_off" onClick="cellClicked(this)">E</td>
		<td id="key_KeyR" class="td_off" onClick="cellClicked(this)">R</td>
		<td id="key_KeyT" class="td_off" onClick="cellClicked(this)">T</td>
		<td id="key_KeyY" class="td_off" onClick="cellClicked(this)">Y</td>
		<td id="key_KeyU" class="td_off" onClick="cellClicked(this)">U</td>
		<td id="key_KeyI" class="td_off" onClick="cellClicked(this)">I</td>
		<td id="key_KeyO" class="td_off" onClick="cellClicked(this)">O</td>
		<td id="key_KeyP" class="td_off" onClick="cellClicked(this)">P</td>
	</tr>

	<tr>
		<td id="key_KeyA" class="td_off" onClick="cellClicked(this)">A</td>
		<td id="key_KeyS" class="td_off" onClick="cellClicked(this)">S</td>
		<td id="key_KeyD" class="td_off" onClick="cellClicked(this)">D</td>
		<td id="key_KeyF" class="td_off" onClick="cellClicked(this)">F</td>
		<td id="key_KeyG" class="td_off" onClick="cellClicked(this)">G</td>
		<td id="key_KeyH" class="td_off" onClick="cellClicked(this)">H</td>
		<td id="key_KeyJ" class="td_off" onClick="cellClicked(this)">J</td>
		<td id="key_KeyK" class="td_off" onClick="cellClicked(this)">K</td>
		<td id="key_KeyL" class="td_off" onClick="cellClicked(this)">L</td>
		<td id="key_Enter" class="td_off" onClick="cellClicked(this)">ENTER</td>
	</tr>

	<tr>
		<td id="key_ShiftLeft" class="td_off" onClick="cellClicked(this)">CAPS S.</td>
		<td id="key_KeyZ" class="td_off" onClick="cellClicked(this)">Z</td>
		<td id="key_KeyX" class="td_off" onClick="cellClicked(this)">X</td>
		<td id="key_KeyC" class="td_off" onClick="cellClicked(this)">C</td>
		<td id="key_KeyV" class="td_off" onClick="cellClicked(this)">V</td>
		<td id="key_KeyB" class="td_off" onClick="cellClicked(this)">B</td>
		<td id="key_KeyN" class="td_off" onClick="cellClicked(this)">N</td>
		<td id="key_KeyM" class="td_off" onClick="cellClicked(this)">M</td>
		<td id="key_ShiftRight" class="td_off" onClick="cellClicked(this)">SYMB. S.</td>
		<td id="key_Space" class="td_off" onClick="cellClicked(this)">SPACE</td>
	</tr>

	</table>
</details>

`;
		}

		// Add code for the Interface 2 joysticks
		if (Settings.launch.zsim.zxInterface2Joy) {
			html +=
				`<!-- ZX Interface 2 Joysticks -->
<details open="true">
  <summary>ZX Interface 2 Joysticks</summary>

<table>
<tr>
  <td>
  <table style="color:black;" oncolor="red" offcolor="white">
	<tr>
		<td>
			<ui-bit id="if2.joy1.fire" style="border-radius:1em;" onchange="togglePortBitNeg(this, 0xEFFE, 0x01)">F</ui-bit>
		</td>
		<td align="center">
			<ui-bit id="if2.joy1.up" onchange="togglePortBitNeg(this, 0xEFFE, 0x02)">U</ui-bit>
		</td>
	</tr>
	<tr>
		<td>
			<ui-bit id="if2.joy1.left" onchange="togglePortBitNeg(this, 0xEFFE, 0x10)">L</ui-bit>
		</td>
		<td style="color:var(--vscode-editor-foreground)">Joy1</td>
		<td>
			<ui-bit id="if2.joy1.right" onchange="togglePortBitNeg(this, 0xEFFE, 0x08)">R</ui-bit>
		</td>
	</tr>
	<tr>
		<td></td>
		<td align="center">
			<ui-bit id="if2.joy1.down" onchange="togglePortBitNeg(this, 0xEFFE, 0x04)">D</ui-bit>
		</td>
	</tr>
  </table>
  </td>

  <td></td>
  <td></td>

  <td>
  <table style="color:black;">
	<tr>
		<td>
			<ui-bit id="if2.joy2.fire" style="border-radius:1em;" onchange="togglePortBitNeg(this, 0xF7FE, 0x10)">F</ui-bit>
		</td>
		<td align="center">
			<ui-bit id="if2.joy2.up" onchange="togglePortBitNeg(this, 0xF7FE, 0x08)">U</ui-bit>
		</td>
	</tr>
	<tr>
		<td>
			<ui-bit id="if2.joy2.left" onchange="togglePortBitNeg(this, 0xF7FE, 0x01)">L</ui-bit>
		</td>
		<td style="color:var(--vscode-editor-foreground)">Joy2</td>
		<td>
			<ui-bit id="if2.joy2.right" onchange="togglePortBitNeg(this, 0xF7FE, 0x02)">R</ui-bit>
		</td>
	</tr>
	<tr>
		<td></td>
		<td align="center">
			<ui-bit id="if2.joy2.down" onchange="togglePortBitNeg(this, 0xF7FE, 0x04)">D</ui-bit>
		</td>
	</tr>
  </table>
  </td>
</tr>
</table>

</details>

<script>
// Add references to the html elements
joystickObjs.push({
	fire: document.getElementById("if2.joy1.fire"),
	up: document.getElementById("if2.joy1.up"),
	left: document.getElementById("if2.joy1.left"),
	right: document.getElementById("if2.joy1.right"),
	down: document.getElementById("if2.joy1.down")
});
joystickObjs.push({
	fire: document.getElementById("if2.joy2.fire"),
	up: document.getElementById("if2.joy2.up"),
	left: document.getElementById("if2.joy2.left"),
	right: document.getElementById("if2.joy2.right"),
	down: document.getElementById("if2.joy2.down")
});
</script>
`;
		}


		// Add code for the Kempston joystick
		if (Settings.launch.zsim.kempstonJoy) {
			html +=
				`<!-- Kempston Joystick -->
<details open="true">
  <summary>Kempston Joystick</summary>

<table>
<tr>
  <td>
  <table style="color:black;" oncolor="red" offcolor="white" >
	<tr>
		<td>
			<ui-bit id="kempston.joy1.fire" style="border-radius:1em;color:black;" onchange="togglePortBit(this, 0x001F, 0x10)">F</ui-bit>
		</td>
		<td>
			<ui-bit id="kempston.joy1.up" onchange="togglePortBit(this, 0x001F, 0x08)">U</ui-bit>
		</td>
	</tr>
	<tr>
		<td>
			<ui-bit id="kempston.joy1.left" onchange="togglePortBit(this, 0x001F, 0x02)">L</ui-bit>
		</td>
		<td></td>
		<td>
			<ui-bit id="kempston.joy1.right" onchange="togglePortBit(this, 0x001F, 0x01)">R</ui-bit>
		</td>
	</tr>
	<tr>
		<td></td>
		<td>
			<ui-bit id="kempston.joy1.down" onchange="togglePortBit(this, 0x001F, 0x04)">D</ui-bit>
		</td>
	</tr>
  </table>
  </td>

  </table>
  </td>
</tr>
</table>

</details>

<script>
// References to the html objects
joystickObjs.push({
	fire: document.getElementById("kempston.joy1.fire"),
	up: document.getElementById("kempston.joy1.up"),
	left: document.getElementById("kempston.joy1.left"),
	right: document.getElementById("kempston.joy1.right"),
	down: document.getElementById("kempston.joy1.down")
});
</script>
`;
		}

		// Add polling of gamepads
		html += `
<script>

// Poll gamepads regularly if at least one joystick was enabled
if(joystickObjs.length > 0) {
	// Check every 50 ms
	setInterval( () => {
		const gps = navigator.getGamepads();
		let j=0;
		for(const gp of gps) {
			if(gp) {
				const obj = joystickObjs[j];
				// Fire button
				const pressed = (gp.buttons[0].pressed) ? 1 : 0;
				obj.fire.setBitValue(pressed);
				// Check all axis
				const axes = gp.axes;
				const axesLen = axes.length;
				if(axesLen >= 2) {
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
</script>
`;

		// Space for logging
		html +=
`<p id="log"></p>
`;

		// Custom javascript code area
		let jsCode='';
		if (this.customUiPath) {
			try {
				jsCode=readFileSync(this.customUiPath).toString();
			}
			catch (e) {
				jsCode="<b>Error: reading file '"+this.customUiPath+"':"+e.message+"</b>";
			}
		}

		html+=
`<!-- Room for extra/user editable javascript/html code -->
<p>
	<div id="js_code_id">
	${jsCode}
	</div>
</p>

`;

		if (Settings.launch.zsim.customCode.debug) {
			html+=
`<!-- Debug Area -->
<hr>

<details open="true">
    <summary>Debug Area</summary>

	<!-- "Copy all HTML" button -->
	<script>
		// Copies the complete html of the document to the clipboard.
		function copyHtmlToClipboard() {
			const copyText = document.documentElement.innerHTML;
			navigator.clipboard.writeText(copyText);
		}
	</script>

	<script>
		// Reload the javascript business logic.
		function reloadCustomLogicAndUi() {
			// Send request to vscode
			vscode.postMessage({
				command: 'reloadCustomLogicAndUi'
			});
		}
	</script>

	<button onclick="reloadCustomLogicAndUi()">Reload Custom Logic and UI</button>
	&nbsp;&nbsp;
	<button onclick="copyHtmlToClipboard()">Copy all HTML to clipboard</button>


</details>

`;
		}

		html+=
`</body>
</html>
`;

		this.vscodePanel.webview.html='';
		this.vscodePanel.webview.html=html;
	}

}

