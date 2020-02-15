
/**
 * One memory bank with data.
 */
export class MemBank16k {
	// The maximum number of 16k banks
	public static MAX_NUMBER_OF_BANKS=112;

	// The bank size.
	public static BANK16K_SIZE=0x4000;
	// The memory bank number
	public bank: number;
	// The data
	public data: Uint8Array=new Uint8Array(MemBank16k.BANK16K_SIZE);



	/**
	 * Returns the right bank for an index.
	 *  5,2,0,1,3,4,6,7,8,9,10,...,111.
	 * @returns the bank number 0-111.
	 */
	public static getMemBankPermutation(i: number) {
		if (i>=6)
			return i;
		return [5, 2, 0, 1, 3, 4][i];
	}
}

