import {SimulatedMemory} from './simmemory';



/**
 * Represents the paged memory.
 * I.e. memory that extends 64k and can be paged in/out.
 */
export class PagedMemory extends SimulatedMemory {

	/**
	 * Returns the slots array.
	 */
	public getSlots(): number[] {
		return this.slots;
	}

}

