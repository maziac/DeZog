

// If there is a pause of 2 seconds between logs then an additional indication is logged.
const PAUSE_LOG_TIME = 2;


/**
 * Class for logging.
 * This allows to instantiate a new class and log there into an own channel.
 * Or, you can use static methods to log globally.
 * When logging into a channel this is logged by vscode also into a file located
 * at /Users/.../Library/Application Support/Code.
 * You can find it by opening the command palette and typing "Developer: open Extensions logs Folder".
 */
export class Log {

	/// Output logging to the "OUTPUT" tab in vscode.
	/// This is of type vscode.OutputChannel. But it can be used as it would imply a
	/// dependency to vscode. And with a dependency to vscode mocha unit tests are not possible.
	protected logOutput;

	/// Last time a log has been written.
	protected lastLogTime = Date.now();

	/// The index of the call stack that is used for the function name.
	/// -1 = caller name disabled.
	protected callerNameIndex = -1;

	// If set then the logs are not written directly to the console but cached.
	// The cache has only a limited amount of space. Older entries are lost.
	protected cache: Array<string>;

	// The used cache length.
	protected cacheLength=0;

	// Stores info if logs have been removed from the cache.
	protected cacheLogsLost=false;

	// The time it is waited before the cached logs are output.
	protected cacheTime=100;	// ms


	/**
	 * Initializes the logging. I.e. enables/disables logging to
	 * vscode channel and file.
	 * @param channelOutput vscode.OutputChannel. The name of the channel output.
	 */
	public static init(channelOutput: any) {
		LogGlobal.init(channelOutput);
		LogGlobal.callerNameIndex++;
	}


	/**
	 * Logs to console.
	 * Puts the caller name ('class.method'. E.g. "ZesaruxDebugSession.initializeRequest")
	 * in front of each log.
	 * @param args The log arguments
	 */
	public static log(...args) {
		LogGlobal.log(...args);
	}


	/**
	 * @return true if either logging to file or to channel is enabled (global logging).
	 */
	public static isEnabled(): boolean {
		return LogGlobal.isEnabled();
	}


	/**
	 * Initializes the logging. I.e. enables/disables logging to
	 * vscode channel and file.
	 * @param channelOutput vscode.OutputChannel. If defined the name of the channel output.
	 * @param callerName If true the name of the calling method is shown.
	 */
	public init(channelOutput: any, callerName = true) {
		if(this.logOutput)
			this.logOutput.dispose();
		this.logOutput = channelOutput;
		if(callerName)
			this.callerNameIndex = 3;
	}


	/**
	 * Logs to console.
	 * Puts the caller name ('class.method'. E.g. "ZesaruxDebugSession.initializeRequest")
	 * in front of each log.
	 * @param args The log arguments
	 */
	public log(...args) {
		// check time
		const diffTime=(Date.now()-this.lastLogTime)/1000;
		let outputcache=false;
		if(diffTime > PAUSE_LOG_TIME) {
			// > 2 secs
			this.outputCache();
			this.write('...');
			this.write('Pause for ' + diffTime + ' secs.');
			this.write('...');
			this.outputCache();
			outputcache=true;	// Make sure this line is output
		}
		// write log
		//const who = this.callerName();
		//this.write(who, ...args);
		this.write(...args);
		// Output anyway
		if (outputcache)
			this.outputCache();
		// get new time
		this.lastLogTime = Date.now();
	}


	/**
	 * @return true if either logging to file or to channel is enabled.
	 */
	public isEnabled(): boolean {
		return (this.logOutput != undefined);
	}


	/**
	 * Writes to console and file.
	 * @param format A format string for the args.
	 * @param args the values to write.
	 */
	protected write(...args) {
		const text= args.map(elem => elem.toString()).join(', '); //util.format(format, ...args);
		try {
			// write
			this.appendLine(text);
		}
		catch(e) {
		}
	}


	/**
	 * Simply outputs text.
	 * @param text The text plus a newline is printed.
	 */
	public appendLine(text: string) {
		// write to console
		if (this.logOutput) {
			if (this.cache) {
				// Check for max length
				if (this.cache.length>=this.cacheLength) {
					this.cache.shift();
					this.cacheLogsLost=true;
				}
				if (text==undefined)
					console.log("");
				this.cache.push(text);
				// Set timeout to print cached values
				if (this.cache.length==1) {
					setTimeout(() => {
						this.outputCache();
					}, this.cacheTime);
				}
			}
			else {
				// Direct output
				this.logOutput.appendLine(text);
			}
		}
	}


	/**
	 * Outputs the cache to console.
	 * Does nothing if no cache is set.
	 */
	public outputCache() {
		if (this.cache) {
			// Check if data lost
			if (this.cacheLogsLost) {
				this.logOutput.appendLine('[...]');
			}
			// Output
			for (const text of this.cache) {
				this.logOutput.appendLine(text);
			}
			// Clear cache
			this.cache.length=0;
			this.cacheLogsLost=false;
		}
	}


	/**
	 * Sets the cache length.
	 * @param length The cache length. If 0 the cache is disabled.
	 */
	public setCacheLength(length: number) {
		this.cache=(length > 0) ? new Array<string>() : undefined as any;
		this.cacheLength=length;
		this.cacheLogsLost=false;
	}


	/**
	 * Returns the caller name.
	 * @returns 'class.method'. E.g. "ZesaruxDebugSession.initializeRequest:"
	 */
	protected callerName(): string {
		// Diabled
		return '';

		// Check if caller name is configured
		if(this.callerNameIndex < 0)
			return '';
		// Throw error to get call stack
		try {
			throw new Error();
		}
		catch(e) {
			try {
				// Find caller name
				return e.stack.split('at ')[this.callerNameIndex].split(' ')[0] + ': ';
			}
			catch (e) {
				return 'Unknown';
			}
		}
	}

}


/// Global logging is instantiated.
export let LogGlobal=new Log();

/// Logging for custom code is instantiated.
export let LogCustomCode=new Log();
LogCustomCode.setCacheLength(100);

/// Socket logging.
export let LogSocket = new Log();

// Special socket logging
export let LogSocketCommands: Log;
