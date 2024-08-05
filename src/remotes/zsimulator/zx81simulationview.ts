import * as vscode from 'vscode';
import {BaseView} from '../../views/baseview';
import {ZSimRemote} from './zsimremote';
import {Settings} from '../../settings/settings';
import {Utility} from '../../misc/utility';
import {LogZsimCustomCode} from '../../log';
import {readFileSync} from 'fs';
import {DiagnosticsHandler} from '../../diagnosticshandler';

// It would be better to have a commom ancestor for ZX81SimulationView and ZSimulationView, but it would
// change the structure of the code and I do not want to touch it as much as I can.
// So several methods are duplicated here.

/**
 * A Webview that shows the simulated peripherals.
 * E.g. in case of the ZX81 the ULA screen or the keyboard.
 */
export class ZX81SimulationView extends BaseView {
	// The max. number of message in the queue. If reached the ZX81SimulationView will ask
	// for processing time.
	static MESSAGE_HIGH_WATERMARK = 100;
	static MESSAGE_LOW_WATERMARK = 10;

	// The previous value for the cpu frequency, used to check on a change.
	protected prevCpuFreq: number;

	// A map to hold the values of the simulated ports.
	protected simulatedPorts: Map<number, number>;	// Port <-> value

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

	// Set by the vertSync event: The last sync time.
	protected lastVertSyncTime: number;


	// Stores the last T-states value.
	// Used to check for changes.
	protected previousTstates: number;

	// Used to determine when the web view ahs been loaded.
	protected resolveLoaded: () => void;

	// To create human readable numbers.
	protected numberFormatter = new Intl.NumberFormat('en', {notation: 'compact', compactDisplay: 'short'});


