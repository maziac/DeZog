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

	// If watchpointHit was set the address where the hit occurred is stored
	// in one of the 2 arrays.
	public wpReadAddresses: Array<number>;
	public wpWriteAddresses: Array<number>;

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
		this.watchpointHit=false;
		this.wpReadAddresses=new Array<number>();
		this.wpWriteAddresses=new Array<number>();
	}

	// Overwrite 'read' to check for watchpoint.
	public read8(addr: number): number {
		// Check for watchpoint access
		const wp=this.watchPointMemory[addr];
		if (wp) {
			// Check access
			if (wp.access.includes('r')) {
				// Read access
				this.wpReadAddresses.push(addr);
				this.watchpointHit=true;
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
			if (wp.access.includes('w')) {
				// Write access
				this.wpWriteAddresses.push(addr);
				this.watchpointHit=true;
			}
		}
		super.write8(addr, val);
	}

}

