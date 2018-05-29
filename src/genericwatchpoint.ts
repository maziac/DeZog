
/**
 * Represents a watchpoint used by EmulDebugAdapter in a very generic form,
 * i.e. not machine specific.
 */
export interface GenericWatchpoint {
	address: number; ///< The start address
	length: number;	///< The length of the area to watch
	access: string;	///< The way of access, e.g. read='r', write='w', readwrite='rw'
}

