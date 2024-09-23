
import * as fs from 'fs';
import {Z80Cpu} from "./z80cpu";
import {ZSimRemote} from './zsimremote';
import * as path from 'path';
import {EventEmitter} from "stream";
import {Utility} from '../../misc/utility';


export class Zx81LoadTrap extends EventEmitter {

	// Reference to the CPU.
	public z80Cpu: Z80Cpu;

	// The folder to load files from.
	protected folder: string;

	/** Constructor.
	 * @param folder The folder to load files from.
	 */
	constructor(z80Cpu: Z80Cpu) {
		super();
		this.z80Cpu = z80Cpu;
		this.setFolder(Utility.getRootPath());
		console.log('Zx81LoadTrap: folder: ' + this.folder);
	}

	/** Set the folder to load files from.
	 * @param folder The folder to load files from.
	 */
	public setFolder(folder: string) {
		this.folder = folder;
		if (!this.folder.endsWith('/'))
			 this.folder += '/';
	}


	/** Execute on every instruction.
	 * If pc is 0x0343 the loading is invoked and afterwards the
	 * pc is changed to 0x207.
	 * @param pc The program counter.
	 */
	public execute(zsim: ZSimRemote) {
		// Check if another component already occupied tstates
		if (zsim.executeTstates !== 0)
			return;

		// Check for trap
		if (this.z80Cpu.pc !== 0x0343)
			return;

		// Get filename
		let fname = '';
		let strAddr64k = this.z80Cpu.de;
		while (strAddr64k < 0x10000) {
			const byte = this.z80Cpu.memory.read8(strAddr64k);
			fname += this.zx81CharToAscii(byte);
			if (byte & 0x80)
				break;
			strAddr64k++;
		}

		// Set registers
		const z80Cpu = this.z80Cpu;
		z80Cpu.pc = 0x0207;	// After LOAD routine
		//await this.sendDzrpCmdSetRegister(Z80_REG.SP, topSpStack);
		// TODO: löschen was geht
		z80Cpu.bc = 0x0080;
		z80Cpu.de = 0xffff;
		z80Cpu.ix = 0x0281;	// Required?
		z80Cpu.iy = 0x4000;
		z80Cpu.de2 = 0x002b;	// Required?
		z80Cpu.im = 1;
		z80Cpu.i = 0x1e;
		z80Cpu.a2 = 0xF8;	// Required?

		// Check which extension to use: .p or .p81
		const pathWoExt = this.folder + fname;
		let filePath = pathWoExt + '.P';
		if (!fs.existsSync(filePath)) {
			// If .p file does not exist, check for .p81 file
			filePath = pathWoExt + '.P81';
			if (!fs.existsSync(filePath)) {
				throw new Error(`Neither file ${pathWoExt}.P nor ${pathWoExt}.P81 was found.`);
			}
		}

		// Load file
		const len = this.loadPFile(filePath);

		// Add some tstates. Proportional to the length of the file.
		// The ZX81 average data transfer rate is about 307 bps (38 bytes/sec).
		// => 3250000 * len / 38
		zsim.executeTstates += Math.ceil(zsim.z80Cpu.cpuFreq * len / 38);
	}


	/** Inner Zx81 load function.
	 * Also used by zx81LoadTrap.
	 * Tries to first load a .p file and if this fails a .p81 file.
	 * @param filePath The file path with extension.
	 */
	protected loadPFile(filePath: string): number {
		// Read file
		let fileBuffer = fs.readFileSync(filePath);
		let len = fileBuffer.length;
		const ext = path.extname(filePath).toLowerCase();
		if (ext === '.p81') {
			// Skip name at the start of the file
			let nameMax = 128;
			if (nameMax > len)
				nameMax = len;
			let nameLen = 0;
			for (let i = 0; i < nameMax; i++) {
				const c = fileBuffer[i];
				nameLen++;
				if (c >= 0x80)
					break;
			}
			// Remove the name at the beginning
			fileBuffer = fileBuffer.subarray(nameLen);
			len -= nameLen;
		}

		// Get topStack and ramTop from System VARS
		const z80Cpu = this.z80Cpu;
		const topStack = z80Cpu.memory.getMemory16(0x4002);
		const ramTop = z80Cpu.memory.getMemory16(0x4004);
		const ramSize = ramTop - 0x4000;

		// Write file
		z80Cpu.memory.writeBlock(0x4009, fileBuffer);

		// Check possible issues
		if (len < 0x3c) {
			z80Cpu.pc = 0x03A6;	// BREAK_CONT_REPEATS;
			this.emit('warning', `Loading ${path.basename(filePath)}: Data corrupted: file is too short: length < sysvars`);
		}
		else {
			// E_LINE
			const eline = z80Cpu.memory.getMemory16(0x4014);
			if (0x4009 + len < eline) {
				z80Cpu.pc = 0x03A6;	// BREAK_CONT_REPEATS;
				this.emit('warning', `Loading ${path.basename(filePath)}: Data corrupted: file is too short: length < ($4014)-$4009`);
			}

			// Too big?
			else if (0x4009 + len > 0x4000 + ramSize) {
				this.emit('warning', `Loading ${path.basename(filePath)}: The file is too big for the available RAM (${ramSize}).`);
			}

			// Overwriting stack?
			else if (0x4009 + len > topStack) {
				this.emit('warning', `Loading ${path.basename(filePath)}: Note: The machine stack was overwritten by the data`);
			}
		}

		return len;
	}

	/** Converts a ZX81 character code into an an ASCII character (string)
	 * @param char The ZX81 character code. Will be anded with 0x3F.
	 * @returns The ASCII character as a string.
	 */
	protected zx81CharToAscii(char: number): string{
		char &= 0x3F;
		if (char >= 0x26)	// A - Z
			return String.fromCharCode(char + 0x1B);
		if (char >= 0x1C)	// 0 - 9
			return String.fromCharCode(char + 0x14);
		const convTable = [
			' ', '#', '#', '#', '#', '#', '#', '#',	// Graphics are not converted
			'#', '#', '#', '"', '\u00A3' /*pound*/, '$', ':', '?',
			'(', ')', '>', '<', '=', '+', '-', '*',
			'/', ';', ',', '.'
		];
		const conv = convTable[char];
		return conv;
	}
}
