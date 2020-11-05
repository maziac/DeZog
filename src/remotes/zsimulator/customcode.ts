import {EventEmitter} from 'events';


// TODO: Move to static class.
function evalInContext(js, context) {
	//# Return the results of the in-line anonymous function we call with the passed context
	return function () {return eval(js);}.call(context);
}


// The default value returned if no peripheral is attached.
const IN_DEFAULT_VALUE=0xFF;


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
		this.context={};
		// Execute/initialize the javascript
		CustomCode.evalInContext(`
global = this;

/**
 * Sends a message to the ZSimulationView.
 */
function sendMessage(msg) {
	global.message = msg;
}


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
			sendMessage({
				command: 'my_'+this.name',
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
		return this.value;
	}
};

// Instantiate 2 out ports.
global.outPortA = new PortOut('PortA', 0x8000);
global.outPortB = new PortOut('PortB', 0x8001);

// Instantiate 2 in ports.
global.inPortA = new PortIn('PortA', 0x9000);
global.inPortB = new PortIn('PortB', 0x9001);


/**
 * This function is called when an 'out' is executed in Z80.
 */
global.portSet = (port, value) => {
	// Go through all ports
	global.outPortA.out(port, value);
	global.outPortB.out(port, value);
}

/**
 * This function is called when an 'in' is executed in Z80.
 */
global.portGet = (port) => {
	// Check all ports and return a valid value
	let value = global.inPortA.in(port);
	if(value != undefined)
		return value;
	value = global.inPortB.in(port);
	return value;
}

/**
 * This function is called by if new input
 * data is available.
 */
global.messageReceived = (msg) => {
	// Check if joy data
	switch(msg.command) {
		case 'joy0':
			global.inPortA.setValue(msg.data);
		break;
		case 'joy1':
			global.inPortB.setValue(msg.data);
		break;
	}
}
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
			result=evalInContext(jsCode, this.context);
			// Check if a message should be sent.
			if (this.context.message) {
				// Send message
				this.emit('sendMessage', this.context.message);
			}
		}
		catch (e) {
			throw Error('Error during executing custom java script: '+e.message);
		}
		return result;
	}


	/**
	 * Reads from a port.
	 * Calls the custom js code.
	 * @param port the port number, e.g. 0x8000
	 * @return a value, e.g. 0x7F, or 0xFF if no peripheral attached.
	 */
	public readPort(port: number): number {
		let value;
		// Wrap to catch errors
		this.evalJs(`global.portGet(0${port});`);
		if (value==undefined)
			return IN_DEFAULT_VALUE;
		return value;
	}


	/**
	 * Writes to a port.
	 * Calls the custom js code.
	 * @param port the port number, e.g. 0x8000
	 * @param value A value to set, e.g. 0x7F.
	 */
	public writePort(port: number, value: number) {
		// Wrap to catch errors
		this.evalJs(`global.portSet(${port}, ${value});`);
	}


	/**
	 * A message has been received from the webview that will be
	 * passed to the custom js code.
	 * @param message The message object. Shoudl at least contain
	 * a 'command' property plus other properties depending on the
	 * command.
	 */
	public messageReceived(message: any) {
		// Wrap to catch errors
		this.evalJs(`global.messageReceived(${message});`);
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

