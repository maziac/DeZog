import {Trs80Model1Remote} from './trs80model1remote';
import {Settings} from '../../settings/settings';
import {PortManager} from './portmanager';
import {LogTransport} from '../../log';
import {spawn, ChildProcess} from 'child_process';

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
 *     wire protocol over the board's serial port. When autoStart is on,
 *     this remote starts the bridge — but only if nothing is already
 *     listening on the port; a bridge a developer started by hand is left
 *     alone and merely connected to.
 *   - transport.kind "esp32": connect over the network to the on-board
 *     ESP32 debug server (host:port); nothing is spawned.
 *
 * Connection details (hostname, port, socketTimeout) are mirrored into the
 * shared trs80 settings by Settings.Init, so the inherited connectSocket()
 * works without change.
 */
export class RevzRemote extends Trs80Model1Remote {
	protected bridgeProcess?: ChildProcess;
	protected bridgeOwned = false;

	/**
	 * Bring the transport up (if we own it) and connect. Overrides the base
	 * orchestration to skip all emulator/mock-server launching.
	 */
	public async doInitialization(): Promise<void> {
		try {
			this.useMockServer = false;					// never the mock
			const transport = Settings.launch.revz?.transport ?? {kind: 'python'};
			const port = transport.port ?? 49152;
			this.allocatedPort = port;

			// Politely own only what we start: if something is already
			// listening, connect to it and leave it running.
			const free = await PortManager.isPortAvailable(port);
			if (free) {
				if (transport.kind === 'python' && (transport.autoStart ?? true)) {
					await this.startBridge(port);
				}
				else if (transport.kind === 'esp32') {
					throw new Error(`revz: nothing is listening on ${transport.host ?? 'localhost'}:${port} — is the ESP32 debug server up?`);
				}
				else {
					throw new Error(`revz: nothing is listening on port ${port} and no bridge to start (transport.kind='${transport.kind}', autoStart off). Start the debug server yourself, or set transport.kind='python' with autoStart.`);
				}
			}
			else {
				LogTransport.log(`revz: a debug server is already listening on port ${port}; connecting to it and leaving it alone.`);
			}

			await this.connectSocket(port);				// inherited retry loop
			await this.onConnect();						// inherited init handshake
		}
		catch (err) {
			this.emit('debug_console', `revz initialization failed: ${err.message}`);
			this.emit('error', err);
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
			throw new Error("revz: transport.python needs transport.serial — the dongle's serial device, e.g. /dev/cu.usbserial-XXXX.");
		const baud = t.baud ?? 460800;
		const args = [t.bridge, '--serial', t.serial, '--baud', String(baud), '--port', String(port)];

		return new Promise<void>((resolve, reject) => {
			LogTransport.log(`revz: starting bridge: python3 ${args.join(' ')}`);
			const proc = spawn('python3', args, {stdio: ['ignore', 'pipe', 'pipe']});
			this.bridgeProcess = proc;
			this.bridgeOwned = true;

			let settled = false;
			const ready = () => {
				if (!settled) {settled = true; clearInterval(poll); resolve();}
			};
			const fail = (msg: string) => {
				if (!settled) {settled = true; clearInterval(poll); reject(new Error(msg));}
			};

			proc.stdout?.on('data', (d: Buffer) => {
				const s = d.toString();
				LogTransport.log(`[revz bridge] ${s.trim()}`);
				if (s.includes('listening on')) ready();
			});
			proc.stderr?.on('data', (d: Buffer) => LogTransport.log(`[revz bridge] ${d.toString().trim()}`));
			proc.on('error', (e) => fail(`revz: could not start bridge (python3 on PATH? pyserial installed?): ${e.message}`));
			proc.on('exit', (code) => fail(`revz: bridge exited before listening (code ${code}) — check the serial device and pyserial.`));

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
	 * Stop only a bridge we started; a pre-existing one is never touched.
	 */
	public async disconnect(): Promise<void> {
		if (this.bridgeOwned && this.bridgeProcess) {
			try {this.bridgeProcess.kill('SIGTERM');} catch {/* already gone */}
			this.bridgeProcess = undefined;
			this.bridgeOwned = false;
		}
		await super.disconnect();
	}
}
