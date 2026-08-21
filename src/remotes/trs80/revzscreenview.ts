import * as vscode from 'vscode';
import {Utility} from '../../misc/utility';
import {BaseView} from '../../views/baseview';
import {RevzRemote} from './revzremote';
import {LogTransport} from '../../log';


/**
 * A webview panel that shows the screen of the TRS-80 Rev Z machine
 * (remoteType "revz") — the FPGA machine on the bench, or the Verilator
 * emulator running --hidden.
 *
 * Unlike the internal simulator's view there is no in-process screen to
 * subscribe to: the machine is on the other end of the debug link. So the
 * view polls the 1 KB text VRAM (0x3C00–0x3FFF) over the ordinary
 * read-memory path (the bridge does the halt/peek/resume dance, exactly
 * like tools/emu_screen_dump.py) and renders it with the authentic
 * Kesteloot canvas renderer — the same webview bundle the simulator view
 * uses. While the CPU runs the poll ticks at ~10 Hz; on every step/stop
 * the view refreshes once and then shows a consistently frozen picture.
 *
 * Keyboard input typed into the panel is injected into the machine via
 * the remote's 'x-keys' path — if the backend advertised the capability.
 */
export class RevzScreenView extends BaseView {

	// Poll interval for the screen while the CPU is running.
	protected static SCREEN_POLL_MS = 100;

	// VRAM location of the 64x16 text screen.
	protected static VRAM_ADDR = 0x3C00;
	protected static VRAM_SIZE = 0x400;

	// A pointer to the remote.
	protected remote: RevzRemote;

	// Timer that polls the VRAM.
	protected pollTimer: NodeJS.Timeout;

	// Guard: only one read-memory request in flight.
	protected pollBusy = false;

	// The last VRAM contents sent to the webview (to skip no-change sends).
	protected lastVram: Uint8Array | undefined;

	// Throttles poll-error logging to once per connection problem.
	protected pollErrorLogged = false;

	// Called when the webview sent 'loaded'.
	protected resolveLoaded: () => void;


	/**
	 * Creates the view.
	 * @param remote The rev-z remote.
	 */
	constructor(remote: RevzRemote) {
		super();
		this.remote = remote;
		this.pollTimer = undefined as any;

		// Add title
		Utility.assert(this.vscodePanel);
		this.vscodePanel.title = 'TRS-80 Rev Z';

		// Closing the panel only closes the window on the machine — the
		// debug session keeps running (the machine is real, or at least
		// not ours to kill). Just make sure no injected key stays pressed.
		this.on('remove', () => {
			this.remote.releaseAllKeys();
		});
	}


	/** Setup the html page and wait until it is loaded.
	 */
	public async waitOnInitView() {
		// Initial html page.
		this.setHtml();
		// Wait until it is loaded
		await this.waitOnViewLoaded();

		// Poll regularly while the CPU is running
		this.pollTimer = setInterval(() => {
			void this.pollScreen();
		}, RevzScreenView.SCREEN_POLL_MS);
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
		clearInterval(this.pollTimer);
		this.pollTimer = undefined as any;
		super.dispose();
	}


	/** The web view posted a message to this view.
	 * @param message The message. message.command contains the command as a string.
	 */
	protected async webViewMessageReceived(message: any) {
		switch (message.command) {
			case 'loaded':
				this.sendInit();
				void this.pollScreen(true);
				// Inform caller the first time
				if (this.resolveLoaded) {
					this.resolveLoaded();
					this.resolveLoaded = undefined as any;
				}
				break;

			case 'keyChanged':
				// Inject the key into the machine's keyboard matrix
				this.remote.keyEvent(message.key, message.on);
				break;

			case 'allKeysUp':
				// The panel lost focus: no key must stick pressed
				this.remote.releaseAllKeys();
				break;

			case 'warning':
				await vscode.window.showWarningMessage(message.text);
				break;

			default:
				break;
		}
	}


	/** Is called on the 'update' event (e.g. after a step): refresh once so
	 * the frozen picture is consistent with the stopped machine.
	 */
	public async update(_reason?: any): Promise<void> {
		await this.pollScreen(true);
	}


	/** Sends the init configuration to the webview.
	 */
	protected sendInit() {
		this.sendMessageToWebView({
			command: 'init',
			model: 1
		});
	}


	/** Reads the text VRAM over the debug link and sends it to the webview
	 * (if changed).
	 * @param force If true the screen is sent even if unchanged.
	 */
	protected async pollScreen(force = false) {
		if (this.pollBusy)
			return;
		this.pollBusy = true;
		try {
			const vram = await this.remote.readMemoryDump(
				RevzScreenView.VRAM_ADDR, RevzScreenView.VRAM_SIZE);
			this.pollErrorLogged = false;
			if (!force && this.lastVram && Buffer.compare(vram, this.lastVram) === 0)
				return;
			this.lastVram = vram;
			// Model 1 bit-6 fold: the 7-bit VRAM regenerates bit 6 on
			// read, so 0x40–0x5F come back as 0x00–0x1F — undo it, like
			// the ROM (and emu_screen_dump.py) does.
			const chars = Array.from(vram, b => (b < 0x20) ? b + 0x40 : b);
			this.sendMessageToWebView({
				command: 'updateScreen',
				chars,
				expanded: false,
				alternate: false
			});
		}
		catch (err) {
			// Transient: a long-running command may own the link, or the
			// session is closing. The next tick retries.
			if (!this.pollErrorLogged) {
				this.pollErrorLogged = true;
				LogTransport.log(`revz screen: VRAM poll failed (will retry): ${err.message}`);
			}
		}
		finally {
			this.pollBusy = false;
		}
	}


	/** Sets the html code to display the TRS-80 screen. Reuses the
	 * simulator view's webview bundle (Kesteloot canvas renderer).
	 */
	protected setHtml() {
		// Resource path
		const extPath = Utility.getExtensionPath();
		const resourcePath = vscode.Uri.file(extPath);
		const vscodeResPath = this.vscodePanel.webview.asWebviewUri(resourcePath).toString();
		const hint = this.remote.supportsKeys
			? 'Click the screen, then type — keys go to the TRS-80.'
			: 'Live view of the machine\'s screen (this debug core takes no keyboard input).';
		const html = `
			<head>
				<meta charset="utf-8">
				<base href="${vscodeResPath}/">
			</head>

			<html>

			<style>
			/* Fill the whole panel, screen area above, hint pinned below. */
			html, body {
				height: 100%;
				margin: 0;
			}
			body {
				display: flex;
				flex-direction: column;
			}
			#trs80_screen_container {
				flex: 1 1 auto;
				min-height: 0;       /* allow the flex child to shrink */
				display: flex;
				align-items: center;
				justify-content: center;
				padding: 8px;
				box-sizing: border-box;
			}
			/* Scale the TRS-80 canvas to the largest size that fits the panel in
			   BOTH dimensions while keeping the aspect ratio. */
			#trs80_screen_container canvas {
				max-width: 100%;
				max-height: 100%;
				width: auto;
				height: auto;
				object-fit: contain;
				image-rendering: pixelated;
			}
			.hint {
				flex: 0 0 auto;
				opacity: 0.6;
				font-size: 0.8em;
				text-align: center;
				padding: 0.4em 0;
			}
			</style>

			<script src="out/remotes/trs80/trs80simwebview/main.js"></script>

			<body>
				<div id="trs80_screen_container"></div>
				<div class="hint">${hint}</div>
			</body>

			</html>
			`;
		this.vscodePanel.webview.html = html;
	}
}
