import * as vscode from 'vscode';
import {BaseView} from '../../views/baseview';
import {ZSimRemote} from './zsimremote';
import {Utility} from '../../misc/utility';
import {LogZsimCustomCode} from '../../log';
import {GlobalStorage} from '../../globalstorage';
import {readFileSync} from 'fs';
import {DiagnosticsHandler} from '../../diagnosticshandler';


/**
 * A Webview that shows the simulated peripherals.
 * E.g. in case of the Spectrum the ULA screen or the keyboard.
 */
export class ZSimulationView extends BaseView {
	// The max. number of message in the queue. If reached the ZSimulationView will ask
	// for processing time.
	static MESSAGE_HIGH_WATERMARK = 100;
	static MESSAGE_LOW_WATERMARK = 10;

	// The previous value for the cpu frequency, used to check on a change.
	protected prevCpuFreq: number;

	// A map to hold the values of the simulated ports. Only the
	// low address of the port is decoded.
	protected lowAddressSimulatedPorts: Map<number, number>;	// Port <-> value

	// A pointer to the simulator.
	protected simulator: ZSimRemote;

	// Taken from Settings. Path to the extra javascript code.
	protected customUiPath: string;

	// Counts the number of outstanding (not processed) webview messages.
	// Is used to insert "pauses" so that the webview can catch up.
	protected countOfOutstandingMessages: number;

	// The time interval to update the simulation view.
	protected displayTime: number;

	// The timer used for updating the display.
	protected displayTimer: NodeJS.Timeout;

	// The timeout (with no CPU activity) before a 'cpuStopped' is sent to the webview.
	protected stopTime: number;

	// The timer used for the stop time.
	protected stopTimer: NodeJS.Timeout;

	// Set by the display timer: the next time an update will happen.
	protected nextUpdateTime: number;


	// Stores the last T-states value.
	// Used to check for changes.
	protected previousTstates: number;

	// Used to determine when the web view ahs been loaded.
	protected resolveLoaded: () => void;

	// To create human readable numbers.
	protected numberFormatter = new Intl.NumberFormat('en', {notation: 'compact', compactDisplay: 'short', maximumFractionDigits: 2});


	/**
	 * Creates the zsim simulation view.
	 * @param simulator The simulator.
	 */
	constructor(simulator: ZSimRemote) {
		super();
		// Init
		this.simulator = simulator;
		this.countOfOutstandingMessages = 0;
		this.displayTime = 1000 / simulator.zsim.updateFrequency;
		this.displayTimer = undefined as any;
		this.stopTime = 2 * this.displayTime;
		if (this.stopTime < 500)
			this.stopTime = 500;	// At least 500 ms
		this.stopTimer = undefined as any;
		this.previousTstates = -1;

		// For port handing
		this.lowAddressSimulatedPorts = new Map<number, number>();

		// Check for Kempston Joystick
		if (simulator.zsim.kempstonJoy) {
			// Prepare port:  Port 0x1f, 000FUDLR, Active = 1
			this.lowAddressSimulatedPorts.set(0x1F, 0x00);
		}

		// Set callbacks for all simulated ports.
		this.simulator.ports.registerGenericInPortFunction((port: number) => {
			for (const [simPort,] of this.lowAddressSimulatedPorts) {
				if ((port & 0xFF) === simPort)
					return this.lowAddressSimulatedPorts.get(simPort);
			}
			return undefined;
		});

		// Add title
		Utility.assert(this.vscodePanel);
		this.vscodePanel.title = 'Z80 Simulator - ' + simulator.zsim.memoryModel;

		// Read path for additional javascript code
		this.customUiPath = simulator.zsim.customCode.uiPath;
	}


	/** Setup the html page and wait until it is loaded.
	 */
	public async waitOnInitView() {
		// Initial html page.
		this.setHtml();
		// Wait until it is loaded
		await this.waitOnViewLoaded();
		// Send the initialization request.
		this.sendInit();
		// Inform custom code that UI is ready.
		this.simulator.customCode?.uiReady();

		// Check if simulator restored
		this.simulator.on('restored', () => {
			// Change previous t-states to force an update.
			this.updateScreen();
			this.updateDisplay();
		});

		// Handle update of the screen (vertical sync)
		this.simulator.on('updateScreen', () => {
			this.updateScreen();
		});

		// Handle custom code messages
		this.simulator.customCode?.on('sendToCustomUi', (message: any) => {
			LogZsimCustomCode.log('UI: UIAPI.receivedFromCustomLogic: ' + JSON.stringify(message));
			// Wrap message from custom code
			const outerMsg = {
				command: 'receivedFromCustomLogic',
				value: message
			};
			this.sendMessageToWebView(outerMsg);
		});

		// Update regularly
		this.startDisplayTimer();

		// Update once initially
		//this.updateDisplay();
	}


	/** When the DOM is ready (loaded) a first message is sent.
	 * This function waits on the message.
	 */
	public async waitOnViewLoaded(): Promise<void> {
		return new Promise<void>(resolve => {
			// Save the 'resolve'. Is called in 'messageReceived'.
			this.resolveLoaded = resolve;
		});
	}


