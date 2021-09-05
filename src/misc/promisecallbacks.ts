

export class PromiseCallbacks<T> {

	// Call this to resolve.
	public resolve: (elem: T) => void;

	// Call this for failure.
	public reject: ((error: Error) => void);


	/**
	 * Constructor.
	 * Saves the callbacks of a promise.
	 */
	constructor(resolve: (elem: T) => void, reject?: (error: Error) => void) {
		this.resolve = resolve;
		this.reject = reject as any;
	}
}
