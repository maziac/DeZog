import {EventEmitter} from "stream";
import {LogTransport} from "../../log";
import {Utility} from "../../misc/utility";
import {Z80_REG} from "../z80registers";
import {DzrpQueuedRemote} from "./dzrpqueuedremote";
import {DZRP, DzrpRemote} from "./dzrpremote";

/**
 * Class to test the communication with a DZRP client.
 * Used to test the transport, especially the serial connection and the
 * dezogif program by sending a big number of packets and looking for
 * any problems.
 */
export class DzrpTransportTest extends EventEmitter {
	// The remote to use for sending commands.
	protected remote: DzrpQueuedRemote | any;	// "any" to easily access the protected methods.

	// Indicates if the test loop is running.
	protected running = false;

	// Command list.
	protected cmdList: Array<() => void> = [
		async () => {
			console.log('sendDzrpCmdClose');
			await this.remote.sendDzrpCmdClose();
			console.log('sendDzrpCmdInit');
			await this.remote.sendDzrpCmdInit();
		},
		async () => {
			console.log('sendDzrpCmdInterruptOnOff');
			await this.remote.sendDzrpCmdInterruptOnOff(false);
		},
		async () => {
			console.log('sendDzrpCmdGetRegisters');
			await this.remote.sendDzrpCmdGetRegisters();
		},
		async () => {
			console.log('sendDzrpCmdSetRegister');
			const index = this.rndInt(Z80_REG.PC, Z80_REG.IM);
			const value = this.rndInt(0, 0xFFFF);
			await this.remote.sendDzrpCmdSetRegister(index, value);
		},
		async () => {
			console.log('sendDzrpCmdWriteBank');
			const bank = this.rndInt(0, 80);
			const data = new Uint8Array(0x2000);
			const value = this.rndInt(0, 255);
			data.fill(value);
			await this.remote.sendDzrpCmdWriteBank(bank, data);
		},
		// cmdList.push(async () => {
		// 	await this.remote.sendDzrpCmdContinue();
		// });
		// cmdList.push(async () => {
		// 	await this.remote.sendDzrpCmdPause();
		// });
		async () => {
			console.log('sendDzrpCmdReadMem');
			const addr = this.rndInt(0, 0xFFFF);
			const count = this.rndInt(1, 0xFFFF);
			await this.remote.sendDzrpCmdReadMem(addr, count);
		},
		async () => {
			console.log('sendDzrpCmdWriteMem');
			const addr = this.rndInt(0, 0xFFFF);
			const count = this.rndInt(1, 0xFFFF);
			const data = new Uint8Array(count);
			const value = this.rndInt(0, 255);
			data.fill(value);
			await this.remote.sendDzrpCmdWriteMem(addr, data);
		},
		async () => {
			console.log('sendDzrpCmdSetSlot');
			const slot = this.rndInt(0, 7);
			const bank = this.rndInt(0, 80);
			await this.remote.sendDzrpCmdSetSlot(slot, bank);
		},
		async () => {
			console.log('sendDzrpCmdGetTbblueReg');
			const reg = this.rndInt(0, 0x2000);
			await this.remote.sendDzrpCmdGetTbblueReg(reg);
		},
		async () => {
			console.log('sendDzrpCmdSetBorder');
			const color = this.rndInt(0, 7);
			await this.remote.sendDzrpCmdSetBorder(color);
		},
		async () => {
			console.log('sendDzrpCmdSetBreakpoints');
			const bpLongAddrs: number[] = [];
			const count = this.rndInt(0, 100);
			for (let i = 0; i < count; i++) {
				const addr = this.rndInt(0x10000, 0x1F0000);	// Long addresses
				bpLongAddrs.push(addr);
			}
			await this.remote.sendDzrpCmdSetBreakpoints(bpLongAddrs);
		},
		async () => {
			console.log('sendDzrpCmdRestoreMem');
			const mem: Array<{address: number, value: number}> = [];
			const count = this.rndInt(0, 100);
			for (let i = 0; i < count; i++) {
				const address = this.rndInt(0x10000, 0x1F0000);	// Long addresses
				const value = this.rndInt(0, 255);
				mem.push({address, value});
			}
			await this.remote.sendDzrpCmdRestoreMem(mem);
		},
		// cmdList.push(async () => {
		// 	await this.remote.sendDzrpCmdLoopBack();
		// });
		async () => {
			console.log('sendDzrpCmdGetSpritesPalette');
			const index = this.rndInt(0, 1);
			await this.remote.sendDzrpCmdGetSpritesPalette(index);
		},
		async () => {
			console.log('sendDzrpCmdGetSpritesClipWindow');
			await this.remote.sendDzrpCmdGetSpritesClipWindow();
		},
		// async () => {
		// 	console.log('sendDzrpCmdGetSprites');
		// 	const index = this.rndInt(0, 255);
		// 	const count = this.rndInt(0, 255);
		// 	await this.remote.sendDzrpCmdGetSprites(index, count);
		// },
		// async () => {
		// 	console.log('sendDzrpCmdGetSpritePatterns');
		// 	const index = this.rndInt(0, 255);
		// 	const count = this.rndInt(0, 255);
		// 	await this.remote.sendDzrpCmdGetSpritePatterns(index, count);
		// },
		// cmdList.push(async () => {
		// 	const color = this.rndInt(0, 8);
		// 	await this.remote.sendDzrpCmdGetPort
		// });
		// cmdList.push(async () => {
		// 	const color = this.rndInt(0, 8);
		// 	await this.remote.sendDzrpCmdWritePort
		// });
		// cmdList.push(async () => {
		// 	const color = this.rndInt(0, 8);
		// 	await this.remote.sendDzrpCmdExecAsm
		// });
		async () => {
			console.log('sendDzrpCmdInterruptOnOff');
			const on = this.rndInt(0, 1) === 1;
			await this.remote.sendDzrpCmdInterruptOnOff(on);
		}
	];