	/**
	 * Starts the stop timer.
	 * Some time after the last CPU activity has been found a 'cpuStopped'
	 * is sent to the webview to e.g. shutdown audio.
	 */
	protected restartStopTimer() {
		// Update on timer
		clearInterval(this.stopTimer);
		// Start timer
		this.stopTimer = setTimeout(() => {
			// Send stop to audio in webview
			this.sendMessageToWebView({command: 'cpuStopped'});
			// Update the screen
			this.updateScreen();
			this.stopTimer = undefined as any;
		}, this.stopTime);	// in ms
	}


	/**
	 * Starts the display timer.
	 */
	protected startDisplayTimer() {
		// Update on timer
		clearInterval(this.displayTimer);
		// Get current time
		const nowTime = Date.now();
		this.nextUpdateTime = nowTime + this.displayTime;
		// Start timer
		this.displayTimer = setInterval(() => {
			// Update
			this.updateDisplay();
			// Get current time
			const currentTime = Date.now();
			this.nextUpdateTime = currentTime + this.displayTime;
		}, this.displayTime);	// in ms
	}


	/** Dispose the view (called e.g. on close).
	 * Use this to clean up additional stuff.
	 * Normally not required.
	 */
	public disposeView() {
		clearInterval(this.displayTimer);
		this.displayTimer = undefined as any;
		super.disposeView();
		// Terminate remote
		(async () => {
			this.simulator.terminate()
		})();
	}


	/** The web view posted a message to this view.
	 * @param message The message. message.command contains the command as a string. E.g. 'keyChanged'
	 */
	protected async webViewMessageReceived(message: any) {
		switch (message.command) {
			case 'loaded':
				// DOM (webpage) has been completely loaded.
				this.resolveLoaded();
				this.resolveLoaded = undefined as any;
				break;

			case 'warning': {
				// A warning has been received, e.g. sample rate was not possible.
				const warningText = message.text;
				await vscode.window.showWarningMessage(warningText);
				break;
			}
			case 'keyChanged':
				this.keyChanged(message.key, message.value);
				break;
			case 'keyBit':
				this.simulator.zxKeyboard.setKey(message.value.row, message.value.bitByte, message.value.on);
				//console.log("keyBit: " + message.value.row + ", " + message.value.bitByte + ", " + message.value.on);
				break;
			case 'joyButton':
				this.simulator.customJoystick.setButton(message.value.id, message.value.on);
				break;
			case 'portBit':
				this.setPortBit(message.value.port, message.value.on, message.value.bitByte);
				break;
			case 'volumeChanged':
				GlobalStorage.Set('audio.volume', message.value);
				break;
			case 'sendToCustomLogic': {
				// Unwrap message
				const innerMsg = message.value;
				LogZsimCustomCode.log("UI: UIAPI.sendToCustomLogic: " + JSON.stringify(innerMsg));
				this.sendToCustomLogic(innerMsg);
				break;
			}
			case 'reloadCustomLogicAndUi': {
				// Clear any diagnostics
				DiagnosticsHandler.clear();
				// Reload the custom code
				const jsPath = this.simulator.zsim.customCode?.jsPath;
				if (jsPath) {
					// Can throw an error
					this.simulator.customCode.load(jsPath);
					this.simulator.customCode.execute();
				}
				// Initial html page.
				this.setHtml();
				// Wait until it is loaded
				await this.waitOnViewLoaded();
				// Send the initialization request.
				this.sendInit();
				// Inform custom code that UI is ready.
				this.simulator.customCode?.uiReady();
				break;
			}
			case 'log': {
				// Log a message
				const text = message.args.map(elem => elem.toString()).join(', ');
				LogZsimCustomCode.log("UI: " + text);
				break;
			}
			case 'countOfProcessedMessages':
				// For balancing the number of processed messages (since last time) is provided.;
				this.countOfOutstandingMessages -= message.value;
				Utility.assert(this.countOfOutstandingMessages >= 0);
				// For balancing: Remove request for procesing time
				if (this.countOfOutstandingMessages <= ZSimulationView.MESSAGE_LOW_WATERMARK) {
					this.simulator.setTimeoutRequest(false);
				}
				break;
			default:
				await super.webViewMessageReceived(message);
				break;
		}
	}


	/** A message is posted to the web view.
	 * Overwritten to count the number of messages for balancing.
	 * @param message The message. message.command should contain the command as a string.
	 * This needs to be evaluated inside the web view.
	 * @param baseView The webview to post to. Can be omitted, default is 'this'.
	 */
	protected sendMessageToWebView(message: any, baseView: BaseView = this) {
		this.countOfOutstandingMessages++;
		super.sendMessageToWebView(message, baseView);
		// For balancing: Ask for processing time if messages cannot be processed in time.
		if (this.countOfOutstandingMessages >= ZSimulationView.MESSAGE_HIGH_WATERMARK) {
			this.simulator.setTimeoutRequest(true);
		}
	}


	/** Called if the custom UI code wants to send something to the custom logic/the javascript code.
	 */
	protected sendToCustomLogic(msg: any) {
		this.simulator.customCode?.receivedFromCustomUi(msg);
	}


