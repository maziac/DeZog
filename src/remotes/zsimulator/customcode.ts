import {EventEmitter} from 'events';
import {LogCustomCode} from '../../log';
import {Utility} from '../../misc/utility';




/**
 * A class to execute custom code in the simulator.
 * It is called by the (Z80) ports and will execute the javascript code.
 * And it also received messages from the ZSimulationview and
 * as well can send messages to the ZSimulationView.
 */
export class CustomCode extends EventEmitter {

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

	constructor(jsCode: string) {
		super();
		// Create new empty context
		this.context={API: this};

		jsCode=`
// Sample code
class PortOut {
	constructor(name, port) {
		this.name=name;
		this.port=port;
		this.value=0xFF;
	}

	// Called when an 'out' is executed in Z80.
	out(port, value) {
		if(port == this.port) {
			// Store value internally
			this.value=value;
			// Send message to UI
			ApiSendMessage({
				command: 'my_'+this.name,
				value: value
			});
		}
	}
};

class PortIn {
	constructor(name, port) {
		this.name=name;
		this.port=port;
		this.value=0xFF;	// Default
	}

	// Sets the value that will be returned.
	setValue(value) {
		this.value = value;
	}

	// Called when an 'out' is executed in Z80.
	in(port) {
		if(port != this.port)
			return undefined;
		// Return value
		this.value=~this.value;
		return this.value;
	}
};

// Instantiate 2 out ports.
this.outPortA = new PortOut('PortA', 0x8000);
this.outPortB = new PortOut('PortB', 0x8001);

// Instantiate 2 in ports.
this.inPortA = new PortIn('PortA', 0x9000);
this.inPortA.setValue(90);
this.inPortB = new PortIn('PortB', 0x9001);
this.inPortB.setValue(91);


/**
 * This function is called when an 'out' is executed in Z80.
 */
this.portSet = (port, value) => {
	// Go through all ports
	this.outPortA.out(port, value);
	this.outPortB.out(port, value);
}

/**
 * This function is called when an 'in' is executed in Z80.
 */
this.portGet = (port) => {
	// Check all ports and return a valid value
	let value = this.inPortA.in(port);
	if(value != undefined)
		return value;
	value = this.inPortB.in(port);
	return value;
}

/**
 * This function is called by if new input
 * data is available.
 */
this.receivedMessage = (msg) => {
	// Check if joy data
	switch(msg.command) {
		case 'joy0':
			this.inPortA.setValue(msg.data);
		break;
		case 'joy1':
			this.inPortB.setValue(msg.data);
		break;
	}
}
`;


		// Execute/initialize the javascript
		CustomCode.evalInContext(`
// Preamble:

/**
 * Sends a message to the ZSimulationView.
 */
function ApiSendMessageIntern(msg) {
	this.API.sendMessage(msg);
}

// Make sure this is the this from the context.
const ApiSendMessage = ApiSendMessageIntern.bind(this);

${jsCode}

`,
			this.context);	// This fills the context with the complete program.
	}


	/**
	 * Evaluates the js code in jsCode.
	 * If an error occurs the exception is catched
	 * and a new Exception is thrown with additional info
	 * that this is an error in custom code.
	 */
	protected evalJs(jsCode: string): any {
		let result;
		try {
			result=CustomCode.evalInContext(jsCode, this.context);
		}
		catch (e) {
			this.throwError('Error during executing custom java script: '+e.message);
		}
		return result;
	}


	/**
	 * Reads from a port.
	 * Calls the custom js code.
	 * @param port The port number, e.g. 0x8000
	 * @return A value, e.g. 0x7F, or 0xFF if no peripheral attached.
	 * If no port is found then undefined is returned.
	 */
	public readPort(port: number): number|undefined {
		LogCustomCode.log('Reading port '+Utility.getHexString(port, 2)+'h');
		// Wrap to catch errors
		const value=this.evalJs(`this.portGet(${port});`);
		LogCustomCode.log('  Read value: '+Utility.getHexString(value, 4)+'h');
		return value;	// Might be undefined
	}


	/**
	 * Writes to a port.
	 * Calls the custom js code.
	 * @param port the port number, e.g. 0x8000
	 * @param value A value to set, e.g. 0x7F.
	 */
	public writePort(port: number, value: number) {
		LogCustomCode.log('Write '+Utility.getHexString(value, 4)+'h to port '+Utility.getHexString(port, 2)+'h');
		// Wrap to catch errors
		this.evalJs(`this.portSet(${port}, ${value});`);
	}


	/**
	 * A message has been received from the ZSimulationView that will be
	 * passed to the custom js code.
	 * @param message The message object. Should at least contain
	 * a 'command' property plus other properties depending on the
	 * command.
	 */
	public messageReceived(message: any) {
		LogCustomCode.log('Message '+JSON.stringify(message)+' received.');
		if (this.context.receivedMessage==undefined) {
			// Log that a message has been received without receiver.
			LogCustomCode.log("  But no custom 'this.receivedMessage' defined.");
		}
		else {
			// Wrap to catch errors
			this.evalJs(`this.receivedMessage(${JSON.stringify(message)});`);
		}
	}


	/**
	 * Emits a message. Normally this means it is send to the ZSimulationView.
	 * Is called by the custom javascript code.
	 * @param message The message object. Should at least contain
	 * a 'command' property plus other properties depending on the
	 * command.
	 */
	public sendMessage(message: any) {
		LogCustomCode.log('Message '+JSON.stringify(message)+' send.');
		// Send message
		this.emit('sendMessage', message);
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




/* OR:
var result = function(str){
return eval(str);
}.call(context, somestring);
*/

/*
Example code

try {
	const context={a: 1, b: 2};
	evalInContext(`
global = this;

function sendMessage(obj) {
	global.msg = obj;
}


global.a++; global.b++; global.a+global.b;
global.c=0;  // New property
class MyClass {
	constructor() {
		this.x=10;
	}
	add(diff) {
		this.x+=diff;
	}
};
global.myclass=new MyClass();
global.myclass.add(8);


global.portSet = (port, value) => {
		global.myclass.add(value);
		sendMessage({ma:9, mb: 8});
	}

global.portGet = (port) => {
		return 99;
	}
			`,
		context);

	evalInContext(`
global.portSet(0x9000,10);
			`,
		context);
	const result1=evalInContext(`
global.portGet(0x8000);
			`,
		context);

	const msg={command: "inval1", value: "on"};
	evalInContext(`
global.receivedMsg(${msg});
			`,
		context);
	evalInContext(`
global.portGet(0x8000);
			`,
		context);


	evalInContext('this.a++; this.b++; this.a + this.b', context);
	const result2=evalInContext('a++; this.b++; this.a + this.b', context);
	console.log(result1);
	console.log(result2);
}
catch (e) {
	console.log(e);
}


try {
	const context={a: 1, b: 2};
	const result1=evalInContext(' with (this) {'+'a++; b++; a + b', context);
	const result2=evalInContext('a++; this.b++; this.a + this.b', context);
	console.log(result1);
	console.log(result2);
}
catch (e) {
	console.log(e);
}
*/

