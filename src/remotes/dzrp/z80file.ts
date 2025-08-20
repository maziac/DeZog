import * as fs from 'fs';
import {MemBank16k} from './membank16k';
import {assert} from 'console';



/** A parser for the .z80 file format.
 * See https://worldofspectrum.org/faq/reference/z80format.htm */
export class Z80File {

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
	public iff1: number;
	public iff2: number;
	public r: number;
	public af: number;
	public sp: number;
	public im: number;
	public borderColor: number;

	// 128k sna
	public pc: number;
	public port7ffd: number | undefined; // Bits 0-2: RAM page(0-7) to map at 0xc000.
	// Bit 3: Select normal(0) or shadow(1) screen to be displayed. The normal screen is in bank 5, whilst the shadow screen is in bank 7.
	// Bit 4: ROM select
	// Only defined for 128k

	// Set if data is stored compressed.
	protected compressed: boolean;

	// Additional header length for version 2 and 3
	protected addHeaderLength: number;

	// 48k Spectrum, 128k etc.
	protected hwMode: number;

	// If set: any 48K machine becomes a 16K machine, any 128K machines becomes a +2 and any +3 machine becomes a +2A, which would change to Amstrad ROM.
	// As the ZX spectrum is configured in the launch.json, no use.
	// No use.
	protected modifiedHw: boolean;

	// Is true if it is a 128k Z80 file
	public is128kFile = false;
	// Is true if it is a 48k Z80 file (both could be false if e.g. (SamRam)
	public is48kFile = false;

	// The file read into this buffer:
	protected z80Buffer: Buffer;
	// The current index into the buffer:
	protected z80BufferReadIndex: number;

	/**
	 * Constructor.
	 */
	constructor() {
		this.memBanks = new Array<MemBank16k>();
	}


	/**
	 * Reads in the data from a .nex file.
	 * @see https://www.worldofspectrum.org/faq/reference/formats.htm
	 */
	public readFile(path: string) {
		// Read file
		this.z80Buffer = fs.readFileSync(path);
		this.z80BufferReadIndex = 0;

		// Read version header first
		this.readVersion1Header();


		// Check for version
		if (this.pc !== 0) {
			// Version 1
			this.is48kFile = true;
			if (this.compressed) {
				const buffer48k = this.readCompressed48kBlock();
				// Split over 3 banks
				const size16k = MemBank16k.BANK16K_SIZE;
				for (let i = 0; i < 3; i++) {
					const memBank = new MemBank16k();
					memBank.data.set(buffer48k.subarray(i * size16k, (i + 1) * size16k));
					memBank.bank = MemBank16k.getMemBankPermutation(i);
					this.memBanks.push(memBank);
				}
			}
			else {
				// Read uncompressed 48k
				for (let i = 0; i < 3; i++) {
					const p = MemBank16k.getMemBankPermutation(i);
					const memBank = this.read16kBlock();
					memBank.bank = p;
					this.memBanks.push(memBank);
				}
			}
			return;
		}

		// Version 2 or 3
		this.readAdditionalVersion23Header();

		// Only supported are HW modes are 48k and 128k (I don't kow how the others are mapped)
		if (this.is48kFile) {
			// Z80 file pages 4, 5, and 8 are present
			for (let i = 0; i < 3; i++) {
				const memBank = this.readCompressed16kBlock();
				// Fix bank/page from z80 numbering to 48k numbering
				const z80PageNumber = memBank.bank;
				let realBank;
				switch (z80PageNumber) {
					case 0: // Ignore 48k ROM
					case 1: // Ignore IF 1
						break;
					case 4:
						realBank = 2;	// 0x8000
						break;
					case 5:
						realBank = 0;	// 0xC000
						break;
					case 8:
						realBank = 5;	// Bank 5 is the normal screen, 0x4000
						break;
					case 11:	// Ignore Multiface ROM
						break;
					default:
						throw Error(`Unsupported z80 page number ${z80PageNumber} for 48k`);
				}
				memBank.bank = realBank;
				this.memBanks.push(memBank);
			}
		}
		else if (this.is128kFile) {
			// Z80 file pages 3 to 10 are present
			for (let i = 0; i < 8; i++) {
				const memBank = this.readCompressed16kBlock();
				// Fix bank/page from z80 numbering to 48k numbering
				const z80PageNumber = memBank.bank;
				if (z80PageNumber < 3)
					continue;	// Ignore ROMs and IF1
				if (z80PageNumber > 10)
					continue;	// Ignore Multiface ROM
				const realBank = z80PageNumber - 3;
				memBank.bank = realBank;
				this.memBanks.push(memBank);
			}
		}
		else {
			throw Error(`Unsupported hardware mode ${this.hwMode}. Only 48k and 128k are supported.`);
		}
	}


