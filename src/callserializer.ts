import { Log } from './log';



/**
 * Class that serializes calls.
 * I.e. this class takes care that asynchronous calls are executed one after the other.
 */
export class CallSerializer {

	/// Call queue
	private queue = new Array();

	/// name of the queue, for debugging.
	private name: string;

	/// Time to print a log message that the queue is not "clean". In secs.
	private timeout: number;


	/// The timer for the log message.
	private timer: any;

	/// Enable/disable logging
	private logEnabled: boolean;

	/// A progress indicator for debugging. Set this in your function to check
	/// later how far it got.
	protected dbgProgressIndicator: string;


	/**
	 * Constructor.
	 * @param name Name of the queue (logging)
	 * @param enableLog Enables/disables logging (logging)
	 * @param timeout The time to print a log message if queue is not "clean" (empty)
	 */
	constructor(name: string, enableLog?: boolean, timeout?: number) {
		this.name = name;
		this.timeout = (timeout == undefined) ? 5*1000: timeout*1000;
		this.logEnabled = (enableLog == undefined) ? false : enableLog;
//		this.timeout = 0;
	}


	/**
	 * Adds the method (call) to the queue.
	 * If this is the only call in the queue it is directly executed.
	 * @param func Function to executed (data that is passed is the call serializer (this))
	 * @param funcName A human redable name for debugging
	 */
	public exec(func: {(callserializer)} = (callserializer) => {}, funcName?: string) {
		this.queue.push({func: func, name: funcName});
		Log.log('Pushed (size=' + this.queue.length + ', name=' + funcName + '), ' + func);

		// Timer to check that queue gets empty
		if(this.timeout != 0 && this.logEnabled) {
			// Cancel previous timer
			//if(this.timer)
			clearTimeout(this.timer);
			// Restart timer
			this.timer = setTimeout(() => {
				if(this.queue.length > 0) {
					this.log('\n==================================================');
					this.log('Error: queue is not empty, still ' + this.queue.length + ' elements.');
					// First entry
					const entry = this.queue[0];
					this.log('First entry: name=' + entry.funcName);
					Log.log('' + entry.func);
					this.log('\n==================================================\n');
				}
				clearTimeout(this.timer);
			}, this.timeout);
			this.timer.unref();
		}

		if(this.queue.length == 1) {
			// Execute
			this.runQueueFunction();
		}
		this.log('exec: queue.size = ' + this.queue.length);
	}


	/**
	 * Add several functions to the queue.
	 * @param funcs (variadic) a number of functions calls/anonymous functions separated by ",".
	 */
	public execAll(...funcs) {
		funcs.forEach(func => { this.exec(func); });
	}


	/**
	 * Should be called from the asynchronous method to inform the call is
	 * finished.
	 */
	public endExec() {
		// Remove first element = this method call
		const entry = this.queue.shift();
		// Log
		Log.log('Popped (size=' + this.queue.length + ', name=' + entry.funcName + '), ' + entry.func);
		// Execute next
		if(this.queue.length != 0)
			this.runQueueFunction();
		this.log('endExec: queue.size = ' + this.queue.length);
	}


	/**
	 * Sets the debug progress indicator to some text.
	 * Can be used to check how far we got inside the function.
	 * @param text Some text.
	 */
	public setProgress(text: string) {
		this.dbgProgressIndicator = text;
	}


	/**
	 * If there is an method in the queue than it is executed.
	 */
	private runQueueFunction() {
		// Clear progress indicator
		this.dbgProgressIndicator = "Start";
		// execute directly
		this.log('runQueueFunction ' + this.queue[0].name);
		const method = this.queue[0].func;
		//method.call(this);
		method(this);
	}


	/**
	 * Logs the given args if logEnabled.
	 */
	private log(...args) {
		if(!this.logEnabled)
			return;
		Log.log(this.name + '.CallSerializer: ', ...args);
		Log.log(this.name + '.CallSerializer: ', ...this.queue);
	}


	/**
	 * Use for debugging.
	 * @returns{progress, func} the current and progress function. Use to debug where it hangs.
	 * progress contains the current value of the this.dbgProgressIndicator variable.
	 */
	public getCurrentFunction(): {progress: string, func: any} {
		const method = {progress: this.dbgProgressIndicator, func: undefined};
		if(this.queue.length > 0)
			method.func = this.queue[0].func;
		return method;
	}


	/**
	 * Use for debugging. Clears the complete selrializer queue.
	 */
	public clrQueue() {
		this.queue.length = 0;
	}


	/**
	 * Static function to serialize several function calls.
	 * Creates a temporary CallSerializer object and adds the function calls to it.
	 * @param funcs (variadic) a number of functions calls/anonymous functions separated by ",".
	 */
	public static execAll(...funcs) {
		const queue = new CallSerializer("TempSerializer");
		queue.execAll(...funcs);
	}

}
