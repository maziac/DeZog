import {WatchpointZxMemory} from './wpzxmemory';


// TODO: Remove

/**
 * Implements a simple 64k continuous RAM memory.
 *
 * To be used for non ZX Spectrum simulation.
 */
export class Watchpoint64kRamMemory extends WatchpointZxMemory {

	/// Constructor.
	constructor() {
		super();
		// We use only 8 "slots" of RAM.
		this.slots=[0, 1, 2, 3, 4, 5, 6, 7];
	}
}

