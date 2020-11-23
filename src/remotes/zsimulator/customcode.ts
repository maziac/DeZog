import {EventEmitter} from 'events';
import {LogCustomCode} from '../../log';
import {Utility} from '../../misc/utility';



/**
 * A class that communicates directly with the custom javascript code.)
 */
class CustomCodeAPI extends EventEmitter {
	// The t-states that have passesd since start of simulation/start of debug session which starts at 0.
	public tstates: number=0;


	// Pointer to the object who will receive 'sendToCustomUi'.
	protected parent: CustomCode;

	/**
	 * Constructor.
	 * @param parent The custom code class for communication.
	 */
	constructor(parent: CustomCode) {
		super();
		this.parent=parent;
	}


	/**
	 * Just used to place a breakpoint.
	 */
	public debugBreak() {
	}


	/**
	 * Emits a message. Normally this means it is send to the ZSimulationView.
	 * Is called by the custom javascript code.
	 * User should not overwrite this.
	 * @param message The message object. Should at least contain
	 * a 'command' property plus other properties depending on the
	 * command.
	 */
	public sendToCustomUi(message: any) {
		LogCustomCode.log('sendToCustomUi: '+JSON.stringify(message));
		// Send message
		this.parent.emit('sendToCustomUi', message);
	}


	/**
	 * A message has been received from the ZSimulationView that
	 * shall be executed by the custom code.
	 * User can leave this undefined if he does not generate any message in
	 * the ZSimulation view.
	 * @param message The message object.
	 */
	public receivedFromCustomUi: (message: any) => void = undefined as any;


	/**
	 * Called when time has advanced.
	 * Can be overwritten by the user.
	 * Note: API.tstates contains the number of t-states passed
	 * since start of simulation/debug session.
	 */
	public tick: () => void = undefined as any;


	/**
	 * Reads from a port.
	 * Should be overwritten by the user if in ports are used.
	 * @param port The port number, e.g. 0x8000
	 * @return A value, e.g. 0x7F.
	 * If no port is found then undefined is returned.
	 */
	public readPort: (port: number) => number|undefined = (port) => undefined;


	/**
	 * Writes to a port.
	 * Should be overwritten by the user if out ports are used.
	 * @param port the port number, e.g. 0x8000
	 * @param value A value to set, e.g. 0x7F.
	 */
	public writePort: (port: number, value: number) => void=(port, value) => {};

	/**
	 * Simulates pulsing the processor's INT (or NMI) pin.
	 * Is called for the ULA vertical sync and also from custom code.
	 * @param non_maskable - true if this is a non-maskable interrupt.
	 * @param data - the value to be placed on the data bus, if needed.
	 */
	public generateInterrupt(non_maskable: boolean, data: number) {
		this.parent.emit('interrupt', non_maskable, data);
	}


	/**
	 * This is called once at the start as soon as the UI is ready to
	 * sent and receive message.
	 * You can override this to e.g. sent first initialized values to the UI.
	 * You can also leave this empty and set the values initially from the UI code.
	 * Note: The custom logic is instantiated before the UI.
	 */
	public uiReady: () => void=() => {};


	/**
	 * Writes a log.
	 * @param ...args Any arguments.
	 */
	public log(...args) {
		LogCustomCode.log(...args);
	}

}


/**
 * A class to execute custom code in the simulator.
 * It is called by the (Z80) ports and will execute the javascript code.
 * And it also received messages from the ZSimulationview and
 * as well can send messages to the ZSimulationView.
 */
export class CustomCode extends EventEmitter {

	/**
	 * Static method that calls 'eval' with a context.
	 */
	protected static evalInContext(js, context) {
		//# Return the results of the in-line anonymous function we call with the passed context
		return function () {
			//js='';
			try {
				return eval(js);
			}
			catch (e) {
				// In case of an error try to find where is occurred
				throw e;
			}
		}
		.call(context);
	}

	// The context the javascript code is executed.
	// Remains.
	protected context: any;

	// For 'reload' the js code text is stored here.
	protected jsCode: string;

	// The api object is stored here.
	protected api: CustomCodeAPI;


	// Constructor.
	constructor(jsCode: string) {
		super();
		// Create an API object
		this.api = new CustomCodeAPI(this);
		// Load for the first time
		this.load(jsCode);
	}


	/**
	 * Reloads the custom javascript code.
	 */
	public reload() {
		this.load(this.jsCode);
	}


