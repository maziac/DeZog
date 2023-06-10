
/** An implementation of a mutex for typescript.
 * Usage:
 *
 * protected mutex = new Mutex();
 *
 * func() {
 * 	mutex.lock();
 * 	...
 * 	mutex.unlock();
 * }
 */
export class Mutex {

	// Array of resolve, reject functions
	private queue: Array<{resolve: (value: void | PromiseLike<void>) => void, reject: (reason?: any) => void}> = [];

	/** Locks the mutex.
	 * If no other lock exists it returns immediately.
	 * Otherwise it waits for the call to unlock of the consurrent function.
	 */
	public async lock(): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			// Remember
			this.queue.push({resolve, reject});
			// Check if we need to wait on others
			if (this.queue.length === 1) {
				// No-one to wait on, handle immediately
				resolve();
			}
		});
	}


	/** unlocks the mutex.
	 * Immediately returns.
	 * If another functions already called 'lock' this will now get the lock and
	 * program execution will continue there at the next event loop possibility.
	 */
	public unlock() {
		// Throw away last item
		this.queue.shift();
		// Get next mutex item
		const item = this.queue.at(0);
		if (item?.resolve) {
			// Process next possible time
			setImmediate(item.resolve);
		}
	}
}
