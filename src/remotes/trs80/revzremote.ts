import {Trs80Model1Remote} from './trs80model1remote';
import {Settings} from '../../settings/settings';
import {PortManager} from './portmanager';
import {LogTransport} from '../../log';
import {DzrpMachineType} from '../dzrp/dzrpremote';
import {spawn, ChildProcess} from 'child_process';

/**
 * The capabilities object of the rev-z backend's 'initialize' response
 * (docs/DEBUG-PROTOCOL.md, Layer 2). All fields optional: an absent
 * object (e.g. the debug-enabled trs80gp) means "trs80gp baseline".
 */
interface RevzCapabilities {
	setRegister?: boolean;
	stepOver?: boolean;
	breakpoints?: number;	// hardware PC breakpoint slots
	watchpoints?: number;	// hardware data watchpoint slots
	keys?: boolean;			// keyboard injection via 'x-keys'
}

/**
 * The "revz" remote: the TRS-80 Rev Z FPGA machine (or, later, a real
 * TRS-80 behind a hardware dongle) — NOT an emulator.
 *
 * It speaks the exact same JSON-RPC layer as the trs80gp remote (so all of
 * DeZog's high-level logic is inherited unchanged), but it does not launch
 * an emulator and never falls back to the mock server. Instead it reaches
 * the debug core through a transport described in `launch.json`
 * (docs/decisions/0007-trszog-integration.md):
 *
 *   - transport.kind "python": a local bridge (tools/trszog_bridge.py from
 *     the trs80-rev-z repo) translates JSON-RPC to the debug core's binary
 *     wire protocol over the board's serial port (or, against the Verilator
 *     emulator, over its --debug-tcp port via serial "tcp:<port>"). When
 *     autoStart is on, this remote starts the bridge — but only if nothing
 *     is already listening on the port; a bridge a developer started by
 *     hand is left alone and merely connected to.
 *   - transport.kind "esp32": connect over the network to the on-board
 *     ESP32 debug server (host:port); nothing is spawned or port-probed.
 *
 * Capabilities are not assumed but taken from the backend's 'initialize'
 * response (ADR-0007: advertise real capabilities instead of
 * masquerading): hardware data watchpoints enable WPMEM, and keyboard
 * injection ('x-keys') feeds the screen view's keyboard.
 *
 * Connection details (hostname, port, socketTimeout) are mirrored into the
 * shared trs80 settings by Settings.Init, so the inherited connectSocket()
 * works without change.
 */
export class RevzRemote extends Trs80Model1Remote {
	protected bridgeProcess?: ChildProcess;
	protected bridgeOwned = false;

	// The backend's advertised capabilities (from 'initialize').
	protected capabilities: RevzCapabilities = {};

	// Watchpoints currently armed (one entry per address; the hardware
	// comparators are single-address, so ranges are expanded).
	protected wpEntries: {address: number, access: string}[] = [];

	// The currently pressed keys of the screen view's keyboard
	// (KeyboardEvent.key names). The 8-byte matrix is rebuilt from this
	// complete set on every change — "current report wins", never
	// patched incrementally (mirrors m1_hid_keys.v / EmuKeyboard).
	protected pressedKeys = new Set<string>();
	protected lastKeysMatrix = '';

	/**
	 * Bring the transport up (if we own it) and connect. Overrides the base
	 * orchestration to skip all emulator/mock-server launching.
	 */
	public async doInitialization(): Promise<void> {
		try {
			this.useMockServer = false;					// never the mock
			const transport = Settings.launch.revz?.transport ?? {kind: 'python'};
			const port = transport.port ?? 49152;
			const host = transport.host ?? 'localhost';
			this.allocatedPort = port;

			if (transport.kind === 'python') {
				// The bridge is by definition local. Politely own only what
				// we start: if something is already listening, connect to it
				// and leave it running.
				const free = await PortManager.isPortAvailable(port);
				if (free) {
					if (transport.autoStart ?? true) {
						await this.startBridge(port);
					}
					else {
						throw new Error(`revz: nothing is listening on port ${port} and autoStart is off. Start tools/trszog_bridge.py yourself, or turn transport.autoStart on.`);
					}
				}
				else {
					LogTransport.log(`revz: a debug server is already listening on port ${port}; connecting to it and leaving it alone.`);
				}
			}
			// kind 'esp32'/'serial': the server may live on another machine —
			// a local port probe would be meaningless. Just connect;
			// connectSocket retries until socketTimeout.

			try {
				await this.connectSocket(port);			// inherited retry loop
			}
			catch (err) {
				// The inherited message names trs80gp; be honest about revz.
				throw new Error(`revz: could not connect to the debug server at ${host}:${port}` + ((transport.kind === 'esp32') ? ' — is the ESP32 debug server up?' : '') + ` (${err.message})`);
			}
			await this.onConnect();						// inherited init handshake
		}
		catch (err) {
			this.emit('debug_console', `revz initialization failed: ${err.message}`);
			this.emit('error', err);
		}
	}

