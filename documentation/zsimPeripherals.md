# zsim (Internal Z80 Simulator) - Periherals

The zsim Z80 simulator basically simulates the Z80 CPU and some RAM or ROM.

It additionally offers a few interfaces to the outside world mainly for the ZX Spectrum like computers.
E.g. The ZX Spectrum screen display or the ZX Spectrum keyboard input.

But it is also possible to instruct the simulator to simulate other custom behavior.

For example to add own ports for input and output with custom behavior.

The simulator window is run in javascript. The javascript code can be extended with custom code.
There are special API functions that allow communication with the Z80 simulation.
As you can manipulate the HTML directly it is also possible to add a custom UI to it.

At the end of this document there is an example that will add a joystick interface.


# Configuration

In order to use custom code you need to tell zsim to use it.

The related zsim properties are shown here:
~~~
"zsim": {
	"debug": true,
	"jsPath": "myPeripheral.js"
}
~~~

- debug: Is false by default. If enabled the debug area is added with a few buttons e.g. to reload the javascript code. This is very handy to allow fast turn around times.
- jsPath: The path to your javascript code. If not present then no additional code is loaded. This will work also with debug=false.


# API

The API contains the ports (in and out) and a time base.

The basic program flow is shown here:
~~~puml
hide footbox
title OUT (C),A
participant zsim
participant custom as "Custom Code"

note over zsim: ld bc,0x8000\nld a,0x6B\nout (c),a
zsim -> custom: portOut(time, 0x8000, 0x6B)
~~~

~~~puml
hide footbox
title IN A,(C)
participant zsim
participant custom as "Custom Code"

note over zsim: ld bc,0x9000\nin a,(c)
zsim -> custom: portIn(time, 0x9000)

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

zsim -> custom: time(1000)
...
zsim -> custom: time(2000)
...
zsim -> custom: time(3000)
...
zsim -> custom: time(4000)
...
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

