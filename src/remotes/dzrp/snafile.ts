import * as fs from 'fs';
import {Utility} from '../../misc/utility';
import {MemBank16k} from './membank16k';



/**
 * A parser for the .sna file format.
 * Can read 48k sna and 128k sna file formats.
 */
export class SnaFile {

	// All read memory banks.
	public memBanks: Array<MemBank16k>;

	// The register values:
	public i: number;
	public hl2: number;
	public de2: number;
	public bc2: number;
	public af2: number;
	public hl: number;
	public de: number;
	public bc: number;
	public iy: number;
	public ix: number;
	public iff2: number;
	public r: number;
	public af: number;
	public sp: number;
	public im: number;
	public borderColor: number;

	// 128k sna
	public pc: number;
	public port7ffd: number; // Bits 0-2: RAM page(0-7) to map at 0xc000.
							 // Bit 3: Select normal(0) or shadow(1) screen to be displayed. The normal screen is in bank 5, whilst the shadow screen is in bank 7.
							 // Bit 4: ROM select
	public trdosrom: number;


	/**
	 * Constructor.
	 */
	constructor() {
		this.memBanks= new Array<MemBank16k>();
	}


	/**
	 * Reads in the data from a .nex file.
	 * @see https://www.worldofspectrum.org/faq/reference/formats.htm
	 */
	public readFile(path: string) {
		const HEADER_LENGTH=27;

		// Read file
		const snaBuffer=fs.readFileSync(path);

		// Get registers
		this.i=snaBuffer[0];
		this.hl2=Utility.getWord(snaBuffer, 1);
		this.de2=Utility.getWord(snaBuffer, 3);
		this.bc2=Utility.getWord(snaBuffer, 5);
		this.af2=Utility.getWord(snaBuffer, 7);
		this.hl=Utility.getWord(snaBuffer, 9);
		this.de=Utility.getWord(snaBuffer, 11);
		this.bc=Utility.getWord(snaBuffer, 13);
		this.iy=Utility.getWord(snaBuffer, 15);
		this.ix=Utility.getWord(snaBuffer, 17);
		this.iff2=Utility.getWord(snaBuffer, 19);
		this.r=snaBuffer[20];
		this.af=Utility.getWord(snaBuffer, 21);
		this.sp=Utility.getWord(snaBuffer, 23);
		this.im=snaBuffer[25];
		this.borderColor=snaBuffer[26];

		// Read 3 memory banks (48k), bank 5, 2, n (currently paged in)
		let index=HEADER_LENGTH;
		for (let i=0; i<3; i++) {
			// Copy data
			const memBank=new MemBank16k();
			memBank.data.set(snaBuffer.slice(index, index+MemBank16k.BANK16K_SIZE));
			const p=MemBank16k.getMemBankPermutation(i);
			memBank.bank=p;
			this.memBanks.push(memBank);
			index+=MemBank16k.BANK16K_SIZE;
		}
		Utility.assert(index==49179);

		// Check for 128k
		if (snaBuffer.length<=index) {
			// 48k, get PC from SP
			this.pc=Utility.getWord(snaBuffer, HEADER_LENGTH+this.sp-0x4000);
			return;
		}

		// Read the rest of the 128k sna file

		// Read a few more values
		this.pc=Utility.getWord(snaBuffer, index);
		index+=2;
		this.port7ffd=snaBuffer[index++];
		this.trdosrom=snaBuffer[index++];
		Utility.assert(index==49183);

		// Correct 3rd bank
		const pagedInBank=this.port7ffd&0x03;
		this.memBanks[2].bank=pagedInBank;

		// Read up to 6 more memory banks (48k), bank 0, 1, 3, 4, 6, 7
		for (let i=2; i<8; i++) {
			const p=MemBank16k.getMemBankPermutation(i);
			if (p==pagedInBank)
				continue;	// skip already read bank
			// Copy data
			const memBank=new MemBank16k();
			memBank.data.set(snaBuffer.slice(index, index+MemBank16k.BANK16K_SIZE));
			memBank.bank=p;
			this.memBanks.push(memBank);
			index+=MemBank16k.BANK16K_SIZE;
		}

	}
}