	/**
	 * The init handshake. Same 'initialize' request as the base class, but
	 * the response's capabilities object is honored: WPMEM support follows
	 * the hardware watchpoint slots, keyboard injection follows 'keys'.
	 */
	public async sendDzrpCmdInit(): Promise<{error: string | undefined; programName: string; dzrpVersion: string; machineType: DzrpMachineType}> {
		try {
			const result = await this.sendTrs80GpJsonRpcRequest('initialize', {
				clientName: 'DeZog',
				version: '1.0.0',
				machineType: 'model1'
			});

			this.capabilities = result?.capabilities ?? {};
			this.supportsWPMEM = (this.capabilities.watchpoints ?? 0) > 0;
			LogTransport.log(`revz: backend capabilities: ${JSON.stringify(this.capabilities)}`);

			return {
				error: undefined,
				programName: result?.programName || 'trs80-rev-z',
				dzrpVersion: result?.version || '1.0.0',
				machineType: DzrpMachineType.TRS80_MODEL1
			};
		}
		catch (err) {
			return {
				error: `Failed to initialize revz connection: ${err.message}`,
				programName: 'trs80-rev-z',
				dzrpVersion: '1.0.0',
				machineType: DzrpMachineType.TRS80_MODEL1
			};
		}
	}

	/**
	 * Spawn tools/trszog_bridge.py and wait until it is listening. The
	 * bridge path and serial device come from transport config; the bridge
	 * itself lives in the trs80-rev-z repository, not vendored here.
	 */
	protected startBridge(port: number): Promise<void> {
		const t = Settings.launch.revz!.transport;
		if (!t.bridge)
			throw new Error("revz: transport.autoStart needs transport.bridge — the path to tools/trszog_bridge.py in your trs80-rev-z checkout.");
		if (!t.serial)
			throw new Error("revz: transport.python needs transport.serial — the dongle's serial device (e.g. /dev/cu.usbserial-XXXX), or tcp:<port> for the emulator's --debug-tcp.");
		const baud = t.baud ?? 460800;
		const python = t.python ?? 'python3';
		const args = [t.bridge, '--serial', t.serial, '--baud', String(baud), '--port', String(port)];

		return new Promise<void>((resolve, reject) => {
			LogTransport.log(`revz: starting bridge: ${python} ${args.join(' ')}`);
			const proc = spawn(python, args, {stdio: ['ignore', 'pipe', 'pipe']});
			this.bridgeProcess = proc;
			this.bridgeOwned = true;

			// Keep the bridge's last output lines: when it dies before
			// listening, THIS is the actual reason (missing pyserial, port
			// in use, wrong device, ...) — show it instead of guessing.
			const lastOutput: string[] = [];
			const remember = (d: Buffer) => {
				for (const line of d.toString().split('\n')) {
					const s = line.trim();
					if (s) lastOutput.push(s);
				}
				while (lastOutput.length > 6)
					lastOutput.shift();
			};

			let settled = false;
			const ready = () => {
				if (!settled) {settled = true; clearInterval(poll); resolve();}
			};
			const fail = (msg: string) => {
				if (!settled) {
					settled = true;
					clearInterval(poll);
					// Never leave a half-started bridge behind — it would
					// hold the port (and the serial device) hostage for
					// every following session.
					try {proc.kill('SIGTERM');} catch {/* already gone */}
					this.bridgeProcess = undefined;
					this.bridgeOwned = false;
					reject(new Error(msg));
				}
			};

			proc.stdout?.on('data', (d: Buffer) => {
				const s = d.toString();
				LogTransport.log(`[revz bridge] ${s.trim()}`);
				remember(d);
				if (s.includes('listening on')) ready();
			});
			proc.stderr?.on('data', (d: Buffer) => {
				LogTransport.log(`[revz bridge] ${d.toString().trim()}`);
				remember(d);
			});
			proc.on('error', (e) => fail(`revz: could not start '${python}' (not on VS Code's PATH? Set revz.transport.python to a full interpreter path): ${e.message}`));
			proc.on('exit', (code) => {
				let msg = `revz: bridge exited before listening (code ${code}).`;
				if (lastOutput.length)
					msg += ` Bridge said: ${lastOutput.join(' | ')}`;
				if (lastOutput.some(l => l.includes("No module named 'serial'")))
					msg += ` — '${python}' has no pyserial. Either 'pip3 install pyserial' for that interpreter, or set revz.transport.python to one that has it (VS Code started from the Dock has a minimal PATH, so 'python3' may not be the one from your shell).`;
				fail(msg);
			});

			// Fallback readiness: poll the port in case the bridge's banner
			// differs from the expected line.
			const startedAt = Date.now();
			const poll = setInterval(async () => {
				if (settled) return;
				if (!(await PortManager.isPortAvailable(port))) ready();
				else if (Date.now() - startedAt > 8000) fail('revz: bridge did not start listening within 8s.');
			}, 200);
		});
	}

