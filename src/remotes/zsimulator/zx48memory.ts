import {SimulatedMemory} from './simmemory';
import * as fs from 'fs';
import {PackageInfo} from '../../whatsnew/packageinfo';



/**
 * Represents the memory of a ZX 48k.
 * Especially sets the ROM area.
 */
export class Zx48Memory extends SimulatedMemory {

	/// Constructor.
	constructor() {
		super(4, 4);
		// 0000-0x3FFF is ROM
		this.romBanks[0]=true;
		// Load ROMs
		const romFilePath=PackageInfo.extensionPath+'/data/48.rom';
		const romBuffer=fs.readFileSync(romFilePath);
		const size=0x4000;
		const rom=new Uint8Array(romBuffer.buffer, 0, size);
		this.writeBank(0, rom);
	}

}

