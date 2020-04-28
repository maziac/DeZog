


/**
 * Contains an array of memory ranges.
 * All ranges are guaranteed not to overlap.
 * You can add new ranges.
 * A new range is merged with existing ones.
 * Later an Uint8Array might be added to the range.
 * Then it is also possible to obtain values from the memory.
 * The ranges are ordered by address.
 */
export class MemoryArray {
	// The array.
	public ranges=new Array<{address: number, size: number, data?: Uint8Array}>();


	/**
	 * Add a range.
	 */
	public addRange(startAddress: number, size: number) {
		// In case a range extends 0xFFFF, make sure to split it into 2
		startAddress&=0xFFFF;
		size&=0xFFFF;
		let endAddress=startAddress+size;
		if (endAddress>0x10000) {
			const firstSize=0x10000-startAddress;
			this.addRange(startAddress, firstSize);
			size-=firstSize;
			startAddress=0;
			endAddress=startAddress+size;
		}
		if (size==0)
			return;
		const len=this.ranges.length;
		for (let i=0; i<len; i++) {
			const range=this.ranges[i];
			let rStart=range.address;
			let rEnd=rStart+range.size;
			// Search for start
			if (startAddress<=rEnd) {
				// Search for end
				let k=i+1;
				while (k<len) {
					const range2=this.ranges[k];
					if (endAddress<range2.address)
						break;
					rEnd=range2.address+range2.size;
					k++;
				}
				// Check if no merge
				if (endAddress<rStart) {
					// Add new range before i
					this.ranges.splice(i, 0, {address: startAddress, size});
					return;
				}
				// Merge: i to k-1 need to be merged
				if (startAddress<rStart)
					rStart=startAddress;
				if (endAddress>rEnd)
					rEnd=endAddress;
				range.address=rStart;
				range.size=rEnd-rStart;
				// Remove merged cells
				const count=k-1-i;
				if (count>0)
					this.ranges.splice(i+1, count);
				return;
			}
		}
		// If we reach here, just add the new range
		this.ranges.push({address: startAddress, size});
	}


	/**
	 * Get value at an address (or undefined).
	 */
	public getValueAtAddress(address: number): number|undefined {
		const len=this.ranges.length;
		for (let i=0; i<len; i++) {
			const range=this.ranges[i];
			let rStart=range.address;
			let rEnd=rStart+range.size;
			if (address<rEnd) {
				if (address<rStart)
					return undefined;
				const data=range.data!;
				const value=data[address-range.address];
				return value;
			}
		}
	}
}