	/**
	 * Disconnect. The socket is closed first so the bridge's detach cleanup
	 * runs (clear breakpoints/watchpoints, release keys, resume the
	 * machine); only then is a bridge we started stopped. A pre-existing
	 * bridge — and the machine/emulator behind it — is never touched, so
	 * reconnecting needs no emulator restart.
	 */
	public async disconnect(): Promise<void> {
		await super.disconnect();
		if (this.bridgeOwned && this.bridgeProcess) {
			// Give the bridge a moment to run its detach cleanup on the
			// closed debugger socket before asking it to exit.
			await new Promise(resolve => setTimeout(resolve, 200));
			try {this.bridgeProcess.kill('SIGTERM');} catch {/* already gone */}
			this.bridgeProcess = undefined;
			this.bridgeOwned = false;
		}
	}

	/**
	 * Pause execution. The base class synthesizes a stop notification
	 * because the trs80gp server never sends one — the rev-z backend does
	 * (with the halt PC), and the synthetic one would consume the pending
	 * continue first and report address 0. So here: just the request; the
	 * real notification follows.
	 */
	public async sendDzrpCmdPause(): Promise<void> {
		try {
			await this.sendTrs80GpJsonRpcRequest('pause');
		}
		catch (err) {
			throw new Error(`revz: pause failed: ${err.message}`);
		}
	}

	//---- Hardware data watchpoints (WPMEM) ----

	/**
	 * Sends the complete watchpoint list ('x-setWatchpoints', full
	 * replacement — like setBreakpoints).
	 */
	protected async syncWatchpoints(): Promise<void> {
		const watchpoints = this.wpEntries.map(wp => ({
			address: '0x' + wp.address.toString(16),
			access: wp.access
		}));
		await this.sendTrs80GpJsonRpcRequest('x-setWatchpoints', {watchpoints});
	}

	/**
	 * Adds a watchpoint (range). The hardware comparators are
	 * single-address, so a range of n addresses consumes n of the
	 * advertised slots — an honest error is raised when they run out.
	 */
	public async sendDzrpCmdAddWatchpoint(address: number, size: number, access: string): Promise<void> {
		const slots = this.capabilities.watchpoints ?? 0;
		if (this.wpEntries.length + size > slots)
			throw new Error(`revz: only ${slots} hardware watchpoint slots (each watched address takes one); ${this.wpEntries.length} in use, ${size} more requested.`);
		const start = address & 0xFFFF;
		for (let i = 0; i < size; i++)
			this.wpEntries.push({address: (start + i) & 0xFFFF, access});
		await this.syncWatchpoints();
	}

	/**
	 * Removes a watchpoint (range) by re-sending the whole list.
	 */
	protected async sendDzrpCmdRemoveWatchpoint(address: number, size: number, access: string): Promise<void> {
		const start = address & 0xFFFF;
		const end = (start + size) & 0xFFFF;
		this.wpEntries = this.wpEntries.filter(wp => {
			const inRange = (size >= 0x10000) ||
				((start <= end) ? (wp.address >= start && wp.address < end)
					: (wp.address >= start || wp.address < end));	// wrapped
			return !(inRange && wp.access === access);
		});
		await this.syncWatchpoints();
	}

	//---- Keyboard injection (screen view -> 'x-keys') ----

	/**
	 * True when the backend can inject keyboard input (KEYS probed by the
	 * bridge, reported in the capabilities).
	 */
	public get supportsKeys(): boolean {
		return this.capabilities.keys === true;
	}

	/**
	 * Injects a key event from the screen view. Same interface as
	 * Trs80SimRemote.keyEvent. The complete matrix is rebuilt from the
	 * current set of pressed keys and sent as one report.
	 * @param key KeyboardEvent.key (a glyph like "a", ":" or a name like
	 * "Enter", "ArrowLeft", "Shift").
	 * @param isPressed true on keydown, false on keyup.
	 */
	public keyEvent(key: string, isPressed: boolean) {
		if (!this.supportsKeys)
			return;
		// Letter glyphs: case is a shift artifact, track them lowercased.
		const k = (key.length === 1) ? key.toLowerCase() : key;
		if (isPressed)
			this.pressedKeys.add(k);
		else
			this.pressedKeys.delete(k);
		this.sendKeysMatrix();
	}