	/** Called on key press or key release.
	 * Sets/clears the corresponding port bits.
	 * @param key E.g. "key_Digit2", "key_KeyQ", "key_Enter", "key_Space", "key_Shift_Caps" (CAPS) or "key_Period_Symbol" (SYMBOL).
	 * @param on true=pressed, false=released
	 */
	protected keyChanged(key: string, on: boolean) {
		// Determine port
		let portHighBit;
		switch (key) {
			case 'key_Digit1':
			case 'key_Digit2':
			case 'key_Digit3':
			case 'key_Digit4':
			case 'key_Digit5':
				portHighBit = 3;
				break;
			case 'key_Digit6':
			case 'key_Digit7':
			case 'key_Digit8':
			case 'key_Digit9':
			case 'key_Digit0':
				portHighBit = 4;
				break;
			case 'key_KeyQ':
			case 'key_KeyW':
			case 'key_KeyE':
			case 'key_KeyR':
			case 'key_KeyT':
				portHighBit = 2;
				break;
			case 'key_KeyY':
			case 'key_KeyU':
			case 'key_KeyI':
			case 'key_KeyO':
			case 'key_KeyP':
				portHighBit = 5;
				break;
			case 'key_KeyA':
			case 'key_KeyS':
			case 'key_KeyD':
			case 'key_KeyF':
			case 'key_KeyG':
				portHighBit = 1;
				break;
			case 'key_KeyH':
			case 'key_KeyJ':
			case 'key_KeyK':
			case 'key_KeyL':
			case 'key_Enter':
				portHighBit = 6;
				break;
			case 'key_Shift_Caps':	// CAPS
			case 'key_KeyZ':
			case 'key_KeyX':
			case 'key_KeyC':
			case 'key_KeyV':
				portHighBit = 0;
				break;
			case 'key_KeyB':
			case 'key_KeyN':
			case 'key_KeyM':
			case 'key_Period_Symbol':	// SYMBOL
			case 'key_Space':
				portHighBit = 7;
				break;
			default:
				return;
		}

		// Determine bit
		let bit;
		switch (key) {
			case 'key_Shift_Caps':	// CAPS
			case 'key_KeyA':
			case 'key_KeyQ':
			case 'key_Digit1':
			case 'key_Digit0':
			case 'key_KeyP':
			case 'key_Enter':
			case 'key_Space':
				bit = 0b00001;
				break;
			case 'key_KeyZ':
			case 'key_KeyS':
			case 'key_KeyW':
			case 'key_Digit2':
			case 'key_Digit9':
			case 'key_KeyO':
			case 'key_KeyL':
			case 'key_Period_Symbol':	// SYMBOL
				bit = 0b00010;
				break;
			case 'key_KeyX':
			case 'key_KeyD':
			case 'key_KeyE':
			case 'key_Digit3':
			case 'key_Digit8':
			case 'key_KeyI':
			case 'key_KeyK':
			case 'key_KeyM':
				bit = 0b00100;
				break;
			case 'key_KeyC':
			case 'key_KeyF':
			case 'key_KeyR':
			case 'key_Digit4':
			case 'key_Digit7':
			case 'key_KeyU':
			case 'key_KeyJ':
			case 'key_KeyN':
				bit = 0b01000;
				break;
			case 'key_KeyV':
			case 'key_KeyG':
			case 'key_KeyT':
			case 'key_Digit5':
			case 'key_Digit6':
			case 'key_KeyY':
			case 'key_KeyH':
			case 'key_KeyB':
				bit = 0b10000;
				break;
			default:
				return;
		}

		// Send bits to keyboard
		this.simulator.zxKeyboard.setKey(portHighBit, bit, on);
	}


	/** Called if a bit for a port should change.
	 * @param port The port number.
	 * @param on true = bit should be set, false = bit should be cleared
	 * @param bitByte A byte with the right bit set.
	 */
	protected setPortBit(port: number, on: boolean, bitByte: number) {		// Get port value
		Utility.assert(this.lowAddressSimulatedPorts);
		let value = this.lowAddressSimulatedPorts.get(port)!;
		Utility.assert(value != undefined);
		if (on)
			value |= bitByte;
		else
			value &= ~bitByte;
		// And set
		this.lowAddressSimulatedPorts.set(port, value);
	}


	/** Do an update.
	 * E.g. send when the memory in a memory view has changed.
	 */

	public async update(_reason?: any): Promise<void> {
		// Update the display
		this.updateDisplay();
		// And also the screen
		this.updateScreen();
	}


