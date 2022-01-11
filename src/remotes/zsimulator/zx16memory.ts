import {BankType, SimulatedMemory} from './simmemory';
import * as fs from 'fs';
import {Utility} from '../../misc/utility';



/**
 * Represents the memory of a ZX 16k.
 * Especially sets the ROM area.
 */
export class Zx16Memory extends SimulatedMemory {

	/// Constructor.
	constructor() {
		super(4, 4);
		// 0000-0x3FFF is ROM
		this.bankTypes[0] = BankType.ROM;
		// Load ROMs
		const romFilePath = Utility.getExtensionPath() + '/data/48.rom';
		const romBuffer = fs.readFileSync(romFilePath);
		const size = 0x4000;
		const rom = new Uint8Array(romBuffer.buffer, 0, size);
		this.writeBank(0, rom);

		// 8000-0xFFFF is not populated, read as 0xFF (floating bus) and non-writable
		this.fillBank(2, 0xFF);
		this.bankTypes[2] = BankType.UNUSED;
		this.fillBank(3, 0xFF);
		this.bankTypes[3] = BankType.UNUSED;
	}

}

