import {Utility} from '../../misc/utility';
import {PagedMemory} from './pagedmemory';
import * as fs from 'fs';


/**
 * Represents the memory of a ZX 128k.
 * Especially sets the ROM area and
 * the initial slot/bank configuration.
 */
export class Zx128Memory extends PagedMemory {

	/// Constructor.
	constructor() {
		super(4, 10);
		// 0000-0x3FFF is ROM. This is located in banks 8 and 9
		// Bank 0-7 is RAM.
		this.romBanks[8]=true;	// ROM 0
		this.romBanks[9]=true;	// ROM 1
		// Bank configuration
		this.slots=[8 /*ROM*/, 5, 2, 0];
		// Load the  ROMs
		const romFilePath=Utility.getExtensionPath()+'/data/128.rom';
		const romBuffer=fs.readFileSync(romFilePath);
		const size=0x4000;
		const rom0=new Uint8Array(romBuffer.buffer, 0, size); /* 128 editor */
		const rom1=new Uint8Array(romBuffer.buffer, size, size); /* ZX 48K */
		this.writeBank(8, rom0);
		this.writeBank(9, rom1);
		// Initially ROM 1 is selected
		this.slots[0]=9;
	}

}

