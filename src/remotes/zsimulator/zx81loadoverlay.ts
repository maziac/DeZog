
import * as fs from 'fs';
import {Z80Cpu} from "./z80cpu";
import {ZSimRemote} from './zsimremote';
import * as path from 'path';
import {EventEmitter} from "stream";
import * as fglob from 'fast-glob';
import {BankType} from '../MemoryModel/memorymodel';


export class Zx81LoadOverlay extends EventEmitter {

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
	}

	/** Set the folder to load files from.
	 * @param folder The folder to load files from.
	 */
	public setFolder(folder: string) {
		this.folder = folder;
		if (!this.folder.endsWith('/'))
			this.folder += '/';
		//console.log('Zx81LoadOverlay: folder: ' + this.folder);
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
		if (this.z80Cpu.pc === 0x0343) {
			// LOAD
			zsim.executeTstates += this.load();
		}
		else if (this.z80Cpu.pc === 0x02FB) {
			// SAVE
			zsim.executeTstates += this.save();
		}
	}


	/** Returns the entered file name to use for tape loading.
	 * @returns The entered file name.
	 */
	protected getLoadSaveName(): string {
		// Get filename
		let zx81FName = '';
		let strAddr64k = this.z80Cpu.de;
		while (strAddr64k < 0x10000) {
			const byte = this.z80Cpu.memory.read8(strAddr64k);
			if (byte === 11)	// In case of LOAD "" (11 is the ")
				break;
			zx81FName += this.zx81CharToAscii(byte);
			if (byte & 0x80)
				break;
			strAddr64k++;
		}
		return zx81FName;
	}


	/** Executes the SAVE routine.
	 * @returns The number of tstates used.
	 */
	protected save(): number {
		try {
			const z80Cpu = this.z80Cpu;

			// Get filename
			const zx81FName = this.getLoadSaveName();

			// Check for suffix address like in `SAVE "GRAPHICS.UDG;8192,512"` that
			// will save the memory @8192 with size of 512 bytes.
			let fname = zx81FName;
			const semicolonPos = fname.indexOf(';');
			let saveAddr, saveLen;
			if (semicolonPos >= 0) {
				// Save raw file
				const suffix = fname.substring(semicolonPos + 1);
				const [addrStr, lenStr] = suffix.split(',');
				saveAddr = parseInt(addrStr);
				saveLen = parseInt(lenStr);
				if (isNaN(saveAddr))
					throw new Error(`Trying to SAVE "${zx81FName}": Invalid address`);
				if (isNaN(saveLen))
					 throw new Error(`Trying to SAVE "${zx81FName}": Invalid length`);
				fname = fname.substring(0, semicolonPos);
			}

			// Construct path:
			// If an address is given then use the filename as is.
			// If an extension is given then use it.
			// If no extension is given add a ".P" extension.
			const ext = path.extname(fname);
			if (ext === '' && saveAddr === undefined) {
				fname += '.P';
			}
			if (saveAddr === undefined) {
				// Add .P extension ?
				const ext = path.extname(fname);
				if (ext === '')
					fname += '.P';
				// Set saveAddr and saveLen to BASIC program area
				saveAddr = 0x4009;
				// Get the end of the BASIC program area from the system variable E_LINE
				const eLine = z80Cpu.memory.getMemory16(0x4014);
				// Calculate the length of the BASIC program area
				saveLen = eLine - 0x4009;
			}

			// Safety checks
			if (saveAddr < 0 || saveAddr > 0xFFFF)
				throw new Error("Trying to save to invalid address " + saveAddr.toString());
			if (saveLen <= 0)
				throw Error("Trying to save " + saveLen.toString() + " bytes");

			// Get memory
			const data = z80Cpu.memory.readBlock(saveAddr, saveLen);

			// Check if the file already exists
			let filePath = this.folder + fname;
			if (fs.existsSync(filePath)) {
				// Rename existing file to filePath.1
				let suffixNumber = 1;
				// Increase suffix number until a free file name is found
				while (fs.existsSync(filePath + '.' + suffixNumber)) {
					suffixNumber++;
				}
				// Rename file
				const renFilePath = filePath + '.' + suffixNumber;
				fs.renameSync(filePath, renFilePath);
				this.emit('message', `File ${filePath} already exists. Renamed to ${renFilePath}.`);
			}

			// Write file
			fs.writeFileSync(filePath, data);

			// Info text
			this.emit('message', `SAVE "${zx81FName}": saved ${saveLen} bytes, (${filePath})`);

			// Jump to end of SAVE routine
			z80Cpu.pc = 0x0207;

			// Add some tstates. Proportional to the length of the file.
			// The ZX81 average data transfer rate is about 307 bps (38 bytes/sec)
			// at 3.25Mhz.
			const tstates = Math.ceil(3250000 * saveLen / 38);
			return tstates;
		}
		catch(error) {
			this.emit('message', "SAVE error: " + error.message);
			return 3250000;    // Return the equivalent of 1 sec @ 3.25Mhz
		}
	}


	/** Executes the LOAD routine.
	 * @returns The number of tstates used.
	 */
	protected load(): number {
		const z80Cpu = this.z80Cpu;

		// Get filename
		const zx81FName = this.getLoadSaveName();

		// Check for suffix address like in `LOAD "GRAPHICS.UDG;8192"` that
		// will load the file to address 8192.
		let fname = zx81FName;
		const semicolonPos = fname.indexOf(';');
		let loadAddr;
		if (semicolonPos >= 0) {
			// Load raw file
			const addrStr = fname.substring(semicolonPos + 1);
			loadAddr = parseInt(addrStr);
			if (isNaN(loadAddr)) {
				z80Cpu.pc = 0x03A6;	// BREAK_CONT_REPEATS;
				this.emit('message', `Trying to LOAD "${zx81FName}": Invalid address`);
				return 3250000;	// Return the equivalent of 1 sec @ 3.25Mhz
				//throw new Error(`Trying to LOAD "${fname}": Invalid address`);
			}
			fname = fname.substring(0, semicolonPos);
		}

		// Construct path
		let filePattern = this.folder + fname;
		if (!fname)
			filePattern += '*';	// Use a wildcard for LOAD ""
		// Check which extension to use: .p or .p81
		if (loadAddr === undefined)
			filePattern += '{,.P,.81,.P81}';

		//console.log('Zx81LoadOverlay: pathWoExt: ' + pathWoExt);
		const filePath = this.findFirstMatchingFile(filePattern);
		if (!filePath) {
			z80Cpu.pc = 0x03A6;	// BREAK_CONT_REPEATS;
			this.emit('message', `Trying to LOAD "${zx81FName}". Glob pattern "${filePattern}" was not found.`);
			return 3250000;	// Return the equivalent of 1 sec @ 3.25Mhz
			//throw new Error(`Trying to LOAD "${zx81FName}". Glob pattern "${filePattern}" was not found.`);
		}

		// Load file
		const len = (loadAddr === undefined) ? this.loadPFile(filePath) : this.loadFile(filePath, loadAddr);

		// Info text
		this.emit('message', `LOAD "${zx81FName}": loaded ${len} bytes, (${filePath})`);

		// Jump to end of LOAD routine
		z80Cpu.pc = 0x0207;

		// Add some tstates. Proportional to the length of the file.
		// The ZX81 average data transfer rate is about 307 bps (38 bytes/sec)
		// at 3.25Mhz.
		const tstates = Math.ceil(3250000 * len / 38);
		return tstates;
	}


	/** Loads a raw file.
	 * @param filePath The file path with extension.
	 * @param addr The address to load the file to.
	 */
	protected loadFile(filePath: string, addr: number): number {
		// Load raw file
		const fileBuffer = fs.readFileSync(filePath);
		// Write file
		this.z80Cpu.memory.writeBlock(addr & 0xFFFF, fileBuffer, [BankType.RAM]);
		return fileBuffer.length;
	}


	/** Inner Zx81 load function.
	 * Also used by zx81LoadTrap.
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
		z80Cpu.memory.writeBlock(0x4009, fileBuffer, [BankType.RAM]);

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


	/** Find the first file matching the pattern.
	 * @param pattern The pattern to search for.
	 * @returns The first file matching the pattern or null if no file was found.
	 */
	protected findFirstMatchingFile(pattern: string): string | null {
		const files = fglob.sync(pattern, {caseSensitiveMatch: false});
		return files.length > 0 ? files[0] : null;
	}

}
