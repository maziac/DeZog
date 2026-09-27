import * as fs from 'fs';
import {MemBank16k} from './membank16k';



/** Bit flags for the loading screens (header byte 10). */
export enum NexLoadingScreen {
	LAYER2 = 0x01,
	ULA = 0x02,
	LORES = 0x04,
	TIMEX_HIRES = 0x08,
	TIMEX_HICOL = 0x10,
	LAYER2_EXT = 0x40,	// 320x256x8 or 640x256x4 (V1.3)
	NO_PALETTE = 0x80
}


/**
 * A parser for the .nex file format.
 * Reads the different memory banks and the loading screens.
 * https://wiki.specnext.dev/NEX_file_format
 */
export class NexFile {
	// The 16k bank the NEX loader uses for all ULA related screens.
	public static readonly ULA_SCREEN_BANK16K = 5;

	// The first 16k bank the NEX loader uses for the Layer2 screen (banks 9, 10, 11).
	public static readonly LAYER2_SCREEN_BANK16K = 9;

	// All read memory banks.
	public memBanks: Array<MemBank16k>;

	// Bank that is mapped into slot 3 (16k) after NEX file loading.
	public entryBank: number;

	// The border color
	public borderColor: number;

	// The SP value.
	public sp: number;

	// The PC value.
	public pc: number;

	// The loading screen flags, see NexLoadingScreen.
	public loadingScreensFlags: number;

	// The palette (256 entries of 2 bytes, 9 bit colors) for the Layer2
	// or LoRes screen. undefined if not present.
	public palette: Uint8Array | undefined;

	// The Layer2 loading screen (256x192, 49152 bytes) or undefined.
	public layer2Screen: Uint8Array | undefined;

	// The ULA loading screen (6912 bytes: pixels + attributes) or undefined.
	public ulaScreen: Uint8Array | undefined;

	// The LoRes loading screen (128x96, 12288 bytes) or undefined.
	public loResScreen: Uint8Array | undefined;

	// The Timex HiRes loading screen (512x192, 12288 bytes) or undefined.
	public timexHiResScreen: Uint8Array | undefined;

	// The Timex HiCol loading screen (8x1 attributes, 12288 bytes) or undefined.
	public timexHiColScreen: Uint8Array | undefined;

	// The color for the Timex HiRes mode, encoded as for port 0xFF (bits 5-3).
	public timexHiResColor: number;


	/**
	 * Constructor.
	 */
	constructor() {
		this.memBanks = new Array<MemBank16k>();
	}


	/**
	 * Reads in the data from a .nex file.
	 * @see https://wiki.specnext.dev/NEX_file_format
	 */
	public readFile(path: string) {
		const nexBuffer = fs.readFileSync(path);
		this.readBuffer(nexBuffer);
	}


