
/**
 * This is a set to store the code coverage addresses.
 */
export class CodeCoverageArray {
	// This is a list of used addresses.
	protected addressSet=new Set<number>();


	/**
	 * Adds address to the set.
	 * @param longAddress A "normal" 64k address or a long address.
	 */
	public storeAddress(longAddress: number) {
		this.addressSet.add(longAddress);
	}


	/**
	 * Returns a set with the addresses.
	 */
	public getAddresses(): Set<number> {
		return this.addressSet;
	}


	/**
	 * Clears the memory for the next code coverage measurements.
	 */
	public clearAll() {
		// Note: It is important that a new Set is allocated.
		// It's not correct to clear the existing one (it might be still used).
		this.addressSet=new Set<number>();
	}

}
