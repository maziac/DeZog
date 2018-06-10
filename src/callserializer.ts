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
		this.timeout = 0;
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
				if(this.queue.length > 0)
					this.log('Error: queue is not empty, still ' + this.queue.length + ' elements.');
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
	 * If there is an method in the queue than it is executed.
	 */
	private runQueueFunction() {
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
	 * Static function to serialize several function calls.
	 * Creates a temporary CallSerializer object and adds the function calls to it.
	 * @param funcs (variadic) a number of functions calls/anonymous functions separated by ",".
	 */
	public static execAll(...funcs) {
		const queue = new CallSerializer("TempSerializer");
		queue.execAll(...funcs);
	}

}