	// Reads the version 1 header.
	protected readVersion1Header() {
		// Get registers
		this.af = this.readWordBE();
		this.bc = this.readWord();
		this.hl = this.readWord();
		this.pc = this.readWord();
		this.sp = this.readWord();
		this.i = this.readByte();
		this.r = this.readByte();
		let bitmask12 = this.readByte();
		if (bitmask12 === 255)
			bitmask12 = 1;	// For compatibility reasons
		this.borderColor = (bitmask12 & 0x0E) >> 1;
		this.compressed = (bitmask12 & 0x20) !== 0;
		this.de = this.readWord();
		this.bc2 = this.readWord();
		this.de2 = this.readWord();
		this.hl2 = this.readWord();
		this.af2 = this.readWordBE();
		this.iy = this.readWord();
		this.ix = this.readWord();
		this.iff1 = this.readByte();
		this.iff2 = this.readByte();
		const bitmask29 = this.readByte();
		this.im = (bitmask29 & 0x03);

		assert(this.z80BufferReadIndex === 30);
	}

	// Reads the version 2 additional header.
	protected readAdditionalVersion23Header() {
		this.addHeaderLength = this.readWord();	// After this field
		const version = (this.addHeaderLength === 23) ? 2 : 3;
		this.pc = this.readWord();
		this.hwMode = this.readByte();
		const byte35 = this.readByte();
		this.is48kFile= this.hwMode == 0 || this.hwMode == 1 || this.hwMode == 3;
		this.is128kFile = this.hwMode == 4 || this.hwMode == 5 || this.hwMode == 6;
		// Special handling for hwMode==3 in version 2
		if (this.hwMode === 3 && version === 2) {
			this.is48kFile = false;
			this.is128kFile = true;
		}
		if (this.is128kFile) {
			this.port7ffd = byte35;
		}
		this.z80BufferReadIndex += 1; // Skip
		const bitmask37 = this.readByte();
		this.modifiedHw = (bitmask37 & 0x80) !== 0;	// probably no use
		this.z80BufferReadIndex += this.addHeaderLength - 4 - 1 - 1;

		assert(this.z80BufferReadIndex === 30 + this.addHeaderLength + 2);
	}

	// Read helper functions
	protected readByte() {
		return this.z80Buffer[this.z80BufferReadIndex++];
	}
	protected readWord() {
		const low = this.z80Buffer[this.z80BufferReadIndex++];
		const high = this.z80Buffer[this.z80BufferReadIndex++];
		return (high << 8) | low;
	}
	protected readWordBE() {
		const high = this.z80Buffer[this.z80BufferReadIndex++];
		const low = this.z80Buffer[this.z80BufferReadIndex++];
		return (high << 8) | low;
	}

	// Reads a block of data.
	protected read16kBlock(): MemBank16k {
		const memBank = new MemBank16k();
		memBank.data.set(this.z80Buffer.subarray(this.z80BufferReadIndex, this.z80BufferReadIndex + MemBank16k.BANK16K_SIZE));
		this.z80BufferReadIndex += MemBank16k.BANK16K_SIZE;
		return memBank;
	}

	// Reads a compressed 48k block of data.
	// Version 1.
	protected readCompressed48kBlock(): Buffer {
		const maxSize = 0xC000;
		const decompressed = Buffer.alloc(maxSize);
		let dataIndex = 0;
		while (dataIndex < maxSize && this.z80BufferReadIndex < this.z80Buffer.length) {
			const byte = this.readByte();
			if (byte !== 0xED) {
				decompressed[dataIndex++] = byte;
			} else {
				const nextByte = this.readByte();
				if (nextByte !== 0xED) {
					decompressed[dataIndex++] = byte;
					decompressed[dataIndex++] = nextByte;
				} else {
					// ED, ED
					const count = this.readByte();
					// Check for end marker: 00 ED ED 00, simplified check:
					if (count === 0) {
						break;
					}
					const value = this.readByte();

					decompressed.fill(value, dataIndex, dataIndex + count);
					dataIndex += count;
				}
			}
		}
		return decompressed;
	}


	// Reads a compressed 16k block of data.
	// Version 2 and 3.
	protected readCompressed16kBlock(): MemBank16k {
		// Read header
		const length = this.readWord();
		const page = this.readByte();

		// Data
		if (length === 0xFFFF) {
			// Data is uncompressed
			const memBank = this.read16kBlock();
			memBank.bank = page;
			return memBank;
		}

		// Data is compressed
		const maxSize = 0x4000;
		const decompressed = Buffer.alloc(maxSize);
		let dataIndex = 0;
		const endReadIndex = this.z80BufferReadIndex + length;
		while (this.z80BufferReadIndex < endReadIndex) {
			if (dataIndex >= maxSize)
				throw Error("Decompressed data exceeds maximum size");
			const byte = this.readByte();
			if (byte !== 0xED) {
				decompressed[dataIndex++] = byte;
			} else {
				const nextByte = this.readByte();
				if (nextByte !== 0xED) {
					decompressed[dataIndex++] = byte;
					decompressed[dataIndex++] = nextByte;
				} else {
					// ED, ED
					const count = this.readByte();
					const value = this.readByte();

					decompressed.fill(value, dataIndex, dataIndex + count);
					dataIndex += count;
				}
			}
		}

		// Copy data
		const memBank = new MemBank16k();
		memBank.data.set(decompressed.subarray(0, MemBank16k.BANK16K_SIZE));
		memBank.bank = page;  // These are the page numbers of the z80 file format
		return memBank;
	}
}