	/**
	 * Parses the data of a .nex file.
	 * @see https://wiki.specnext.dev/NEX_file_format
	 */
	public readBuffer(nexBuffer: Buffer) {
		const LOADING_SCREENS = 10;
		const BORDER_COLOR = 11;
		const SP = 12
		const PC = 14;
		const USED_BANKS = 18;
		const HIRES_COLOR = 138;
		const ENTRY_BANK = 139;	// Bank that is mapped into slot 3 (16k) after NEX file loading.
		//const FIRST_BANK=144;
		//const LOADING_SCREENS2=152;
		const COPPER_CODE_BLOCK = 153;

		const FILE_HEADER_SIZE = 512;
		const PALETTE_SIZE = 512;
		const L2_LOADING_SCREEN_SIZE = 49152;
		const ULA_LOADING_SCREEN_SIZE = 6912;
		const LOWRES_LOADING_SCREEN_SIZE = 12288;
		const TIMEX_HIRES_LOADING_SCREEN_SIZE = 12288;
		const TIMEX_HICOL_LOADING_SCREEN_SIZE = 12288;
		const L2B_LOADING_SCREEN_SIZE = 81920;
		const COPPER_CODE_BLOCK_SIZE = 2048;

		let index = FILE_HEADER_SIZE;
		// Returns the next block and advances the index
		const readBlock = (size: number): Uint8Array => {
			const block = new Uint8Array(nexBuffer.subarray(index, index + size));
			index += size;
			return block;
		};

		// Loading screens
		const flags = nexBuffer[LOADING_SCREENS];
		this.loadingScreensFlags = flags;
		this.palette = undefined;
		this.layer2Screen = undefined;
		this.ulaScreen = undefined;
		this.loResScreen = undefined;
		this.timexHiResScreen = undefined;
		this.timexHiColScreen = undefined;
		// Only Layer2 and LoRes screens have a palette (unless the no-palette flag is set)
		if (!(flags & NexLoadingScreen.NO_PALETTE)
			&& (flags & (NexLoadingScreen.LAYER2 | NexLoadingScreen.LORES | NexLoadingScreen.LAYER2_EXT)))
			this.palette = readBlock(PALETTE_SIZE);
		if (flags & NexLoadingScreen.LAYER2)
			this.layer2Screen = readBlock(L2_LOADING_SCREEN_SIZE);
		if (flags & NexLoadingScreen.ULA)
			this.ulaScreen = readBlock(ULA_LOADING_SCREEN_SIZE);
		if (flags & NexLoadingScreen.LORES)
			this.loResScreen = readBlock(LOWRES_LOADING_SCREEN_SIZE);
		if (flags & NexLoadingScreen.TIMEX_HIRES)
			this.timexHiResScreen = readBlock(TIMEX_HIRES_LOADING_SCREEN_SIZE);
		if (flags & NexLoadingScreen.TIMEX_HICOL)
			this.timexHiColScreen = readBlock(TIMEX_HICOL_LOADING_SCREEN_SIZE);
		if (flags & NexLoadingScreen.LAYER2_EXT)
			index += L2B_LOADING_SCREEN_SIZE;	// Skipped, not shown by the NEX loader
		const copperFlags = nexBuffer[COPPER_CODE_BLOCK];
		if (copperFlags & 0x01)
			index += COPPER_CODE_BLOCK_SIZE;

		// Read border color
		this.borderColor = nexBuffer[BORDER_COLOR];

		// Read Timex HiRes color
		this.timexHiResColor = nexBuffer[HIRES_COLOR] & 0b0011_1000;

		// Read SP and PC
		this.sp = nexBuffer[SP] + (nexBuffer[SP + 1] << 8);
		this.pc = nexBuffer[PC] + (nexBuffer[PC + 1] << 8);

		// Read which banks are included
		for (let i = 0; i < MemBank16k.MAX_NUMBER_OF_BANKS; i++) {
			const k = MemBank16k.getMemBankPermutation(i);
			const byteFlag = nexBuffer[USED_BANKS + k];
			if (byteFlag) {
				const memBank = new MemBank16k();
				memBank.bank = k;
				this.memBanks.push(memBank);
			}
		}

		// Read slot 3 (16k) bank
		this.entryBank = nexBuffer[ENTRY_BANK];	//Entry bank

		// Read the data of each bank
		for (const memBank of this.memBanks) {
			// Read data
			const data = memBank.data;
			nexBuffer.copy(data, 0, index, index + MemBank16k.BANK16K_SIZE);
			index += MemBank16k.BANK16K_SIZE;
		}
	}


	/** Returns the memory writes (8k banks) for all loading screens
	 * in the order the NEX loader does it.
	 * The ULA related screens are written to bank 5, the Layer2 screen
	 * to banks 9-11 (16k).
	 * Loading the memory banks afterwards may overwrite the screens.
	 */
	public getLoadingScreenBankWrites(): Array<{bank8: number, offset: number, data: Uint8Array}> {
		const writes = new Array<{bank8: number, offset: number, data: Uint8Array}>();
		const ulaBank8 = 2 * NexFile.ULA_SCREEN_BANK16K;
		if (this.layer2Screen) {
			const l2Bank8 = 2 * NexFile.LAYER2_SCREEN_BANK16K;
			for (let i = 0; i < 6; i++) {
				const offs = i * 0x2000;
				writes.push({bank8: l2Bank8 + i, offset: 0, data: this.layer2Screen.subarray(offs, offs + 0x2000)});
			}
		}
		if (this.ulaScreen)
			writes.push({bank8: ulaBank8, offset: 0, data: this.ulaScreen});
		// LoRes and Timex screens: 2x 0x1800 bytes at 0x4000 and 0x6000
		for (const screen of [this.loResScreen, this.timexHiResScreen, this.timexHiColScreen]) {
			if (screen) {
				writes.push({bank8: ulaBank8, offset: 0, data: screen.subarray(0, 0x1800)});
				writes.push({bank8: ulaBank8 + 1, offset: 0, data: screen.subarray(0x1800)});
			}
		}
		return writes;
	}
}