	/**
	 * Reloads the custom javascript code.
	 */
	public load(jsCode: string) {
		// Remember
		this.jsCode = jsCode;

		// Create new empty context
		this.context={tmpAPI: this.api};

		// Execute/initialize the javascript
		CustomCode.evalInContext(`
// Preamble:
var global = this;
var API = global.tmpAPI;
// 'tmpAPI' is not visible to customer code. Use 'API' instead.
delete global.tmpAPI;

// Entry point for debugging:
API.debugBreak();

// Add a log to show that log starts
API.log('\\n=====================================');
API.log('Custom code: init start');

${jsCode}

API.log('Custom code: init end');
API.log('-------------------------------------\\n');`,
			this.context);	// This fills the context with the complete program.
	}



	/**
	 * This is called once at the start as soon as the UI is ready to
	 * sent and receive message.
	 * You can override this to e.g. sent first initialized values to the UI.
	 * You can also leave this empty and set the values initially from the UI code.
	 * Note: The custom logic is instantiated before the UI.
	 */
	public uiReady() {
		LogCustomCode.log('API.uiReady() called.');
		this.api.uiReady();
	}


	/**
	 * Reads from a port.
	 * Calls the custom js code.
	 * @param port The port number, e.g. 0x8000
	 * @return A value, e.g. 0x7F.
	 * If no port is found then undefined is returned.
	 */
	public readPort(port: number): number|undefined {
		this.logTstates();
		LogCustomCode.log('API.readPort('+Utility.getHexString(port,4)+'h)');
		// Catch probably errors.
		let value;
		try {
			value=this.api.readPort(port);
			LogCustomCode.log('  Reading value ' + Utility.getHexString(value,2) + 'h for port ' + Utility.getHexString(port,4) + 'h');
		}
		catch (e) {
			this.throwError("Error during executing custom java script in 'readPort': "+e.message);
		}
		return value;	// Might be undefined
	}


	/**
	 * Writes to a port.
	 * Calls the custom js code.
	 * @param port the port number, e.g. 0x8000
	 * @param value A value to set, e.g. 0x7F.
	 */
	public writePort(port: number, value: number) {
		this.logTstates();
		LogCustomCode.log('API.writePort('+Utility.getHexString(port, 4)+'h , '+Utility.getHexString(value, 2)+'h)');
		// Catch probably errors.
		try {
			this.api.writePort(port, value);
			}
		catch (e) {
			this.throwError("Error during executing custom java script in 'writePort': "+e.message);
		}
	}


	/**
	 * A message has been received from the ZSimulationView that will be
	 * passed to the custom js code.
	 * @param message The message object. Should at least contain
	 * a 'command' property plus other properties depending on the
	 * command.
	 */
	public receivedFromCustomUi(message: any) {
		LogCustomCode.log('API.receivedFromCustomUi: '+JSON.stringify(message));
		if (this.api.receivedFromCustomUi==undefined) {
			// Log that a message has been received without receiver.
			LogCustomCode.log("  But no custom 'this.receivedFromCustomUi' defined.");
		}
		else {
			// Catch probably errors.
			try {
				this.api.receivedFromCustomUi(message);
			}
			catch (e) {
				this.throwError("Error during executing custom java script in 'API.receivedFromCustomUi': "+e.message);
			}
		}
	}


	/**
	 * This sets the t-states prior to the next API call.
	 * @param tstates The number of tstates since beginning of simulation, beginning of the debug session which starts at 0.
	 */
	public setTstates(tstates: number) {
		this.api.tstates=tstates;
	}


	/**
	 * Logs the t-states.
	 */
	public logTstates() {
		LogCustomCode.log('tick: tstates='+this.api.tstates);
	}


	/**
	 * A call to inform the custom code about the advanced time.
	 * The user can control through 'timeSteps' in which interval
	 * this is called.
	 */
	public tick() {
		if (this.api.tick==undefined)
			return;	// No interest in 'tick'

		// Catch probably errors.
		try {
			this.logTstates();
			this.api.tick();
		}
		catch (e) {
			this.throwError("Error during executing custom java script in 'tick': "+e.message);
		}
	}


	/**
	 * Logs the error message and throws an exception.
	 * @param errorMessage The error text.
	 */
	protected throwError(errorMessage: string) {
		LogCustomCode.log(errorMessage);
		throw Error(errorMessage);
	}
};

