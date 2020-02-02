# Adding A New Remote

This document will describe but needs to be done (implemented) in order to support a new Remote.


# What is a 'Remote'?

A Remote is normally an external emulator that is running independently of DeZog.
ZesarUX e.g is such a Remote.
It is conencteed via some interface (for ZEsarUX this is a socket) and a protocol (for ZEsarUX ZRCP - ZEsarUX Remote Communication Protocol).

But a Remote could also be real HW. E.g. real ZX Next hardware.
The ZX Next can be connected via a serial interface to the PC.
Via a USB-to-Serial Interface the serial data is available e.g. at /dev/tty.usbserial (macOS).


# Required Classes

To add a new Remote it need to derive from the RemoteClass.
The RemoteClass defines an API that is used by DeZog to communicate with the real Remote.
RemoteClass includes all methods that you might or must override.
All must overrides include an 'assert' in the RemoteClass.
The other are simply empty.
If you decide to override some of the non-assert methods you can offer additional functionality.
The debug adapter will check by itself which of the functions have been overwritten.

Since you also need a transport layer to communicate with Remote it is normally wise to separate it in an own class.
(This also makes it possible to implement different transports for the same Remote.)


<!-- TODO: Z80State ?) -->


# EmulatorClass API

*** = Die Methoden brauch ich eigentlich nur in der Superklasse zu implementieren.

The following methods need to be overwritten:
- Lifecycle
	- init: Initialization of the Remote. Called by ... when ... TODO
	- disconnect: Disconnects the Remote. E.g. diconnect the Transport. Called by ... when ... TODO
	- terminate: Terminates the Remote. TODO: difference to disconnect?
- Data
	- getRegisters: Ask the Transport to get the register values from the external Remote.
	- setRegisterValue: Communicates with the Transport to set a specific Register value.
	- getMemoryDump: Read raw memory.
	- writeMemoryDump: Write raw memory.
***	- writeMemory: Writes a single byte and reads it back. I.e. confirms that the value was really written.
- Program flow
	- continue, pause, stepOver, stepInto, stepOut: Debugger commands. Sent to the transport.
	- breakIfRunning: Sent to the transport to stop a running program.
***	- setProgramCounter: Method to change the program counter.
- Breakpoints
	- setBreakpoint: Sets one specific breakpoint.
	- removeBreakpoint: Removes one specific breakpoint.


The following methods might be overwritten for extra functionality:
- Watchpoints
	- enableWPMEM: Enable/disable the watchpoints.
***?	- setWatchpoints: Sets the watchpoints.
- Asserts
	- setASSERT: Sets the given assert array.
	- setAssertBreakpoints: Set all assert breakpoints.
***?	- enableAssertBreakpoints: Enable/disable all ASSERTs.
- Logpoints
	- setLOGPOINT: Sets the logpoint array.
	- setLogpoints: Set all logpoints.
***?	- enableLogpoints: Enable/disable all logpoints or a logpoint group.
- Program flow
	- reverseContinue, stepBack: Special Debug Commands. Only required if the Remote supports real CPU execution history like ZEsarUX.
- Debugger
	- dbgExec: This will send Remote-specific commands to the Remote by passing DeZog.
- ZX Next specific
	- getMemoryPages: Returns the ZX Next memory pages.
getTbbl Hier weiter


# Selecting The New Remote

<!-- Explain: remoteType, RemoteFactory -->


# Example

This example shows how the ZX Next Remote has been implemented.

## System Overview

~~~
┌───────────────┐              ┌─────────────────┐    ┌───┐                     ┌────────────────────┐
│               │   Request    │                 │    │ / │                     │      ZX Next       │
│               │─────────────▶│                 │    │ d │                     │     (ZXNextHW)     │
│               │              │                 │    │ e │    ┌──────────┐     │                    │
│    vscode     │              │      DeZog      │────┼─v─┼────┤USB/Serial├────▶├────┐               │
│               │◀─────────────│  Debug Adapter  │    │ / │    │Converter │     │UART│               │
│               │              │                 │◀───┼─t─┼────┤          ├─────├────┘               │
│               │   Response   │                 │    │ t │    └──────────┘     │                    │
│               │              │                 │    │ y │                     └────────────────────┘
└───────────────┘              └─────────────────┘    └───┘
~~~

## SW Overview

~~~
┌─────────────────────────────┐
│            Dezog            │
│        DebugAdapter         │
│                             │
└─────────────────────────────┘
               ▲
               │
               ▼
    ┌────────────────────┐
    │                    │         ┌─────────────────┐
    │    ZXNextRemote    │◀───────▶│ ZXNextRegisters │
    │                    │         └─────────────────┘
    └────────────────────┘
               ▲
               │
               ▼
       ┌───────────────┐
       │ ZxNextSerial  │
       └───────────────┘
               ▲
               │
               ▼
       ┌──────────────┐
       │   /dev/tty   │
       └──────────────┘
~~~


