# Adding A New Remote

This document will describe what needs to be done (implemented) in order to support a new Remote.


# What is a 'Remote'?

A remote is normally an external emulator that is running independently of DeZog.
ZesarUX e.g is such a remote.
It is connected via some interface (for ZEsarUX this is a socket) and a protocol (for ZEsarUX ZRCP - ZEsarUX Remote Communication Protocol).
For e.g. CSpect a socket is used as well with DZRP as a protocol.
For CSpect the (external) remote is two-fold: The CSpect itself + the CSpect DeZog Plugin which communicates with DeZog and CSpect.

But a remote could also be real HW. E.g. real ZX Next hardware.
The ZX Next can be connected via a serial interface to the PC.
Via a USB-to-Serial Interface the serial data is available e.g. at /dev/tty.usbserial (macOS).

In DeZog a Remote class is derived from RemoteBase and represents the remote (emulator) inside DeZog. The Remote (DeZog) communicates with the remote (emulator).

'Remote' with an uppercase letter is used when talking about the representation (the class) inside DeZog.
'remote' with a lower case letter refers to the external remote e.g. the emulator.

For the simulator (zsim) both is the same. In that case the capital 'Remote' is used.


# Required Classes

To add a new Remote it needs to derive from the RemoteBase.
The RemoteBase defines an API that is used by DeZog to communicate with the real remote.
RemoteBase includes all methods that you might or must override.
All must overrides include an 'assertion' in the RemoteBase.
The other are simply empty.
If you decide to override some of the non-assertion methods you can offer additional functionality.
The debug adapter will check by itself which of the functions have been overwritten.

Since you also need a transport layer to communicate with remote it could be separate it in an own class or could be implemented directly inside the Remote class.


# RemoteBase API

Here are some exemplary methods that need to be overwritten:
- Lifecycle
	- init: Initialization of the Remote. Called by DebugSessionclass when launchRequest is received from vscode (also by Z80UnitTests).
	- disconnect: Disconnects the Remote. E.g. disconnect the Transport. Called by DebugSessionclass when disconnectRequest is received from vscode (also by Z80UnitTests).
	- terminate: Terminates the Remote. Z80UnitTests uses this to terminate a possibly running Remote instance before starting. Only difference to disconnect is that 'terminated' would be emitted.
        - terminate also results in a disconnectRequest because it sends the TerminatedEvent.
- Data
	- getRegisters: Ask the Transport to get the register values from the external Remote.
	- setRegisterValue: Communicates with the Transport to set a specific Register value.
	- getMemoryDump: Read raw memory.
	- writeMemoryDump: Write raw memory.
	- continue, pause, stepOver, stepInto, stepOut: Debugger commands. Sent to the transport.
	- breakIfRunning: Sent to the transport to stop a running program.
- Breakpoints
	- setBreakpoint: Sets one specific breakpoint.
	- removeBreakpoint: Removes one specific breakpoint.


The following methods might be overwritten for extra functionality:
- Watchpoints
	- enableWPMEM: Enable/disable the watchpoints.
- Assertions
	- setASSERTION: Sets the given assertion array.
  - enableAssertionBreakpoints: Enable/disable all ASSERTIONs.
- Logpoints
	- setLOGPOINT: Sets the logpoint array.
	- setLogpoints: Set all logpoints.
- Program flow
	- reverseContinue, stepBack: Special Debug Commands. Only required if the remote supports real CPU execution history like ZEsarUX.
- Debugger
	- dbgExec: This will send remote-specific commands to the remote bypassing DeZog.
- ZX Next specific
	- getMemoryBanks: Returns the ZX Next memory banks.


# Simpler

A simpler implementation can be done if the Remote is derived from DzrpRemote.
The DzrpRemote defines a clear set of messages that is sent to the (external) remote.
In your derivate you just need to implement a transport layer (e.g. sockets) to send those messages to the remote.

See ZxNextRemote or CSpectRemote as an example. ZXNextRemote uses a serial connection as transport. CSpectRemote a socket connection to the CSpect DeZog Plugin.


# Selecting The New Remote

The RemoteFactory creates the Remote according to the 'remoteType' (e.g. 'zrcp', 'cspect' or 'zsim').


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
                                       └─────────────────────────────┘
                                                      ▲
                                                      │
                                                      ▼
                                          ┌──────────────────────┐
                                          │                      │
                                          │      RemoteBase      │
                                          │                      │
                                          └──────────────────────┘
                                                      △
           ┌──────────────────────────────────────────┴───────┐
           │                                                  │
           │                                       ┌────────────────────┐
┌────────────────────┐                             │                    │
│                    │                             │     DzrpRemote     │◆───────────────────────────────┬────────────┐
│   ZesaruxRemote    │                             │                    │                                │            │
│                    │                             └────────────────────┘                           ┌─────────┐  ┌─────────┐
└────────────────────┘                                        △                                     │ NexFile │  │ SnaFile │
           ▲                               ┌──────────────────┴────────────────────────┐            └─────────┘  └─────────┘
           │                               │                                           │
           ▼                  ┌─────────────────────────┐                   ┌────────────────────┐
   ┌───────────────┐          │                         │                   │                    │
   │ ZesaruxSocket │          │   Z80SimulatorRemote    │                   │  DzrpBufferRemote  │◆─────────────────────┐
   └───────────────┘          │                         │                   │                    │                      │
           ▲                  └─────────────────────────┘                   └────────────────────┘                ┌──────────┐
           │                             ◆                                             △                          │DzrpParser│
           ▼                             │                                ┌────────────┴─────────────────┐        └──────────┘
   ┌──────────────┐               ┌─────────────┐                         │                              │
   │    socket    │               │   Z80Cpu    │              ┌─────────────────────┐        ┌────────────────────┐
   └──────────────┘               └─────────────┘              │                     │        │                    │
                                         ◆                     │ ZxNextSocketRemote  │        │    CSpectRemote    │
                                ┌────────┴──────┐              │                     │        │                    │
                                │               │              └─────────────────────┘        └────────────────────┘
                          ┌──────────┐    ┌──────────┐                    ▲                              ▲
                          │ ZxMemory │    │ ZxPorts  │                    │                              │
                          └──────────┘    └──────────┘                    ▼                              ▼
                                                                  ┌──────────────┐               ┌──────────────┐
                                                                  │    Socket    │               │    Socket    │
                                                                  └──────────────┘               └──────────────┘
~~~

