import * as fs from 'fs';
import {MemBank16k} from './membank16k';



/**
 * A parser for the .nex file format.
 * Reads basically only the different memory banks.
 */
export class NexFile {
	// All read memory banks.
	public memBanks: Array<MemBank16k>;

	// The bank to map into slot 3.
	public slot3Bank: number;

	// The border color
	public borderColor: number;

	// The SP value.
	public sp: number;

	// The PC value.
	public pc: number;

	/**
	 * Constructor.
	 */
	constructor() {
		this.memBanks=new Array<MemBank16k>();
	}


	/**
	 * Reads in the data from a .nex file.
	 * @see https://wiki.specnext.dev/NEX_file_format
	 */
	public readFile(path: string) {
		const LOADING_SCREENS=10;
		const BORDER_COLOR=11;
		const SP=12
		const PC=14;
		const USED_BANKS=18;
		const SLOT3_BANK=139;
		//const FIRST_BANK=144;
		//const LOADING_SCREENS2=152;
		const COPPER_CODE_BLOCK=153;

		const FILE_HEADER_SIZE=512;
		const PALETTE_SIZE=512;
		const L2_LOADING_SCREEN_SIZE=49512;
		const ULA_LOADING_SCREEN_SIZE=6912;
		const LOWRES_LOADING_SCREEN_SIZE=12288;
		const TIMEX_HIRES_LOADING_SCREEN_SIZE=12288;
		const TIMEX_HICOL_LOADING_SCREEN_SIZE=12288;
		const L2B_LOADING_SCREEN_SIZE=81920;
		const COPPER_CODE_BLOCK_SIZE=2048;


		// Read file
		const nexBuffer=fs.readFileSync(path);

		// Compute memory bank index
		const loadingScreensFlags=nexBuffer[LOADING_SCREENS];
		let memBankIndex=FILE_HEADER_SIZE;
		if (loadingScreensFlags&0x80) memBankIndex+=PALETTE_SIZE;
		if (loadingScreensFlags&0x01) memBankIndex+=L2_LOADING_SCREEN_SIZE;
		if (loadingScreensFlags&0x02) memBankIndex+=ULA_LOADING_SCREEN_SIZE;
		if (loadingScreensFlags&0x04) memBankIndex+=LOWRES_LOADING_SCREEN_SIZE;
		if (loadingScreensFlags&0x08) memBankIndex+=TIMEX_HIRES_LOADING_SCREEN_SIZE;
		if (loadingScreensFlags&0x10) memBankIndex+=TIMEX_HICOL_LOADING_SCREEN_SIZE;
		if (loadingScreensFlags&0x40) memBankIndex+=L2B_LOADING_SCREEN_SIZE;
		const copperFlags=nexBuffer[COPPER_CODE_BLOCK];
		if (copperFlags&0x01) memBankIndex+=COPPER_CODE_BLOCK_SIZE;

		// Read border color
		this.borderColor=nexBuffer[BORDER_COLOR];

		// Read SP and PC
		this.sp=nexBuffer[SP]+(nexBuffer[SP+1]<<8);
		this.pc=nexBuffer[PC]+(nexBuffer[PC+1]<<8);

		// Read which banks are included
		for (let i=0; i<MemBank16k.MAX_NUMBER_OF_BANKS; i++) {
			const k=MemBank16k.getMemBankPermutation(i);
			const byteFlag=nexBuffer[USED_BANKS+k];
			if (byteFlag) {
				const memBank=new MemBank16k();
				memBank.bank=k;
				this.memBanks.push(memBank);
			}
		}

		// Read slot 3 bank
		this.slot3Bank=nexBuffer[SLOT3_BANK];

		// Read the data of each bank
		for (const memBank of this.memBanks) {
			// Read data
			const data=memBank.data;
			nexBuffer.copy(data, 0, memBankIndex, memBankIndex+MemBank16k.BANK16K_SIZE);
			memBankIndex+=MemBank16k.BANK16K_SIZE;
//			for (let i=0; i<MemBank16k.BANK16K_SIZE; i++) {
//				data[i]=nexBuffer[memBankIndex++];
//			}
		}
	}

}

