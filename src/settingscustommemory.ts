


/*
Example:
{
	slots: [
		{
			range: [0x0000, 0x3FFF],
			banks: [
				{
					index: 0,
					name: 'ROM0',
					shortName: 'R0',
					rom: 'rom0.hex'
				},
				{
					index: 1,
					name: 'ROM1',
					shortName: 'R1',
					rom: 'rom1.hex'
				}
			]
		},
		{
			range: [0x4000, 0x7FFF],
			banks: [
				{
					index: [2, 100],	// 98 RAM banks
					name: 'BANK(${index}-2)',
					shortName: '(${index}-2)'
				}
			],
			initial?: 5	// Otherwise the first bank is used.
			ioMmu?: {
				port: {
					mask: 0xFFFF,
					match: 0x1234
				},
				databits: [0, 1, 2, 3, 4, 5]
			}
		},
		// Rest (0x8000-0xFFFF is unassigned
	}
}





*/


/**
 * The user can define a custom memory with banks and slots.
 * The slots can have individual sizes.
 * The custom defined memory is used in zsim and in revEng (at least if mame gdbstub
 * cannot return the memory model).
 */
export type CustomMemoryType = CustomMemorySlot[];

/**
 * Custom layout of a memory slot.
 */
export interface CustomMemorySlot {
	/**
	 * Array of two elements: first and last address of the slot (inclusive).
	 * Minimum slot size and granularity is 1Kb. // TODO: really?
	 */
	range: [number, number];

	// A list of banks that can be associated with the slot.
	banks: CustomMemoryBank[];

	// If several banks are used, the initial paged in bank can be selected.
	// If empty, the first bank from the list will be used.
	initialBank?: number;

	/**
	 * Optional memory management unit (bank switcher) accessed via single I/O port
	 */
	ioMmu?: CustomMemoryMmuInfo;
}


/**
 * Custom layout of a bank.
 */
export interface CustomMemoryBank {

	/**
	 * Either one number = index number of the bank or
	 * array of two elements: first and last index of the banks (inclusive).
	 */
	index: number | [number, number];

	// The name of the bank, can include the index variable.
	// Used in the VARIABLE pane. E.g. "ROM0"
	// E.g. 'BANK3' or 'ROM0'.
	// If not given the default is BANKn e.g. "BANK7".
	name?: string;

	// The name of the bank, can include the index variable.
	// Used in the disassembly. E.g. '3' or 'R0'.
	// If not given the default is n e.g. "3".
	shortName?: string;

	/**
	 * Optional. If specified, set the slot as ROM.
	 * The content is the buffer content, or the path of the ROM content.
	 * File content should be in raw format (i.e. `.rom` and `.bin` extensions) or Intel HEX 8-bit format (`.hex` extensions).
	 * Array content is flat and it should cover the whole bank span.
	 */
	rom?: string | Uint8Array;

	/**
	 * Optional offset of the ROM file/content
	 * TODOQ: Check usage
	 */
	romOffset?: number;
}


/**
 * Description of Memory management unit (bank switcher) accessed via single I/O port
 */
export interface CustomMemoryMmuInfo {
	/**
	 * The I/O port that control the banks (full 16-bit address)
	 * If an object, `mask` is a 16-bit mask to filter the current address (mask to 1), and `match` is the
	 * address match of the result mask.
	 */
	port: number | {mask: number, match: number};

	/**
	 * List of the bit number (b0 to b7) of the port data value to form the selected bank ID.
	 */
	dataBits: number[];
}
