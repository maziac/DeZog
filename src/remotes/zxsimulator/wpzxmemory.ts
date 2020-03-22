import {ZxMemory} from './zxmemory';



/**
 * Watchpoint class used by 'watchPointMemory'.
 */
class SimWatchpoint {
	// The way of access, e.g. read='r', write='w', readwrite='rw'
	public access: string;
	// The additional condition. Empty string or undefined if no condition.
	condition: string|undefined;
}


/**
 * Implements watchpoints on top of the memory.
 * Usage:
 * After one cpu cycle is executed check if 'watchpointHit' is true.
 * If so a watchpoint was hit.
 * You can then check the 'wpRead/WriteAddresses' arrays to check the kind of access.
 * These are array as it is in genral possible that 2 accesses happen at the same time.
 * E.g. a read for a 16 bit address results in 2x 1 byte access.
 * Afterwards call 'clearHit' for the next cpu cycle.
 */
export class WatchpointZxMemory extends ZxMemory {
	// Flag that is set if a watchpoint was hot.
	// Has to be reset manually before the next turn.
	public watchpointHit: boolean;

	// If watchpointHit was set the address where the hit occurred.
	// -1 if no hit.
	public hitAddress: number;

	// The kind of access, 'r'ead or 'w'rite.
	public hitAccess: string;

	// An array of 0-0xFFFF entries, one for each address.
	// If an address has no watchpoint it is undefined.
	// If it has it points to a SimWatchpoint.
	// Note: as watchpoints are areas, several addresses might share the same SimWatchpoint.
	protected watchPointMemory: Array<SimWatchpoint|undefined>;


	/// Constructor.
	constructor() {
		super();
		this.clearHit();
		// Create watchpoint area
		this.watchPointMemory=new Array<SimWatchpoint|undefined>(0x1000);
	}


	/**
	* Adds a watchpoint address range.
	* @param address The watchpoint address. 0x0000-0xFFFF.
	* @param size The size of the watchpoint. address+size-1 is the last address for the watchpoint.
	* I.e. you can watch whole memory areas.
	* @param condition The watchpoint condition as string. If there is no condition
	* 'condition' may be undefined or an empty string ''.
	*/
	public setWatchpoint(address: number, size: number, access: string, condition?: string) {
		const wp=new SimWatchpoint();
		wp.access=access;
		wp.condition=condition;
		// Set area
		for (let i=0; i<size; i++) {
			this.watchPointMemory[address&0xFFFF]=wp;
			address++;
		}
	}


	/**
	 * Removes a watchpoint address range.
	 * @param address The watchpoint address. 0x0000-0xFFFF.
	 * @param size The size of the watchpoint. address+size-1 is the last address for the watchpoint.
	 */
	public removeWatchpoint(address: number, size: number) {
		// Set area
		for (let i=0; i<size; i++) {
			this.watchPointMemory[address&0xFFFF]=undefined;
			address++;
		}
	}


	/**
	 * Clears the hit flag and the arrays.
	 */
	public clearHit() {
		this.hitAddress=-1;
		this.hitAccess='';
	}


	// Overwrite 'read' to check for watchpoint.
	public read8(addr: number): number {
		// Check for watchpoint access
		const wp=this.watchPointMemory[addr];
		if (wp) {
			// Check access
			if ((this.hitAddress<0) && wp.access.includes('r')) {
				// Read access
				this.hitAddress=addr;
				this.hitAccess='r';
			}
		}
		return super.read8(addr);
	}


	// Overwrite write to check for watchpoint.
	public write8(addr: number, val: number) {
		// Check for watchpoint access
		const wp=this.watchPointMemory[addr];
		if (wp) {
			// Check access
			if ((this.hitAddress<0) && wp.access.includes('w')) {
				// Write access
				this.hitAddress=addr;
				this.hitAccess='w';
			}
		}
		super.write8(addr, val);
	}

}

