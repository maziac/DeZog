import * as assert from 'assert';
import {CustomCode} from '../remotes/zsimulator/customcode';



suite('CustomCode', () => {
	const jsCode=`
// Sample code
class PortOut {
	constructor(name, port) {
		this.name=name;
		this.port=port;
		this.value=0xFF;
		API.log("PortOut constructor called");
	}

	// Called when an 'out' is executed in Z80.
	out(port, value) {
		if(port == this.port) {
			// Store value internally
			this.value=value;
			// Send message to UI
			API.sendToCustomUi({
				command: 'my_'+this.name,
				value: value
			});
		}
	}
};


// This in port returns t-states (for testing purposes).
class PortInTime {
	constructor(name, port) {
		this.name=name;
		this.port=port;
	}

	// Called when an 'out' is executed in Z80.
	// The returned value depends on time.
	in(port) {
		if(port != this.port)
			return undefined;
		// Return value
		// Does not make sense. Is just for testing:
		return API.tstates;
	}
};

// This in port returns the set value.
class PortIn extends PortInTime {
	constructor(name, port) {
		super(name, port);
		this.value=0xFF;	// Default
	}

	// Sets the value that will be returned.
	setValue(value) {
		this.value = value;
	}

	// Called when an 'out' is executed in Z80.
	// Toggles on each call.
	in(port) {
		if(port != this.port)
			return undefined;
		// Return value
		return this.value;
	}
};

// Instantiate 2 out ports.
this.outPortA = new PortOut('PortA', 0x8000);
this.outPortB = new PortOut('PortB', 0x8001);

// Instantiate 2 in ports.
this.inPortA = new PortIn('PortA', 0x9000);
this.inPortA.setValue(90);
this.inPortB = new PortInTime('PortB', 0x9001);


/**
 * This function is called when time (t-states) advances.
 */
API.tick = () => {
	this.inPortA.setValue(2*API.tstates);
	// Generates an interrupt if t-states == 1000
	if(API.tstates == 1000)
		API.generateInterrupt(false, 0xF1);	// Databus=0xF1
}

/**
 * This function is called when an 'out' is executed in Z80.
 */
API.writePort = (port, value) => {
	// Go through all ports
	this.outPortA.out(port, value);
	this.outPortB.out(port, value);
}

/**
 * This function is called when an 'in' is executed in Z80.
 */
API.readPort = (port) => {
	// Check all ports and return a valid value
	let value = this.inPortA.in(port);
	if(value != undefined)
		return value;
	value = this.inPortB.in(port);
	return value;
}

/**
 * This function is called if new input
 * data is available.
 */
API.receivedFromCustomUi = (msg) => {
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


	test('out value', () => {
		const custom=new CustomCode(jsCode);
		// @ts-ignore: protected access
		const context=custom.context;
		assert.notEqual(undefined, context.outPortA);
		assert.notEqual(undefined, context.outPortB);

		//custom.writePort(0x7000, 0xAA);
		//assert.equal(defaultValue, context.outPortA.value);

		custom.writePort(0x8000, 0x55);
		assert.equal(0x55, context.outPortA.value);

		custom.writePort(0x8001, 0xA5);
		assert.equal(0xA5, context.outPortB.value);
		assert.equal(0x55, context.outPortA.value);
	});


	test('sendToCustomUi', () => {
		const custom=new CustomCode(jsCode);
		let sendToCustomUiCalled=false;
		custom.on('sendToCustomUi', msg => {
			sendToCustomUiCalled=true;
		});

		assert.equal(false, sendToCustomUiCalled);
		custom.writePort(0x8000, 0x55);
		assert.equal(true, sendToCustomUiCalled);
	});


	test('in/receiveMessage', () => {
		const custom=new CustomCode(jsCode);
		// @ts-ignore: protected access
		const context=custom.context;

		let result=custom.readPort(0x7000);
		assert.equal(undefined, result);

		result=custom.readPort(0x9000);
		assert.equal(90, result);

		result=custom.readPort(0x9001);
		assert.equal(0, result);

		// Receive
		const msg={
			command: 'joy0',
			data: 110
		};
		custom.receivedFromCustomUi(msg);
		result=custom.readPort(0x9000);
		assert.equal(110, result);
	});


	test('tick', () => {
		const custom=new CustomCode(jsCode);
		// @ts-ignore: protected access
		const context=custom.context;

		let result=custom.readPort(0x9000);
		assert.equal(90, result);
		result=custom.readPort(0x9001);
		assert.equal(0, result);

		custom.setTstates(12);
		custom.tick();	// Writes the t-states to the port for testing.
		result=custom.readPort(0x9000);
		assert.equal(24, result);	// 2 * t-states
		result=custom.readPort(0x9001);
		assert.equal(12, result);	// t-states

		custom.setTstates(24);
		custom.tick();	// Writes the t-states to the port for testing.
		result=custom.readPort(0x9000);
		assert.equal(48, result);	// 2 * t-states
		result=custom.readPort(0x9001);
		assert.equal(24, result);	// t-states
	});


	test('interrupt', () => {
		const custom=new CustomCode(jsCode);
		// @ts-ignore: protected access
		const context=custom.context;

		// Catch interrupt
		let interruptNon_maskable: boolean;
		let interruptData: number;
		let interruptOccurred=false;
		custom.on('interrupt', (non_maskable: boolean, data: number) => {
			interruptOccurred=true;
			interruptNon_maskable=non_maskable;
			interruptData=data;
		});

		custom.setTstates(0);
		custom.tick();		// No interrupt occurs
		assert.equal(false, interruptOccurred);

		custom.setTstates(1000);
		custom.tick();		// Interrupt occurs at 1000
		assert.equal(true, interruptOccurred);
		assert.equal(false, interruptNon_maskable!);
		assert.equal(0xF1, interruptData!);
	});

});

