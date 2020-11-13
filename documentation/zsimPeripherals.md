# zsim (Internal Z80 Simulator) - Periherals

Note: This document contains [plantuml](https://plantuml.com/de/sequence-diagram) message sequence charts. On github these are not rendered. Use e.g. vscode with a suitable plugin to view the file correctly.

The zsim Z80 simulator basically simulates the Z80 CPU and some RAM or ROM.

It additionally offers a few interfaces to the outside world mainly for the ZX Spectrum like computers.
E.g. The ZX Spectrum screen display or the ZX Spectrum keyboard input.

But it is also possible to instruct the simulator to simulate other custom behavior.

For example to add own ports for input and output with custom behavior.

There are 2 parts you can add:
- the business logic, which is referred to as "Custom Logic", and
- the UI, which is referred to as "Custom UI".

The business logic is directly added as javascript code to the simulator.
The UI code is added to the ZSimulator view.

At the end of this document there is an example that will add a joystick interface to show both.


# Configuration

In order to use custom code you need to tell zsim to use it.

The related zsim properties are shown here:
~~~json
"zsim": {
	"customCode": {
		"debug": true,
		"jsPath": "myPeripheral.js",
		"uiPath": "myUi.js",
		"timeStep": 1000
	}
}
~~~

- debug: Is false by default. If enabled the debug area is added with a few buttons e.g. to reload the javascript code. This is very handy to allow fast turn around times.
- jsPath: The path to your javascript code, i.e. the Custom Logic. If not present then no additional code is loaded. This will work also with debug=false.
- uiPath: The path to your html/javascript code for the UI, i.e. the Custom UI. If not present then no additional code for the UI is loaded. This will work also with debug=false.
- timeStep: If defined your javascript code will be called additionally each time that 'timeStep' number of t-states have been passed.


# API

The API contains the ports (in and out) and a time base.
~~~js
// The t-states that have passesd since start of simulation/start of debug session which starts at 0.
API.tstates: number;

/**
 * Emits a message. Normally this means it is send to the ZSimulationView.
 * Is called by the custom javascript code.
 * User should not overwrite this.
 * @param message The message object. Should at least contain
 * a 'command' property plus other properties depending on the
 * command.
 */
API.sendToCustomUi(message: any);


/**
 * A message has been received from the ZSimulationView that
 * shall be executed by the custom code.
 * The user can leave this undefined if he does not generate any message in
 * the ZSimulation view.
 * @param message The message object.
 */
API.receivedFromCustomUi(message: any);


/**
 * Called when time has advanced.
 * Can be overwritten by the user.
 */
API.tick();


/**
 * Reads from a port.
 * Should be overwritten by the user if in-ports are used.
 * @param port The port number, e.g. 0x8000
 * @return A value, e.g. 0x7F.
 * If no port is found then undefined is returned.
 */
API.readPort(port: number): number|undefined;


/**
 * Writes to a port.
 * Should be overwritten by the user if out-ports are used.
 * @param port the port number, e.g. 0x8000
 * @param value A value to set, e.g. 0x7F.
 */
API.writePort(port: number, value: number);

/**
 * Writes a log.
 * @param ...args Any arguments.
 */
API.log(...args);
~~~

The basic program flow is shown here:
~~~puml
hide footbox
title OUT (C),A
participant zsim as "Dezog\nzsim"
participant custom as "Custom Code"

note over zsim: ld bc,0x8000\nld a,0x6B\nout (c),a
zsim -> custom: API.writePort(0x8000, 0x6B)
alt address is correct
note over custom: Do something
end
~~~

~~~puml
hide footbox
title IN A,(C)
participant zsim as "Dezog\nzsim"
participant custom as "Custom Code"

note over zsim: ld bc,0x9000\nin a,(c)
zsim -> custom: API.readPort(0x9000)

alt address is correct
zsim <- custom: 0xF7
else
zsim <- custom: undefined
end
~~~

~~~puml
hide footbox
title Time Advance
participant zsim as "Dezog\nzsim"
participant custom as "Custom Code"

note over zsim: Wait for 'timeStep'\nnumber of t-states
zsim -> custom: API.tick()
...
note over zsim: Wait for 'timeStep'\nnumber of t-states
zsim -> custom: API.tick()
...
note over zsim: Wait for 'timeStep'\nnumber of t-states
zsim -> custom: API.tick()
...
~~~

~~~puml
hide footbox
title Generate Interrupt
participant zsim
participant custom as "Custom Code"

...
note over zsim: Wait for 'timeStep'\nnumber of t-states
zsim -> custom: API.tick()\n(or read/writePort)
note over custom: Decide to generate an interrupt
zsim <- custom: API.generateInterrupt\n(non_maskable, data)
~~~

Note: On each call (tick, readPort, writePort) the variable API.tstates contains the number of t-states since start of simulation/start of debug session.


To use the API you have to write javascript code and provide code for the 'API.tick', 'API.readPort', 'API.writePort' and 'API.receivedFromCustomUi' methods. 'API.sendToCustomUi' must not be overwritten and can be called by the custom code.

If you don't provide code for any method then the method will not be called by DeZog.

So the minimal implementation for an out-port is:
~~~js
API.writePort = (port, value) => {
	if(port == my_port) {
		// Do something
	}
}
~~~
Note: 'my_port' is a number you need to define. Of course, instead of checking the whole 16 bit port address you can also check only some of the bits of the port address or none at all. You can exactly mimic the HW as you want.

The minimal implementation for an in-port would be:
~~~js
API.readPort = (port) => {
	if(port == my_port) {
		// Return your value
		return my_value;
	}
	return undefined;
}
~~~
Note: Again you check for your 'my_port' and then return a number. If none of your peripherals match with the port you must return undefined.

Here is another example with 2 in ports that just decode the lowest 2 bits of the port address.
~~~js
API.readPort = (port) => {
	if((port & 0x03) == 0x02)
		return my_value1;
	if((port & 0x03) == 0x03)
		return my_value2;
	return undefined;
}
~~~


There exists a property in API that counts the number of t-states since start of simulation. You can simply get it with 'API.tstates'.
This might be interesting if you have time dependent HW to simulate.

Furthermore the method 'API.tick()' is called regularly by DeZog if defined.
This is called independently of 'readPort' and 'writePort'.
The interval at which this is called is set via 'zsim.customCode.timeStep' in launch.json.
If 'timeStep' is not defined 'tick()' is not called.


# Logging

All calls to/from the custom code are logged. You need to enable the log target in the DeZog's preferences:
~~~
dezog.customcode.logpanel=true
~~~
The output can be found in the OUTPUT panel if it has "DeZog Custom Code" selected.

Furthermore you can also place logs inside this window from your custom code by calling
~~~js
API.log(...args)
~~~

Notes:
- All logs are cached for performance reasons. If too many logs are being made then logged lines are being trashed. If that happened you see a ```[...]```in the logs.
- If for some time no messages are logged then this is indicated by ```...```(not to be confused with ```[...]```).



# UI

So, all port business logic is put into the javascript code at 'customCode.jsPath'.
But what if you want to display those values or if you want to get input values from the user...
To simply output values you could, of course, use the ```API.log``` function.
For simple designs this could already be sufficient.

To get a more convenient output or if you would like to input data you can do so by executing html/js inside the ZSimulation view.
The html source is extensible. You do so by defining the
~~~json
"customCode": {
	"uiPath": "your_file"
}
~~~

The UI code and your javascript business logic communicate asynchronously. This is very important to understand. I.e. any UI activity will be submitted to the business logic with a delay.
And vice versa any output that is already present in the custom business logic and submitted to the UI is also presented with a lag.
However the UI is updated frequently (every x t-states) and everytime the debugger stops. So you should rarely notice any delay.

~~~puml
hide footbox
title Communication from business logic to UI
participant js as "javascript\nCustom Logic"
participant dezog as "DeZog\nzsim view"
participant ui as "ZSimulator View\nCustom UI"

js -> dezog: API.sendToCustomUi(msg)
dezog -> ui: UIAPI.receivedFromCustomLogic(msg)
note over ui: Update UI element
~~~

~~~puml
hide footbox
title Communication from UI to business logic
participant js as "javascript\nCustom Logic"
participant dezog as "DeZog\nzsim view"
participant ui as "ZSimulator View\nCustom UI"

dezog <- ui: API.sendToCustomLogic(msg)
js <- dezog: API.receivedFromCustomUi(msg)
note over js: Work with input
~~~

Here are 2 basic examples:
~~~puml
hide footbox
title E.g. Show an out-port
participant zsim as "Dezog\nzsim"
participant js as "javascript\nCustom Logic"
participant dezog as "DeZog\nzsim view"
participant ui as "ZSimulator View\nCustom UI"

note over zsim: ld bc,0x8000\nld a,0x6B\nout (c),a
zsim -> js: API.writePort(0x8000, 0x6B)
js -> dezog: API.sendToCustomUi({\n command: 'showPort',\n port: 0x8000,\n value: 0x6B})
dezog -> ui: UIAPI.receivedFromCustomLogic({\n command: 'showPort',\n port: 0x8000,\n value: 0x6B})
note over ui: Manipulate DOM tree to show\nthe port with the value.
~~~

~~~puml
hide footbox
title E.g. Get input to use for an in-port
participant zsim as "Dezog\nzsim"
participant js as "javascript\nCustom Logic"
participant dezog as "DeZog\nzsim view"
participant ui as "ZSimulator View\nCustom UI"

...
note over ui: User action,\ne.g. user pressed\nbutton.
dezog <- ui: UIAPI.sendToCustomLogic({\n command: 'inputForPort',\n port: 0x9000,\n value: 0x02})
js <- dezog: API.receivedFromCustomUi({\n command: 'inputForPort',\n port: 0x9000,\n value: 0x02})
note over js: Store the data.
...
...
note over zsim: ld bc,0x9000\nin a,(c)
zsim -> js: API.readPort(0x9000)
zsim <- js: 0x02
~~~
The asynchronicity can be seen very clearly: When the user presses a button then the info is sent to the business logic but needs to be stored as it cannot immediately been processed.
Later, when the Z80 CPU executes an IN instruction it reads from teh port and the value can be passed to the CPU.

Notes:
- For performance reasons you should send a message to the UI only if necessary. E.g. you should not send a message on every port-write. Instead you should only send a message if the value really changed.

## UIAPI

~~~js
/**
 * A message has been received from the custom code that
 * shall be executed by the custom UI code.
 * User can leave this undefined if he does not generate any message in
 * the custom code view.
 * receivedFromCustomUi(message: any) => void;
 * @param message The message object. User defined.
 */
receivedFromCustomLogic(msg: any);

/**
 * Method to send something from the Custom UI to the Custom Logic.
 * Wraps the message.
 * @param msg The custom message to send.
 */
sendToCustomLogic(msg: any);

/**
* Writes a log.
* @param ...args Any arguments.
*/
log(...args);
~~~



# Design

## ZX Keyboard

TODO: Muss geändert werden: bei "IN A,(C) wird eine Anfrage an den ZSimulationView geschickt.
Der verwaltet selbst die gesetzten/nicht gesetzten Keyboard Werte.
Und vergleicht dann die Port Adresse.
Sollte keine Keyboard-Adresse ausgewählt sein gibt er die weiter an den Custom Code.


~~~puml
hide footbox
'title
participant zsim
participant ports as "zsim ports"
participant view as "ZSimulationView"
participant html as "HTML/javascript"

note over html: Key pressed
view <- html: webViewMessageReceived\n('keyChanged')
view <- view: keyChanged(key, on)
ports <- view: setPortValue(port, value)
...
note over zsim: in a,(c)
zsim -> ports: getPort(port)
zsim <- ports: value

...
ports -> view: portChanged(port, value)
view -> view: sendMessageToWebView\n('portChanged', port, value)
view -> html: postMessage
~~~


# Save states

Will not work for the custom javascript code.
I.e. save/restore state will work but no state of the custom code is saved/restored.


# Open

- ZSimulationView needs to retain state. Is it done?
