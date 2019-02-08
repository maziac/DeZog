
/**
 * Represents a watchpoint used by EmulDebugAdapter in a very generic form,
 * i.e. not machine specific.
 */
export interface GenericWatchpoint {
	address: number; ///< The start address
	size: number;	///< The length of the area to watch
	access: string;	///< The way of access, e.g. read='r', write='w', readwrite='rw'
	conditions: string;	///< The additional conditions (emulator specific). '' if no condition set.
}


/**
 * Represents a breakpoint used by EmulDebugAdapter in a very generic form,
 * i.e. not machine specific.
 */
export interface GenericBreakpoint {
	address: number; ///< The PC address to break on
	conditions: string;	///< The additional conditions (emulator specific). '' if no condition set.
	log: string|undefined;	///< If set the log will be printed instead of stopping execution.
}