	/**
	 * Releases all keys (e.g. when the screen view loses focus), so no key
	 * sticks pressed on the machine.
	 */
	public releaseAllKeys() {
		if (this.pressedKeys.size === 0)
			return;
		this.pressedKeys.clear();
		this.sendKeysMatrix();
	}

	/**
	 * Rebuilds the 8-byte TRS-80 matrix from the pressed-key set and sends
	 * it via 'x-keys' (if changed). Fire and forget: a lost key report is
	 * corrected by the next one.
	 */
	protected sendKeysMatrix() {
		const matrix = this.buildKeysMatrix();
		if (matrix === this.lastKeysMatrix)
			return;
		this.lastKeysMatrix = matrix;
		this.sendTrs80GpJsonRpcRequest('x-keys', {matrix})
			.catch(err => LogTransport.log(`revz: x-keys failed: ${err.message}`));
	}

	/**
	 * Glyph-faithful mapping (like m1_hid_keys.v): the browser already
	 * resolves the host layout into glyphs, so each glyph maps straight to
	 * its Model 1 matrix cell. 'shift' overrides the physical shift state
	 * for glyphs the Model 1 types differently than the host (e.g. host
	 * Shift+2 = "@", which the Model 1 types unshifted).
	 * Matrix layout (byte = row, bit = column):
	 *   row 0: @ A B C D E F G      row 4: 0 1 2 3 4 5 6 7
	 *   row 1: H I J K L M N O      row 5: 8 9 : ; , - . /
	 *   row 2: P Q R S T U V W      row 6: ENT CLR BRK ↑ ↓ ← → SPC
	 *   row 3: X Y Z                row 7: SHIFT
	 */
	protected static readonly KEY_MATRIX: {[key: string]: {row: number, col: number, shift?: boolean}} = (() => {
		const m: {[key: string]: {row: number, col: number, shift?: boolean}} = {};
		// Letters (rows 0..3); '@' is row 0 col 0.
		m['@'] = {row: 0, col: 0, shift: false};
		for (let i = 0; i < 26; i++) {
			const ch = String.fromCharCode(0x61 + i);	// 'a'..'z'
			m[ch] = {row: (i + 1) >> 3, col: (i + 1) & 7};
		}
		// Digits (rows 4/5) with their Model 1 shifted glyphs.
		const digits = '01234567';
		for (let i = 0; i < 8; i++)
			m[digits[i]] = {row: 4, col: i, shift: false};
		m['8'] = {row: 5, col: 0, shift: false};
		m['9'] = {row: 5, col: 1, shift: false};
		const shifted: {[g: string]: string} = {
			'!': '1', '"': '2', '#': '3', '$': '4', '%': '5', '&': '6', "'": '7',
			'(': '8', ')': '9', '*': ':', '+': ';', '<': ',', '=': '-', '>': '.', '?': '/'
		};
		m[':'] = {row: 5, col: 2, shift: false};
		m[';'] = {row: 5, col: 3, shift: false};
		m[','] = {row: 5, col: 4, shift: false};
		m['-'] = {row: 5, col: 5, shift: false};
		m['.'] = {row: 5, col: 6, shift: false};
		m['/'] = {row: 5, col: 7, shift: false};
		for (const [glyph, base] of Object.entries(shifted))
			m[glyph] = {...m[base], shift: true};
		// Row 6: ENTER CLEAR BREAK up down left right space.
		m['Enter'] = {row: 6, col: 0};
		m['Home'] = {row: 6, col: 1};			// CLEAR
		m['Escape'] = {row: 6, col: 2};			// BREAK
		m['ArrowUp'] = {row: 6, col: 3};
		m['ArrowDown'] = {row: 6, col: 4};
		m['ArrowLeft'] = {row: 6, col: 5};
		m['Backspace'] = {row: 6, col: 5};		// ← doubles as backspace
		m['ArrowRight'] = {row: 6, col: 6};
		m[' '] = {row: 6, col: 7};
		return m;
	})();

	/**
	 * Builds the 8-byte matrix (16 hex chars, row 0 first) from
	 * this.pressedKeys.
	 */
	protected buildKeysMatrix(): string {
		const rows = new Uint8Array(8);
		let shift = this.pressedKeys.has('Shift');
		for (const key of this.pressedKeys) {
			const cell = RevzRemote.KEY_MATRIX[key];
			if (!cell)
				continue;
			rows[cell.row] |= 1 << cell.col;
			if (cell.shift !== undefined)
				shift = cell.shift;
		}
		if (shift)
			rows[7] |= 0x01;
		return Buffer.from(rows).toString('hex');
	}
}
