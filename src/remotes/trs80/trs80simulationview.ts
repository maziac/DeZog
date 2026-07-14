import * as vscode from 'vscode';
import {Utility} from '../../misc/utility';
import {BaseView} from '../../views/baseview';
import {Trs80SimRemote} from './trs80simremote';


/**
 * A webview panel that shows the TRS-80 screen of the internal simulator
 * (remoteType "trs80sim") and injects keyboard input into the emulation.
 * Follows the pattern of ZSimulationView, but much simpler: the screen
 * characters come from the remote's buffering HeadlessScreen (the emulator
 * pushes every VRAM write through it), so the view only polls a dirty flag.
 */
export class Trs80SimulationView extends BaseView {

	// Update interval for the screen while the CPU is running.
	protected static SCREEN_UPDATE_MS = 100;

	// A pointer to the simulator.
	protected simulator: Trs80SimRemote;

	// Timer that polls the screen dirty flag.
	protected displayTimer: NodeJS.Timeout;

	// Called when the webview sent 'loaded'.
	protected resolveLoaded: () => void;


	/**
	 * Creates the view.
	 * @param simulator The internal TRS-80 simulator remote.
	 */
	constructor(simulator: Trs80SimRemote) {
		super();
		// Init
		this.simulator = simulator;
		this.displayTimer = undefined as any;

		// Add title
		Utility.assert(this.vscodePanel);
		this.vscodePanel.title = 'TRS-80 Model ' + ((simulator.trs80sim.model === 3) ? 'III' : 'I');

		// Terminate the Remote if user closes the view.
		this.on('remove', async () => {
			// Terminate remote
			await simulator.terminate();
		});
	}


	/** Setup the html page and wait until it is loaded.
	 */
	public async waitOnInitView() {
		// Initial html page.
		this.setHtml();
		// Wait until it is loaded
		await this.waitOnViewLoaded();

		// Update the screen when a step/continue finished
		this.simulator.on('update', () => {
			this.updateScreen(true);
		});

		// Update regularly while the CPU is running
		this.displayTimer = setInterval(() => {
			this.updateScreen();
		}, Trs80SimulationView.SCREEN_UPDATE_MS);
	}


	/** When the DOM is ready (loaded) a first message is sent.
	 * This function waits on the message.
	 */
	public async waitOnViewLoaded(): Promise<void> {
		return new Promise<void>(resolve => {
			// Save the 'resolve'. Is called in 'webViewMessageReceived'.
			this.resolveLoaded = resolve;
		});
	}


	/** Dispose the view (called e.g. on close).
	 */
	public dispose() {
		clearInterval(this.displayTimer);
		this.displayTimer = undefined as any;
		super.dispose();
	}


	/** The web view posted a message to this view.
	 * @param message The message. message.command contains the command as a string. E.g. 'keyChanged'.
	 */
	protected async webViewMessageReceived(message: any) {
		switch (message.command) {
			case 'loaded':
				this.sendInit();
				this.updateScreen(true);
				// Inform caller the first time
				if (this.resolveLoaded) {
					this.resolveLoaded();
					this.resolveLoaded = undefined as any;
				}
				break;

			case 'keyChanged':
				// Inject key into the emulated keyboard
				this.simulator.keyEvent(message.key, message.on);
				break;

			case 'warning':
				await vscode.window.showWarningMessage(message.text);
				break;

			default:
				break;
		}
	}


	/** Is called on the 'update' event (e.g. after a step).
	 */
	public async update(_reason?: any): Promise<void> {
		this.updateScreen(true);
	}


	/** Sends the init configuration to the webview.
	 */
	protected sendInit() {
		this.sendMessageToWebView({
			command: 'init',
			model: this.simulator.trs80sim.model
		});
	}


	/** Sends the screen characters to the webview (if changed).
	 * @param force If true the screen is sent even if unchanged.
	 */
	protected updateScreen(force = false) {
		try {
			const screen = this.simulator.screen;
			if (!screen)
				return;
			if (!force && !screen.dirty)
				return;
			screen.dirty = false;
			this.sendMessageToWebView({
				command: 'updateScreen',
				chars: Array.from(screen.chars),
				expanded: screen.isExpandedCharacters(),
				alternate: screen.isAlternateCharacters()
			});
		}
		catch {}
	}


	/** Sets the html code to display the TRS-80 screen.
	 */
	protected setHtml() {
		// Resource path
		const extPath = Utility.getExtensionPath();
		const resourcePath = vscode.Uri.file(extPath);
		const vscodeResPath = this.vscodePanel.webview.asWebviewUri(resourcePath).toString();
		const html = `
			<head>
				<meta charset="utf-8">
				<base href="${vscodeResPath}/">
			</head>

			<html>

			<style>
			#trs80_screen_container {
				display: flex;
				justify-content: center;
				margin-top: 0.5em;
			}
			.hint {
				opacity: 0.6;
				font-size: 0.8em;
				text-align: center;
				margin-top: 0.5em;
			}
			</style>

			<script src="out/remotes/trs80/trs80simwebview/main.js"></script>

			<body>
				<div id="trs80_screen_container"></div>
				<div class="hint">Click the screen, then type — keys go to the TRS-80.</div>
			</body>

			</html>
			`;
		this.vscodePanel.webview.html = html;
	}
}
