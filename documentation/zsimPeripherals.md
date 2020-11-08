# zsim (Internal Z80 Simulator) - Periherals

Note: This document contains [plantuml](https://plantuml.com/de/sequence-diagram) message sequence charts. On github these are not rendered. Use e.g. vscode with a suitable plugin to view the file correctly.

The zsim Z80 simulator basically simulates the Z80 CPU and some RAM or ROM.

It additionally offers a few interfaces to the outside world mainly for the ZX Spectrum like computers.
E.g. The ZX Spectrum screen display or the ZX Spectrum keyboard input.

But it is also possible to instruct the simulator to simulate other custom behavior.

For example to add own ports for input and output with custom behavior.

There are 2 parts you can add:
- the business logic
- the UI

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
- jsPath: The path to your javascript code. If not present then no additional code is loaded. This will work also with debug=false.
- uiPath: The path to your html/javascript code for the UI. If not present then no additional code for the UI is loaded. This will work also with debug=false.
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
API.sendMessage(message: any);


/**
 * A message has been received from the ZSimulationView that
 * shall be executed by the custom code.
 * The user can leave this undefined if he does not generate any message in
 * the ZSimulation view.
 * @param message The message object.
 */
API.receivedMessage(message: any);


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
participant zsim
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
participant zsim
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
participant zsim
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

Note: On each call (tick, readPort, writePort) the variable API.tstates contains the number of t-states since start of simulation/start of debug session.


To use the API you have to write javascript code and provide code for the 'API.tick', 'API.readPort', 'API.writePort' and 'API.receivedMessage' methods. 'API.sendMessage' must not be overwritten and can be called by the custom code.

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

The UI code and your javascript business logic communicate asynchronously.

~~~puml
hier weiter
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