	/**
	 * Creates the basic view.
	 * @param memory The memory of the CPU.
	 */
	constructor(simulator: ZSimRemote) {
		super(false);
		// Init
		this.simulator = simulator;
		this.countOfOutstandingMessages = 0;
		this.displayTime = 1000 / Settings.launch.zsim.updateFrequency;
		this.displayTimer = undefined as any;
		this.displayTime = 1000 / Settings.launch.zsim.updateFrequency;
		this.displayTimer = undefined as any;
		this.stopTime = 2 * this.displayTime;
		if (this.stopTime < 500)
			this.stopTime = 500;	// At least 500 ms
		this.stopTimer = undefined as any;
		this.previousTstates = -1;

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

		// Set callbacks for all simulated ports.
		for (const [simPort,] of this.simulatedPorts) {
			this.simulator.ports.registerSpecificInPortFunction(simPort, (port: number) => {
				const value = this.simulatedPorts.get(port)!;
				return value;
			});
		}

		// Add title
		Utility.assert(this.vscodePanel);
		this.vscodePanel.title = 'ZX81 Simulator - ' + Settings.launch.zsim.memoryModel;

		// Read path for additional javascript code
		this.customUiPath = Settings.launch.zsim.customCode.uiPath;
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
			this.previousTstates = -1;
		});

		// Close
		this.simulator.once('closed', () => {
			this.close();
		});

		// Handle vertical sync
		this.simulator.on('vertSync', () => {
			this.vertSync();
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
		this.lastVertSyncTime = nowTime;
		this.nextUpdateTime = nowTime + this.displayTime;
		// Start timer
		this.displayTimer = setInterval(() => {
			// Update
			this.updateDisplay();
			// Get current time
			const currentTime = Date.now();
			this.lastVertSyncTime = currentTime;
			this.nextUpdateTime = currentTime + this.displayTime;
		}, this.displayTime);	// in ms
	}


	/**
	 * A vertical sync was received from the Z80 simulation.
	 * Is used to sync the display as best as possible:
	 * On update the next time is stored (nextUpdateTime).
	 * The lastVertSyncTime is stored with the current time.
	 * On next vert sync the diff to lastVertSyncTime is calculated and extrapolated.
	 * If the next time would be later as the next regular update, then the update is
	 * done earlier and the timer restarted.
	 * I.e. the last vert sync before the regular update is used for synched display.
	 */
	protected vertSync() {
		//Log.log("vertSync");
		// Get current time
		const currentTime = Date.now();
		// Diff to last vertical sync
		const diff = currentTime - this.lastVertSyncTime;
		this.lastVertSyncTime = currentTime;
		// Extrapolate
		if (currentTime + diff > this.nextUpdateTime) {
			//Log.log("vertSync: do update");
			// Do the update earlier, now at the vert sync
			this.updateDisplay();
			// Restart timer
			this.startDisplayTimer();
		}
	}


	/**
	 * Closes the view.
	 */
	public close() {
		this.vscodePanel?.dispose();
	}


	/**
	 * Dispose the view (called e.g. on close).
	 * Use this to clean up additional stuff.
	 * Normally not required.
	 */
	public disposeView() {
		clearInterval(this.displayTimer);
		this.displayTimer = undefined as any;
		// Do not use panel anymore
		this.vscodePanel = undefined as any;
	}


	/**
	 * The web view posted a message to this view.
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
				this.keyChanged(message.key, message.shift, message.value); // @zx81 Add shft
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
				const jsPath = Settings.launch.zsim.customCode?.jsPath;
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
				if (this.countOfOutstandingMessages <= ZX81SimulationView.MESSAGE_LOW_WATERMARK) {
					this.simulator.setTimeoutRequest(false);
				}
				break;

			default:
				await super.webViewMessageReceived(message);
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
	protected sendMessageToWebView(message: any, baseView: BaseView = this) {
		this.countOfOutstandingMessages++;
		super.sendMessageToWebView(message, baseView);
		// For balancing: Ask for processing time if messages cannot be processed in time.
		if (this.countOfOutstandingMessages >= ZX81SimulationView.MESSAGE_HIGH_WATERMARK) {
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
	 * @param key E.g. "Digit2", "KeyQ", "Enter", "Space", "ShiftLeft" (CAPS) or "ShiftRight" (SYMBOL).
	 * @param shift true: pressed, false: released. @zx81
	 * @param on true=pressed, false=released
	 */
	protected keyChanged(key: string, shift: boolean, on: boolean) {
		// Determine port
		let port;
		switch (key) {
			case 'Digit1':
			case 'Digit2':
			case 'Digit3':
			case 'Digit4':
			case 'Digit5':
				port = 0xF7FE;
				break;
			case 'Digit6':
			case 'Digit7':
			case 'Digit8':
			case 'Digit9':
			case 'Digit0':
				port = 0xEFFE;
				break;
			case 'KeyQ':
			case 'KeyW':
			case 'KeyE':
			case 'KeyR':
			case 'KeyT':
				port = 0xFBFE;
				break;
			case 'KeyY':
			case 'KeyU':
			case 'KeyI':
			case 'KeyO':
			case 'KeyP':
				port = 0xDFFE;
				break;
			case 'KeyA':
			case 'KeyS':
			case 'KeyD':
			case 'KeyF':
			case 'KeyG':
				port = 0xFDFE;
				break;
			case 'KeyH':
			case 'KeyJ':
			case 'KeyK':
			case 'KeyL':
			case 'Enter':
				port = 0xBFFE;
				break;
			// case 'ShiftLeft':	// CAPS not for @zx81
			case 'KeyZ':
			case 'KeyX':
			case 'KeyC':
			case 'KeyV':
				port = 0xFEFE;
				break;
			case 'KeyB':
			case 'KeyN':
			case 'KeyM':
			// case 'ShiftRight':	// SYMBOL not for @zx81
			case 'Period': // for @zx81
			case 'Space':
				port = 0x7FFE;
				break;
			default:
				Utility.assert(false);
		}
		Utility.assert(port);

		// Determine bit
		let bit;
		switch (key) {
			// case 'ShiftLeft':	// CAPS not for @zx81
			case 'KeyA':
			case 'KeyQ':
			case 'Digit1':
			case 'Digit0':
			case 'KeyP':
			case 'Enter':
			case 'Space':
				bit = 0b00001;
				break;
			case 'KeyZ':
			case 'KeyS':
			case 'KeyW':
			case 'Digit2':
			case 'Digit9':
			case 'KeyO':
			case 'KeyL':
			// case 'ShiftRight':	// SYMBOL not for @zx81
			case 'Period': // for @zx81
				bit = 0b00010;
				break;
			case 'KeyX':
			case 'KeyD':
			case 'KeyE':
			case 'Digit3':
			case 'Digit8':
			case 'KeyI':
			case 'KeyK':
			case 'KeyM':
				bit = 0b00100;
				break;
			case 'KeyC':
			case 'KeyF':
			case 'KeyR':
			case 'Digit4':
			case 'Digit7':
			case 'KeyU':
			case 'KeyJ':
			case 'KeyN':
				bit = 0b01000;
				break;
			case 'KeyV':
			case 'KeyG':
			case 'KeyT':
			case 'Digit5':
			case 'Digit6':
			case 'KeyY':
			case 'KeyH':
			case 'KeyB':
				bit = 0b10000;
				break;
			default:
				Utility.assert(false);
		}
		Utility.assert(bit);

		// @zx81 Special case for the Shift key. If on same port, add the bit.
		if(shift && port === 0xFE) bit |= 0b00001;

		// Get port value
		Utility.assert(this.simulatedPorts);
		let value = this.simulatedPorts.get(port)!;
		Utility.assert(value != undefined);
		if (on)
			value &= ~bit;
		else
			value |= bit;
		// And set
		this.simulatedPorts.set(port, value);

		// @zx81 Special case for the Shift key. If not on same port, update the shift port
		if(shift && port !== 0xFE) {
			value = this.simulatedPorts.get(0xFEFE)!;
			this.simulatedPorts.set(0xFEFE, on ? value & 0b11110 : value | 0b00001);		
		}
	}

	/**
	 * Retrieves the screen memory content and displays it.
	 * @param reason Not used.
	 */
	public async updateDisplay() {
		// Check if CPU did something
		const tStates = this.simulator.getPassedTstates();
		if (this.previousTstates == tStates)
			return;
		this.previousTstates = tStates;
		this.restartStopTimer();

		try {
			let cpuFreq, cpuLoad, slots, slotNames, visualMem, romChars, dfile;

			// Update frequency
			if (this.prevCpuFreq !== this.simulator.z80Cpu.cpuFreq) {
				this.prevCpuFreq = this.simulator.z80Cpu.cpuFreq;
				cpuFreq = this.numberFormatter.format(this.prevCpuFreq) + 'Hz';
			}

			// Update cpuload
			if (Settings.launch.zsim.cpuLoadInterruptRange > 0)
				cpuLoad = (this.simulator.z80Cpu.cpuLoad * 100).toFixed(0).toString();

			// Visual Memory
			if (Settings.launch.zsim.visualMemory) {
				slots = this.simulator.getSlots();
				const banks = this.simulator.memoryModel.getMemoryBanks(slots);
				slotNames = banks.map(bank => bank.name);
				visualMem = this.simulator.memory.getVisualMemory();
			}

			if (Settings.launch.zsim.ulaScreen) {
				romChars = await this.simulator.getZX81RomCharacters();
				dfile = await this.simulator.getZX81DFile();
			}

			// Create message to update the webview
			const message = {
				command: 'update',
				cpuFreq,
				cpuLoad,
				slotNames,
				visualMem,
				romChars,
				dfile
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

		let html = `
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
			span {
			display: table-cell;
			vertical-align: middle;
			}

			.keyboard {
			width: 95%;
			max-width: 800px;
			border-style: solid;
			border-width: 2px;
			border-color: black;
			}
			.focus {
			border-color: greenyellow;
			}
			.display {
			image-rendering: pixelated;
			border:${Settings.launch.zsim.zxBorderWidth}px solid white;
			outline: 1px solid var(--vscode-foreground);
			width: 95%;
			max-width: 800px;
			}
			</style>

			<script src="out/remotes/zsimulator/zx81simwebview/main.js"></script>

			<body>
			`;

		// Setup the body
		const zsim = Settings.launch.zsim;
		const visualMemoryZxScreen = zsim.memoryModel.includes("ZX");
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
		if (zsim.cpuLoadInterruptRange > 0) {
			html += `
			<!-- Z80 CPU load -->
				<label> - CPU load:</label>
				<label id="cpu_load_id">100</label>
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
						height:1em;
						position:absolute;
						text-align: center;
					}
					.disabled {
						font-style: italic;
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
			if (visualMemoryZxScreen) {
				html += `
				<label style="position:absolute; top:1.1em; left:25%">0x4000</label>
				<label style="position:absolute; top:1.1em; left:35.5%">0x5B00</label>`;
			}
			else {
				html += `
				<label style="position:absolute; top:2em; left:25%">0x4000</label>`;
			}

			html += `
			<label style="position:absolute; top:2em; left:37.5%">0x6000</label>
			<label style="position:absolute; top:2em; left:50%">0x8000</label>
			<label style="position:absolute; top:2em; left:62.5%">0xA000</label>
			<label style="position:absolute; top:2em; left:75%">0xC000</label>
			<label style="position:absolute; top:2em; left:87.5%">0xE000</label>

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
				const add = `<div class="border" id="slot${i}_id" style="top:3.5em; left:${pos}%; width:${width}%; height: 2em"></div>
			`;
				html += add;
			}

			html += `
			</div>
			<br><br>
			`;
		}


		// Add code for the screen
		if (zsim.ulaScreen) {
			html += `
			<!-- Display the screen gif -->
			<canvas id="screen_img_id" class="display" width="256" height="192">
			</canvas>
			`;
		}


		// Add code for the keyboard
		if (zsim.zxKeyboard) {
			html += `
			<!-- Keyboard -->
			<details open="true">
			<summary>ZX Keyboard</summary>

			<img id="keyboard" class="keyboard" src="assets/ZX81_keyboard.png" alt="ZX81 Keyboard">
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
		const sendMsg = {
			command: 'init'
		};
		this.sendMessageToWebView(sendMsg);
	}
}