	/** Updates the webview display.
	 * Everything but the ULA screen.
	 */
	public updateDisplay() {
		// Check if CPU did something
		const tStates = this.simulator.getPassedTstates();
		if (this.previousTstates == tStates)
			return;
		this.previousTstates = tStates;
		this.restartStopTimer();

		try {
			let cpuFreq, cpuLoad, simulationTooSlow, slots, slotNames, visualMem, audio, zxnDMA;

			// Update frequency
			if (this.prevCpuFreq !== this.simulator.z80Cpu.cpuFreq) {
				this.prevCpuFreq = this.simulator.z80Cpu.cpuFreq;
				cpuFreq = this.numberFormatter.format(this.prevCpuFreq) + 'Hz';
			}

			// Update cpuload
			if (this.simulator.zsim.cpuLoad > 0) {
				cpuLoad = (this.simulator.z80Cpu.cpuLoad * 100).toFixed(0);
				simulationTooSlow = this.simulator.simulationTooSlow;
			}

			// Visual Memory
			if (this.simulator.zsim.visualMemory) {
				slots = this.simulator.getSlots();
				const banks = this.simulator.memoryModel.getMemoryBanks(slots);
				slotNames = banks.map(bank => bank.name);
				visualMem = this.simulator.memory.getVisualMemory();
			}

			if (this.simulator.zsim.zxBeeper) {
				// Audio
				audio = this.simulator.getZxBeeperBuffer();
			}

			if (this.simulator.zxnDMA) {
				// DMA
				zxnDMA = this.simulator.zxnDMA.getState();
			}

			// Create message to update the webview
			const message = {
				command: 'update',
				cpuFreq,
				cpuLoad,
				simulationTooSlow,
				slotNames,
				visualMem,
				audio,
				zxnDMA
			};
			this.sendMessageToWebView(message);
			// Clear
			this.simulator.memory.clearVisualMemory();
		}
		catch {}
	}