	/** Constructor.
	 * Creates an object that is able to send commands and receive responses.
	 * @param remote A pointer to the remote to use for sending the commands.
	 */
	constructor(remote: DzrpRemote) {
		super();
		this.remote = remote;
	}


	/** Start the test.
	 * At first a CMD_INIT is send.
	 * Afterwards other commands are sent randomly with a pause in the range [minTime;maxTime].
	 * Returns immediately. The commands are sent asynchronously until 'end' is called.
	 * @param minTime The minimum time between sent commands.
	 * @param maxTime The maximum time between sent commands.
	 */
	public async cmdsStart(minTime: number, maxTime: number) {
		// Stop any probably running test loop.
		await this.cmdsEnd();
		// Start asynchronous loop
		(async () => {
			let counter = 0;
			try {
				// Start
				this.running = true;
				// Send CMD_INIT
				await this.remote.sendDzrpCmdInit();
				counter++;
				// Start sending random commands
				while (this.running) {
					await this.pause(minTime, maxTime);
					// Send command
					console.log("Sending command");
					await this.sendRndCmd();
					counter++;
					// Log every 100 messages
					if (counter % 100 === 0) {
						this.emit('debug_console', "" + counter + " messages sent.");
					}
				}
				// Stop with a CMD_CLOSE
				await this.remote.sendDzrpCmdClose();
				counter++;
				// Notify
				this.emit('debug_console', "Stopped after " + counter + " messages without errors.");
				this.emit('stopped');
			}
			catch (e) {
				// Error -> stop
				console.log("Stopped on error (count=" + counter + "):", e);
				const msg = "Stopped after " + counter + " messages on error: " + e.message;
				LogTransport.log(msg);
				this.emit('debug_console', msg);
				this.running = false;
			}
		})();
	}


	/** End the test.
	 * Ends the test started in 'start'.
	 * After 'end' returns, 'this.running' is false.
	 */
	public async cmdsEnd() {
		// Check if a test is ongoing
		if (this.running) {
			return new Promise<void>(resolve => {
				// Implement notifier when loop is stopped.
				this.once('stopped', () => {
					// Leave
					resolve();
				});
				// Yes, so stop it
				this.running = false;
			});
		}
	}


	/** Waits for a random time.
	 * If myTime == minTime the function at least waits 1 ms.
	 * @param minTime The minimum pause time.
	 * @param maxTime The maximum pause time.
	 */
	protected async pause(minTime: number, maxTime: number) {
		// Check boundaries
		if (minTime <= 1)
			minTime = 1;
		if (maxTime <= minTime)
			maxTime = minTime;
		const pause = this.rndInt(minTime, maxTime);
		if (pause > 0) {
			// Pause
			await Utility.timeout(pause);
		}
	}


	/** Sends a random command.
	 */
	protected async setupCmdList() {
		// Create function list
		this.cmdList = new Array<() => void>();
	}


	/** Sends a random command.
	 */
	protected async sendRndCmd() {
		// Choose one randomly
		const m = this.rndInt(0, this.cmdList.length - 1);
		await this.cmdList[m]();
	}


	/** Returns a random integer in range [min; max].
	 */
	protected rndInt(min: number, max: number): number {
		// Check boundaries
		if (max <= min)
			max = min;
		const r = Math.floor(Math.random() * (max - min + 1) + min);
		return r;
	}


	/** Sends one big message with a adjustable pause in between.
	 * Used to test draining in dezogif.
	 * @param len1 Length of first part
	 * @param len2 Length of second part
	 * @param pause The pause between the 2 parts in ms
	 * @param sequenceNumber The sequence number to use. Defaults to 10.
	 */
	public async sendCmdWithPause(len1: number, len2: number, pause = 0, sequenceNumber = 10) {
		if (len1 < 10) {
			this.emit('debug_console', "Length should be bigger/equal 10.");
			return;
		}
		const totalLen = len1 + len2;
		const buffer1 = Buffer.alloc(len1);
		// Encode length
		const payloadLen = totalLen - (4 + 2);
		buffer1[0] = payloadLen & 0xFF;
		buffer1[1] = (payloadLen >>> 8) & 0xFF;
		buffer1[2] = (payloadLen >>> 16) & 0xFF;
		buffer1[3] = (payloadLen >>> 24) & 0xFF;
		// Sequence number
		buffer1[4] = sequenceNumber;
		// Command
		buffer1[5] = DZRP.CMD_WRITE_MEM;
		// Reserved
		buffer1[6] = 0;
		// Address
		buffer1[7] = 0;
		buffer1[8] = 0x4000 >>> 8;
		// Send first part
		await this.remote.sendBuffer(buffer1);

		if (len2 > 0) {
			// Pause
			if (pause > 0) {
				await Utility.timeout(pause);
			}

			// Send remaining buffer
			const buffer2 = Buffer.alloc(len2);
			await this.remote.sendBuffer(buffer2);
		}
	}
}
