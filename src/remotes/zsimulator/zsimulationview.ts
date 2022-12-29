import * as vscode from 'vscode';
import {BaseView} from '../../views/baseview';
import {ZSimRemote} from './zsimremote';
import {Settings} from '../../settings/settings';
import {Utility} from '../../misc/utility';
import {LogCustomCode} from '../../log';
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
		else {
			// If keyboard id not defined, check for ZX Interface 2
			if (Settings.launch.zsim.zxInterface2Joy) {
				// Prepare all used ports
				this.simulatedPorts.set(0xF7FE, 0xFF);	// Joystick 2 (left): Bits: xxxLRDUF, low active, keys 1-5
				this.simulatedPorts.set(0xEFFE, 0xFF);	// Joystick 1 (right): Bits: xxxFUDRL, low active, keys 6-0

				// Set call backs
				for (const [simPort,] of this.simulatedPorts) {
					this.simulator.ports.registerSpecificInPortFunction(simPort, (port: number) => {
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
		for (const [simPort,] of this.simulatedPorts) {
			this.simulator.ports.registerSpecificInPortFunction(simPort, (port: number) => {
				const value = this.simulatedPorts.get(port)!;
				return value;
			});
		}


		// Add title
		Utility.assert(this.vscodePanel);
		this.vscodePanel.title = 'Z80 Simulator - ' + Settings.launch.zsim.memoryModel;

		// Read path for additional javascript code
		this.customUiPath = Settings.launch.zsim.customCode.uiPath;

		// Initial html page.
		this.setHtml();
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
		this.simulator.on('vertSync', async () => {
			this.vertSync();
		});

		// Handle custom code messages
		this.simulator.customCode?.on('sendToCustomUi', (message: any) => {
			LogCustomCode.log('UI: UIAPI.receivedFromCustomLogic: ' + JSON.stringify(message));
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
		this.vscodePanel.dispose();
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
			case 'warning':
				// A warning has been received, e.g. sample rate was not possible.
				const warningText = message.text;
				vscode.window.showWarningMessage(warningText);
				break;
			case 'keyChanged':
				this.keyChanged(message.key, message.value);
				break;
			case 'volumeChanged':
				GlobalStorage.Set('audio.volume', message.value);
				break;
			case 'portBit':
				this.setPortBit(message.value.port, message.value.on, message.value.bitByte);
				break;
			case 'sendToCustomLogic':
				// Unwrap message
				const innerMsg = message.value;
				LogCustomCode.log("UI: UIAPI.sendToCustomLogic: " + JSON.stringify(innerMsg));
				this.sendToCustomLogic(innerMsg);
				break;
			case 'reloadCustomLogicAndUi':
				// Clear any diagnostics
				DiagnosticsHandler.clear();
				// Reload the custom code
				const jsPath = Settings.launch.zsim.customCode?.jsPath;
				if (jsPath) {
					// Can throw an error
					this.simulator.customCode.load(jsPath);
					this.simulator.customCode.execute();
				}
				// Reload the custom UI code
				this.setHtml();
				// Inform custom code that UI is ready.
				this.simulator.customCode?.uiReady();
				break;
			case 'log':
				// Log a message
				const text = message.args.map(elem => elem.toString()).join(', ');
				LogCustomCode.log("UI: " + text);
				break;
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
		if (this.countOfOutstandingMessages >= ZSimulationView.MESSAGE_HIGH_WATERMARK) {
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
				port = 0xF7FE;
				break;
			case 'key_Digit6':
			case 'key_Digit7':
			case 'key_Digit8':
			case 'key_Digit9':
			case 'key_Digit0':
				port = 0xEFFE;
				break;
			case 'key_KeyQ':
			case 'key_KeyW':
			case 'key_KeyE':
			case 'key_KeyR':
			case 'key_KeyT':
				port = 0xFBFE;
				break;
			case 'key_KeyY':
			case 'key_KeyU':
			case 'key_KeyI':
			case 'key_KeyO':
			case 'key_KeyP':
				port = 0xDFFE;
				break;
			case 'key_KeyA':
			case 'key_KeyS':
			case 'key_KeyD':
			case 'key_KeyF':
			case 'key_KeyG':
				port = 0xFDFE;
				break;
			case 'key_KeyH':
			case 'key_KeyJ':
			case 'key_KeyK':
			case 'key_KeyL':
			case 'key_Enter':
				port = 0xBFFE;
				break;
			case 'key_ShiftLeft':	// CAPS
			case 'key_KeyZ':
			case 'key_KeyX':
			case 'key_KeyC':
			case 'key_KeyV':
				port = 0xFEFE;
				break;
			case 'key_KeyB':
			case 'key_KeyN':
			case 'key_KeyM':
			case 'key_ShiftRight':	// SYMBOL
			case 'key_Space':
				port = 0x7FFE;
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
				bit = 0b00001;
				break;
			case 'key_KeyZ':
			case 'key_KeyS':
			case 'key_KeyW':
			case 'key_Digit2':
			case 'key_Digit9':
			case 'key_KeyO':
			case 'key_KeyL':
			case 'key_ShiftRight':	// SYMBOL
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
				Utility.assert(false);
		}
		Utility.assert(bit);

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
	 * Retrieves the screen memory content and displays it.
	 * @param reason Not used.
	 */
	public updateDisplay() {
		// Check if CPU did something
		const tStates = this.simulator.getPassedTstates();
		if (this.previousTstates == tStates)
			return;
		this.previousTstates = tStates;
		this.restartStopTimer();

		try {
			let cpuLoad;
			let slots;
			let slotNames;
			let visualMem;
			let screenImg;
			let audio;
			let borderColor;

			// Update values
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
				// A time in ms which is used for the flashing of the color attributes. The flash frequency is 1.6Hz = 625ms.
				const time = this.simulator.getTstatesSync() / this.simulator.getCpuFrequencySync() * 1000;
				const ulaData = this.simulator.getUlaScreen();
				screenImg = {
					time,
					ulaData
				};
			}

			if (Settings.launch.zsim.zxBorderWidth > 0) {
				// Get the border and set it.
				borderColor = this.simulator.getZxBorderColor();
			}

			if (Settings.launch.zsim.zxBeeper) {
				// Audio
				audio = this.simulator.getZxBeeperBuffer();
			}

			// Create message to update the webview
			const message = {
				command: 'update',
				cpuLoad,
				slotNames,
				visualMem,
				screenImg,
				borderColor,
				audio
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

		let html =
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

<script src="out/remotes/zsimulator/zsimwebview/main.js"></script>

<body>

`;

		const zsim = Settings.launch.zsim;
		const visualMemoryZxScreen = zsim.memoryModel.includes("ZX");
		const slots = this.simulator.getSlots();
		const banks = this.simulator.memoryModel.getMemoryBanks(slots);
		const initialBeeperValue = this.simulator.zxBeeper.getCurrentBeeperValue();
		let volume = GlobalStorage.Get<number>('audio.volume');
		if (volume === undefined)
			volume = 0.75;
		let jsCustomCode = '';
		if (this.customUiPath) {
			try {
				jsCustomCode = readFileSync(this.customUiPath).toString();
			}
			catch (e) {
				jsCustomCode = "<b>Error: reading file '" + this.customUiPath + "':" + e.message + "</b>";
			}
		}

		// Init everything
		html += `
			initSimulation(
				${zsim.cpuLoadInterruptRange},
				${zsim.visualMemory}, ${visualMemoryZxScreen}, ${banks},
				${zsim.ulaScreen}, ${zsim.zxBorderWidth},
				${zsim.zxBeeper}, ${initialBeeperValue}, ${zsim.audioSampleRate}, ${volume},
				${zsim.zxKeyboard}, ${zsim.zxInterface2Joy}, ${zsim.kempstonJoy},
				${jsCustomCode});
			`;

		html += `
				</body>
			</html>
			`;

		//this.vscodePanel.webview.html = '';
		this.vscodePanel.webview.html = html;
	}

}

