
/** An implementation of a mutex for typescript.
 * Usage:
 * protected mutex = new Mutex();
 *
 * func() {
 * 	mutex.lock();
 * 	...
 * 	mutex.unlock();
 * }
 *
 * Timeout/Exceptions:
 * The constructor can receive a time for a timeout.
 * If it exceeds (i.e. if the time between lock/unlock is too big)
 * an exception is thrown. But only in the event loop.
 * I.e. it is only visible in the debug log.
 * But any waiting lock will receive an exception in the 'await mutex.lock()' call.
 */
export class Mutex {

	// Array of resolve, reject functions
	private locks: Array<{resolve: (value: void | PromiseLike<void>) => void, reject: (reason?: any) => void}> = [];

	// Timeout handling
	protected timeout: number;
	protected timeoutHandle: NodeJS.Timeout | undefined;


	/** Constructor.
	 * @param timeout The time (in ms) until an error is thrown if the resource is not freed.
	 * I.e. the maximum allowed time between calling 'lock' and 'unlock'.
	 */
	constructor(timeout = 5000) {
		this.timeout = timeout;
	}


	/** Locks the mutex.
	 * If no other lock exists it returns immediately.
	 * Otherwise it waits for the call to unlock of the consurrent function.
	 */
	public async lock(): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			// Remember
			this.locks.push({resolve, reject});
			// Check if we need to wait on others
			if (this.locks.length === 1) {
				// No-one to wait on, handle immediately
				this.proceed(resolve, reject);
			}
		});
	}


	/** unlocks the mutex.
	 * Immediately returns.
	 * If another functions already called 'lock' this will now get the lock and
	 * program execution will continue there at the next event loop possibility.
	 */
	public unlock() {
		if (this.timeoutHandle === undefined) {
			throw new Error("Mutex: 'unlock' called without calling 'lock'.");
		}
		// Stop timer
		clearTimeout(this.timeoutHandle);
		this.timeoutHandle = undefined;
		// Throw away last item
		this.locks.shift();
		// Get next mutex item
		const item = this.locks.at(0);
		if (item?.resolve) {
			// Process next possible time
			this.proceed(item.resolve, item.reject);
		}
	}


	/** Calls 'resolve' and starts a timer.
	 * If timer expires before 'unlock' is called an exception is thrown.
	 * @param resolve The resolve function, to continue.
	 * @param reject The reject function to throw the error.
	 */
	protected proceed(resolve: (value: void | PromiseLike<void>) => void, reject: (reason?: any) => void) {
		// Start rejection timer
		this.timeoutHandle = setTimeout(() => {
			this.locks.shift();
			// Also reject all other locks.
			for (const item of this.locks) {
				item.reject(`Mutex: timeout (${this.timeout} ms) reached. 'unlock' not called in time by other lock.`);
			}
			// Clear list
			this.locks = [];
			// Throw error
			this.throwError(`Mutex: timeout (${this.timeout} ms) reached. 'unlock' not called in time by this lock.`);
		}, this.timeout);
		// Proceed (run resolve)
		setImmediate(resolve);
	}

	/** Throws an error.
	 * Is an own function to ease unit testing.
	 */
	protected throwError(text: string) {
		throw new Error(text);
	}
}