	/** Gets the ULA screen from the simulator and sends it to the webview.
	 */
	protected updateScreen() {
		try {
			// The screen data
			const ulaScreen = this.simulator.zxUlaScreen;
			const ulaData = ulaScreen.getUlaScreen();

			// Create message to update the webview
			const message = {
				command: 'updateScreen',
				ulaData
			};
			this.sendMessageToWebView(message);
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
		// Set keyboard values
		const zsim = this.simulator.zsim;
		// Predefine with spectrum keyboard
		let zxKeybImg = "48k_kbd.svg";
		let zxKeybAspectRatio = 1378/538;
		let zxKeybKeyWidth = 7.4;
		let zxKeybKeyHeight = 15;
		let zxKeybKeyMarginRight = 1.8;
		let zxKeybOffY = 9.5;
		let zxKeybRowVertMargin = 10.5;
		let zxKeybRow1OffsX = 1.3;
		let zxKeybRow2OffsX = 6;
		let zxKeybRow3OffsX = 8.7;
		let zxKeybRow4OffsX = 2;
		let zxKeybShiftStyle = 'style="width: 9.6%"';
		let zxKeybSpaceStyle = 'style="width: 11.8%;margin-right: 0"';
		// Redefine for ZX81
		if (zsim.zxKeyboard === "zx81") {
			zxKeybImg = "zx81_kbd.svg";
			zxKeybAspectRatio = 512 / 186;
			zxKeybKeyWidth = 8.1;
			zxKeybKeyHeight = 17;
			zxKeybKeyMarginRight = 1.125;
			zxKeybOffY = 1.6;
			zxKeybRowVertMargin = 7.85;
			zxKeybRow1OffsX = 0.775;
			zxKeybRow2OffsX = 5.75;
			zxKeybRow3OffsX = 8.4;
			zxKeybRow4OffsX = 3.6;
			zxKeybShiftStyle = '';
			zxKeybSpaceStyle = '';
		}
		let html = `
			<head>
				<meta charset="utf-8">
				<base href="${vscodeResPath}/">
			</head>

			<html>

			<style>
			span {
				display: table-cell;
				vertical-align: middle;
			}

			.disabled {
				pointer-events: none; /* Disable mouse events */
				opacity: 0.5; /* Make the element look grayed out */
				cursor: not-allowed; /* Change the cursor to indicate the element is disabled */
			}

			.label-absolute-top {
				position: absolute;
				top: 2em;
			}

			.keyboard {
				position: relative;
				width: 100%;
				aspect-ratio: ${zxKeybAspectRatio};
				font-size: 0; /* Removes space between 2 spans */
				background-image: url('html/images/${zxKeybImg}');
				background-size: cover;
				/* border: 2px solid red; */
			}

			.hor-space {
				display: inline-block;
				margin: 0;
				padding: 0;
			}

			.key {
				display: inline-block;
				box-sizing: border-box;
				/* border: 2px solid red; */
				width: ${zxKeybKeyWidth}%;
				height:  ${zxKeybKeyHeight}%;
				margin-right: ${zxKeybKeyMarginRight}%;
				padding: 0;
			}

			.key-pressed {
				/*background-color: red;*/
				/*border: 2px solid red;*/
    			box-shadow: 0px 0px 20px 4px rgba(255, 255, 0, 1);
				background-color: rgba(255, 255, 0, 0.5);
			}

			</style>

			<script src="out/remotes/zsimulator/zsimwebview/main.js"></script>

			<body>
			`;

		// Setup the body
		const visualMemoryZxScreen = zsim.memoryModel.includes('ZX') && (!zsim.memoryModel.includes('81'));
		let initialBeeperValue = 0;
		if (this.simulator.zxBeeper)
			this.simulator.zxBeeper.getCurrentBeeperValue();
		let jsCustomCode = '';
		if (this.customUiPath) {
			try {
				jsCustomCode = readFileSync(this.customUiPath).toString();
			}
			catch (e) {
				jsCustomCode = "<b>Error: reading file '" + this.customUiPath + "':" + e.message + "</b>";
			}
		}

		// CPU frequency
		html += `
			<p>
			<!-- CPU frequency -->
				<label>CPU frequency:</label>
				<label id="cpu_freq_id">0</label>
			`;

		// CPU Load
		if (zsim.cpuLoad > 0) {
			html += `
			<!-- Z80 CPU load -->
				<label> - CPU load:</label>
				<label id="cpu_load_id" style="border-radius: 3px; padding: 2px">100</label>
				<label>%</label>
			`;
		}
		html += `
			</p>
			`;

		// Memory Pages / Visual Memory
		if (zsim.visualMemory) {
			html += `
			<!-- Visual Memory (memory activity) -->
			<!-- Legend, Slots -->
			<div style="position:relative; width:100%; height:4.5em;">
				<style>
					.border {
						outline: 1px solid var(--vscode-foreground);
						outline-offset: 0;
						height: 1em;
						position: absolute;
						text-align: center;
            			overflow: hidden;  /* clip */
					}
					.disabled {
						font-style: italic;
					}
					.slot {
						height: 2em;
						background: gray
					}
					.transparent {
						height: 2em;
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
				<label class="label-absolute-top" style="left:0%">0x0000</label>
				<label style="position:absolute; top:2em; left:12.5%">0x2000</label>`;
			// ZX screen memory marker
			if (visualMemoryZxScreen) {
				html += `
				<label style="position:absolute; top:1.1em; left:25%">0x4000</label>
				<label style="position:absolute; top:1.1em; left:35.5%">0x5B00</label>`;
			}
			else {
				html += `
				<label class="label-absolute-top" style="left:25%">0x4000</label>`;
			}

			html += `
			<label class="label-absolute-top" style="left:37.5%">0x6000</label>
			<label class="label-absolute-top" style="left:50%">0x8000</label>
			<label class="label-absolute-top" style="left:62.5%">0xA000</label>
			<label class="label-absolute-top" style="left:75%">0xC000</label>
			<label class="label-absolute-top" style="left:87.5%">0xE000</label>

			<!-- Marker ticks -->
			<span class="border" style="top: 3em; left:0%; height: 1.7em"></span>
			<span class="border" style="top: 3em; left:12.5%; height:1em;"></span>`;
			if (visualMemoryZxScreen) {
				// ZX screen memory marker
				html += `
				<span class="border" style="top: 2.0em; left:25%; height:2.5em;"></span>
				<span class="border" style="top: 2.0em; left:34.4%; height:2.5em;"></span> <!-- 0x5800 -->
				<span class="border" style="top: 2.0em; left:35.5%; height:2.5em;"></span> <!-- 0x5B00 -->`;
			}
			else {
				// ZX screen memory marker
				html += `
				<span class="border" style="top: 3em; left:25%; height:1em;"></span>`;
			}

			html += `
			<span class="border" style="top: 3em; left:37.5%; height:1em;"></span>
			<span class="border" style="top: 3em; left:50%; height:1em;"></span>
			<span class="border" style="top: 3em; left:62.5%; height:1em;"></span>
			<span class="border" style="top: 3em; left:75%; height:1em;"></span>
			<span class="border" style="top: 3em; left:87.5%; height:1em;"></span>
		`;
			if (visualMemoryZxScreen) {
				// Markers for display
				html += `
				<!-- Extra "Screen" range display -->
				<div class="border slot" style="top:2.2em; left:25%; width:9.4%;">SCREEN</div>
				<div class="border slot" style="top:2.2em; left:34.4%; width:1.1%;"></div>`;
			}

			html += `
			<!-- Visual memory image, is mainly transparent and put on top -->
			<canvas class="slot" width="256" height="1" id="visual_mem_img_id" style="image-rendering:pixelated; position:absolute; top:3.5em; left:0; width:100%;"></canvas>

			<!-- Slots  2nd -->
			`;

			const slotRanges = this.simulator.memoryModel.slotRanges;
			const count = slotRanges.length;
			for (let i = 0; i < count; i++) {
				const slotRange = slotRanges[i];
				const pos = slotRange.start * 100 / 0x10000;
				const width = (slotRange.end + 1 - slotRange.start) * 100 / 0x10000;
				const add = `<div class="border" id="slot${i}_id" style="top:3.5em; left:${pos}%; width:${width}%; height: 2em;"></div>
			`;
				html += add;
			}

			html += `
			</div>
			<br><br>
			`;
		}


		// Add code for the screen (Spectrum or ZX81)
		if (zsim.ulaScreen) {
			// HTML code. Note: the canvas width and hide is just very preliminary.
			// It will be set by the UlaDraw classes.
			html += `
			<!-- Display the screen gif -->
			<canvas id="screen_img_id" width="256" height="192" style="image-rendering:pixelated; outline: 1px solid var(--vscode-foreground); width:100%; height:100%; box-sizing: border-box;">
			</canvas>
			`;
		}

		// Add code for the ZX beeper
		if (zsim.zxBeeper) {
			html += `
			<details open="true">
			<summary>ZX Beeper</summary>
			<span>
				<img src="assets/loudspeaker.svg" width="20em"></img>
				&nbsp;
			</span>

			<!-- 0/1 visual output -->
			<span id="beeper.output" style="display:table-cell; vertical-align: middle; width: 4em">${initialBeeperValue.toString()}</span>

			<!-- Volume slider -->
			<span style="display:table-cell; vertical-align: middle;">-</span>

			<span>
				<input id="audio.volume" type="range" min="0" max="1" step="0.01" value="0" oninput="volumeChanged(parseFloat(this.value))">
			</span>
			<span>+</span>

			</details>
			`;
		}

		// Add code for the DMA
		if (zsim.zxnDMA) {
			html += `
			<details open="true">
			<summary>zxnDMA</summary>

			<div style="padding-left: 1em;">
				<!-- DMA Activated/Stopped-->
				<div style="white-space: nowrap;">
					<span>DMA&nbsp;</span>
					<span id="zxnDMA.dmaActive"></span>
				</div>

				<!-- Port A/B Start, length -->
				<div style="white-space: nowrap;">
					<span>Port A Start=</span>
					<span id="zxnDMA.portAstartAddress"></span>
					<span>&nbsp;</span>
					<span id="zxnDMA.transferDirectionPortAtoB"></span>
					<span>&nbsp;</span>
					<span>Port B Start=</span>
					<span id="zxnDMA.portBstartAddress"></span>
					<span>,&nbsp;</span>
					<span>Block Length=</span>
					<span id="zxnDMA.blockLength"></span>
				</div>

				<!-- Port A/B Counter, Block Counter -->
				<div style="white-space: nowrap;" title="The current valuues">
					<span>Port A Address=</span>
					<span id="zxnDMA.portAaddressCounter"></span>
					<span>,&nbsp;</span>
					<span>Port B Address=</span>
					<span id="zxnDMA.portBaddressCounter"></span>
					<span>,&nbsp;</span>
					<span>Block Counter=</span>
					<span id="zxnDMA.blockCounter"></span>
				</div>

				<!-- Port A: memory/io, increment, cycle -->
				<div style="white-space: nowrap;">
					<span>Port A:&nbsp;</span>
					<span id="zxnDMA.portAmode"></span>
					<span>,&nbsp;</span>
					<span>Increment=</span>
					<span id="zxnDMA.portAadd"></span>
					<span>,&nbsp;</span>
					<span>Cycle length=</span>
					<span id="zxnDMA.portAcycleLength"></span>
				</div>

				<!-- Port B: memory/io, increment, cycle -->
				<div style="white-space: nowrap;">
					<span>Port B:&nbsp;</span>
					<span id="zxnDMA.portBmode"></span>
					<span>,&nbsp;</span>
					<span>Increment=</span>
					<span id="zxnDMA.portBadd"></span>
					<span>,&nbsp;</span>
					<span>Cycle length=</span>
					<span id="zxnDMA.portBcycleLength"></span>
				</div>

				<!-- Mode, pre-scalar, auto-restart -->
				<div style="white-space: nowrap;">
					<span>Mode:&nbsp;</span>
					<span id="zxnDMA.mode"></span>
					<span>,&nbsp;</span>
					<span>Prescalar=</span>
					<span id="zxnDMA.zxnPrescalar"></span>
					<span>,&nbsp;</span>
					<span>EOB-action=</span>
					<span id="zxnDMA.eobAction"></span>
				</div>

				<!-- Status Byte -->
				<div style="white-space: nowrap;">
					<span>Status Byte:&nbsp;</span>
					<span><ui-byte id="zxnDMA.statusByte" bytevalue="33" oncolor="white" offcolor="gray" digitvalue="0" title="Bit 0: T = 1 if at least one byte has been transferred\nBit 5: E = 0 if total block length at least transferred once" />
					</span>
				</div>

				<!-- Read Mask, last sequence bit -->
				<div style="white-space: nowrap;">
					<span>Read Mask:&nbsp;</span>
					<span><ui-byte id="zxnDMA.readMask" numberofbits="7" bytevalue="0" digitvalue="0" title="Last read bit is highlighted.\nBit 0: Status Byte\nBit 1: Block Counter Low\nBit 2: Block Counter High\nBit 3: Port A Address Low\nBit 4: Port A Address High\nBit 5: Port B Address Low\nBit 6: Port B Address High" />
					</span>
				</div>

				<!-- Last Operation -->
				<div style="white-space: nowrap;">
					<span>Last Operation:&nbsp;</span>
					<span id="zxnDMA.lastOperation"></span>
				</div>

			</div>

			</details>
			<br>
			`;
		}


		// Add code for the keyboard
		if (zsim.zxKeyboard !== 'none') {
			html += `
			<!-- Keyboard -->
			<details open="true">
			<summary>ZX Keyboard</summary>

			<div class="keyboard">
				<div style="height: ${zxKeybOffY}%"></div>
					<span class="hor-space" style="width: ${zxKeybRow1OffsX}%"></span>
					<span id="key_Digit1" class="key" onClick="cellClicked(this)"></span>
					<span id="key_Digit2" class="key" onClick="cellClicked(this)"></span>
					<span id="key_Digit3" class="key" onClick="cellClicked(this)"></span>
					<span id="key_Digit4" class="key" onClick="cellClicked(this)"></span>
					<span id="key_Digit5" class="key" onClick="cellClicked(this)"></span>
					<span id="key_Digit6" class="key" onClick="cellClicked(this)"></span>
					<span id="key_Digit7" class="key" onClick="cellClicked(this)"></span>
					<span id="key_Digit8" class="key" onClick="cellClicked(this)"></span>
					<span id="key_Digit9" class="key" onClick="cellClicked(this)"></span>
					<span id="key_Digit0" class="key" onClick="cellClicked(this)"></span>
				<div style="height: ${zxKeybRowVertMargin}%"></div>
					<span class="hor-space" style="width: ${zxKeybRow2OffsX}%"></span>
					<span id="key_KeyQ" class="key" onClick="cellClicked(this)"></span>
					<span id="key_KeyW" class="key" onClick="cellClicked(this)"></span>
					<span id="key_KeyE" class="key" onClick="cellClicked(this)"></span>
					<span id="key_KeyR" class="key" onClick="cellClicked(this)"></span>
					<span id="key_KeyT" class="key" onClick="cellClicked(this)"></span>
					<span id="key_KeyY" class="key" onClick="cellClicked(this)"></span>
					<span id="key_KeyU" class="key" onClick="cellClicked(this)"></span>
					<span id="key_KeyI" class="key" onClick="cellClicked(this)"></span>
					<span id="key_KeyO" class="key" onClick="cellClicked(this)"></span>
					<span id="key_KeyP" class="key" onClick="cellClicked(this)"></span>
				<div style="height: ${zxKeybRowVertMargin}%"></div>
					<span class="hor-space" style="width: ${zxKeybRow3OffsX}%"></span>
					<span id="key_KeyA" class="key" onClick="cellClicked(this)"></span>
					<span id="key_KeyS" class="key" onClick="cellClicked(this)"></span>
					<span id="key_KeyD" class="key" onClick="cellClicked(this)"></span>
					<span id="key_KeyF" class="key" onClick="cellClicked(this)"></span>
					<span id="key_KeyG" class="key" onClick="cellClicked(this)"></span>
					<span id="key_KeyH" class="key" onClick="cellClicked(this)"></span>
					<span id="key_KeyJ" class="key" onClick="cellClicked(this)"></span>
					<span id="key_KeyK" class="key" onClick="cellClicked(this)"></span>
					<span id="key_KeyL" class="key" onClick="cellClicked(this)"></span>
					<span id="key_Enter" class="key" onClick="cellClicked(this)" style="margin-right: 0"></span>
				<div style="height: ${zxKeybRowVertMargin}%"></div>
					<span class="hor-space" style="width: ${zxKeybRow4OffsX}%"></span>
					<span id="key_Shift_Caps" class="key" onClick="cellClicked(this)" ${zxKeybShiftStyle}"></span>
					<span id="key_KeyZ" class="key" onClick="cellClicked(this)"></span>
					<span id="key_KeyX" class="key" onClick="cellClicked(this)"></span>
					<span id="key_KeyC" class="key" onClick="cellClicked(this)"></span>
					<span id="key_KeyV" class="key" onClick="cellClicked(this)"></span>
					<span id="key_KeyB" class="key" onClick="cellClicked(this)"></span>
					<span id="key_KeyN" class="key" onClick="cellClicked(this)"></span>
					<span id="key_KeyM" class="key" onClick="cellClicked(this)"></span>
					<span id="key_Period_Symbol" class="key" onClick="cellClicked(this)"></span>
					<span id="key_Space" class="key" onClick="cellClicked(this)" ${zxKeybSpaceStyle}></span>
			</div>
		</details>
		`;
		}

		// Add code for the Interface 2 joysticks
		if (zsim.zxInterface2Joy) {
			html += `
			<!-- ZX Interface 2 Joysticks -->
			<details open="true">
			<summary>ZX Interface 2 Joysticks</summary>

			<table>
				<tr>
				<td>
				<table style="color:black;" oncolor="red" offcolor="white">
					<tr>
						<td>
							<ui-bit id="if2.joy1.fire" style="border-radius:1em;" onchange="sendKeyBit(this, 4, 0x01)">F</ui-bit>
						</td>
						<td align="center">
							<ui-bit id="if2.joy1.up" onchange="sendKeyBit(this, 4, 0x02)">U</ui-bit>
						</td>
					</tr>
					<tr>
						<td>
							<ui-bit id="if2.joy1.left" onchange="sendKeyBit(this, 4, 0x10)">L</ui-bit>
						</td>
						<td style="color:var(--vscode-editor-foreground)">Joy1</td>
						<td>
							<ui-bit id="if2.joy1.right" onchange="sendKeyBit(this, 4, 0x08)">R</ui-bit>
						</td>
					</tr>
					<tr>
						<td></td>
						<td align="center">
							<ui-bit id="if2.joy1.down" onchange="sendKeyBit(this, 4, 0x04)">D</ui-bit>
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
							<ui-bit id="if2.joy2.fire" style="border-radius:1em;" onchange="sendKeyBit(this, 3, 0x10)">F</ui-bit>
						</td>
						<td align="center">
							<ui-bit id="if2.joy2.up" onchange="sendKeyBit(this, 3, 0x08)">U</ui-bit>
						</td>
					</tr>
					<tr>
						<td>
							<ui-bit id="if2.joy2.left" onchange="sendKeyBit(this, 3, 0x01)">L</ui-bit>
						</td>
						<td style="color:var(--vscode-editor-foreground)">Joy2</td>
						<td>
							<ui-bit id="if2.joy2.right" onchange="sendKeyBit(this, 3, 0x02)">R</ui-bit>
						</td>
					</tr>
					<tr>
						<td></td>
						<td align="center">
							<ui-bit id="if2.joy2.down" onchange="sendKeyBit(this, 3, 0x04)">D</ui-bit>
						</td>
					</tr>
				</table>
				</td>
				</tr>
			</table>

			</details>
			`;
		}


		// Add code for the Kempston joystick
		if (zsim.kempstonJoy) {
			html += `
			<!-- Kempston Joystick -->
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
			`;
		}


		// Adding code for custom joystick
		const cJoy = zsim.customJoy;
		if (cJoy) {
			html += `
			<!-- Custom Joystick -->
			<details open="true">
			<summary>Custom Joystick</summary>

			<table>
				<tr>
				<td>
				<table style="color:black;" oncolor="red" offcolor="white">
					<tr>
						<td>
							<ui-bit id="customJoy.joy1.fire"
							${cJoy.fire ? '' : 'class="disabled"'}
							style="border-radius:1em;" onchange="sendJoyButton(this)">F</ui-bit>
						</td>
						<td align="center">
							<ui-bit id="customJoy.joy1.up"
							${cJoy.up ? '' : 'class="disabled"'}
							 onchange="sendJoyButton(this)">U</ui-bit>
						</td>
						<td>
							<ui-bit id="customJoy.joy1.fire2"
							${cJoy.fire2 ? '' : 'class="disabled"'}style="border-radius:1em;" onchange="sendJoyButton(this)">2</ui-bit>
						</td>
						<td>
							<ui-bit id="customJoy.joy1.fire3"
							${cJoy.fire3 ? '' : 'class="disabled"'}style="border-radius:1em;" onchange="sendJoyButton(this)">3</ui-bit>
						</td>
						<td>
							<ui-bit id="customJoy.joy1.fire4"
							${cJoy.fire4 ? '' : 'class="disabled"'}style="border-radius:1em;" onchange="sendJoyButton(this)">4</ui-bit>
						</td>
					</tr>
					<tr>
						<td>
							<ui-bit id="customJoy.joy1.left"
							${cJoy.left ? '' : 'class="disabled"'}onchange="sendJoyButton(this)">L</ui-bit>
						</td>
						<td></td>
						<td>
							<ui-bit id="customJoy.joy1.right"
							${cJoy.right ? '' : 'class="disabled"'}onchange="sendJoyButton(this)">R</ui-bit>
						</td>
					</tr>
					<tr>
						<td></td>
						<td align="center">
							<ui-bit id="customJoy.joy1.down"
							${cJoy.down ? '' : 'class="disabled"'}onchange="sendJoyButton(this)">D</ui-bit>
						</td>
					</tr>
				</table>
				</td>

				</table>
				</td>
				</tr>
			</table>

			</details>
			`;
		}


		// Space for logging
		html += `
		<p id="log"></p>
		`;

		// Custom javascript code area
		if (jsCustomCode) {
			html += `
			<!-- Room for extra/user editable javascript/html code -->
			<p>
				<div id="js_code_id">
				${jsCustomCode}
				</div>
			</p>
			`;
		}

		if (zsim.customCode.debug) {
			html += `
			<!-- Debug Area -->
			<hr>

			<details open="true">
				<summary>Debug Area</summary>
				<button onclick="reloadCustomLogicAndUi()">Reload Custom Logic and UI</button>
				&nbsp;&nbsp;
				<button onclick="copyHtmlToClipboard()">Copy all HTML to clipboard</button>
			</details>
			`;
		}

		// End
		html += `
			</body>
			</html>
			`;

		this.vscodePanel.webview.html = '';	// This is important to clear also the custom code.
		this.vscodePanel.webview.html = html;
	}


	/** Sends the initialization message to the webview just after the 'loaded' has been received.
	 */
	protected sendInit() {
		const zsim = this.simulator.zsim;
		// Is sent only once, just after the webview initially loads.
		let volume = GlobalStorage.Get<number>('audio.volume');
		if (volume === undefined)
			volume = 0.75;
		const sendMsg = {
			command: 'init',
			audioSampleRate: zsim.audioSampleRate,
			zxKeyboard: zsim.zxKeyboard,
			volume,
			ulaScreen: zsim.ulaScreen,
			ulaOptions: zsim.ulaOptions
		};
		this.sendMessageToWebView(sendMsg);
	}
}

