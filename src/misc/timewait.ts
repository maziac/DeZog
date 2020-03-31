import {Utility} from "./utility";


export class TimeWait {

	// THe
	protected time: number;

	// The delta time.
	protected intervalMs: number;

	// The time to wait.
	protected waitTimeMs: number;

	/**
	 * Constructor.
	 * The object should be called periodically. It takes care ofthetime by itself.
	 * If the interval time is exceeded. It will execute a wait for 'waitTimeMs'.
	 * @param intervalMs The time between to waits.
	 * @param waitTimeMs The wait time.
	 */
	constructor(intervalMs: number, waitTimeMs: number) {
		this.time=Date.now();
		this.intervalMs=intervalMs;
		this.waitTimeMs=waitTimeMs;
		this.time=Date.now(); //+this.intervalMs;
	}


	/**
	 * Immediately waits.
	 */
	/*
	public async wait(): Promise<void> {
		// Execute wait
		await Utility.timeout(this.waitTimeMs);
		// New time
		this.time=Date.now()+this.intervalMs;
	}
	*/

	/**
	 * If time is up it will wait for waitTimeMs.
	 * Otherwise it returns immediately.
	 * The first time this is called it does immediately wait.
	 */
	public async waitAtInterval(): Promise<void> {
		const currentTime=Date.now();
		if (currentTime<this.time)
			return;
		// Execute wait
		await Utility.timeout(this.waitTimeMs);
		// New time
		this.time=Date.now()+this.intervalMs;
	}
}
