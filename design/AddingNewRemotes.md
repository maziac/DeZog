# Adding A New Remote

This document outlines the necessary steps for implementing support for a new Remote in DeZog.


# What is a 'Remote'?

A remote typically refers to an external emulator that operates independently of DeZog. For example, ZEsarUX serves as such a remote. It connects via an interface (in the case of ZEsarUX, a socket) and adheres to a protocol (ZRCP - ZEsarUX Remote Communication Protocol in the case of ZEsarUX). Similarly, CSpect utilizes a socket interface with DZRP as its protocol. In the context of CSpect, the external remote comprises both CSpect itself and the CSpect DeZog Plugin, which facilitates communication with DeZog.

However, a remote can also be a physical piece of hardware, such as real ZX Next hardware. The ZX Next can establish a connection with the PC through a serial interface, with the serial data being accessible via a USB-to-Serial Interface (e.g., /dev/tty.usbserial on macOS).

In DeZog, a Remote class is derived from RemoteBase and represents the emulator or remote within DeZog. The capitalized "Remote" refers to the class within DeZog, while the lowercase "remote" pertains to the external emulator or remote.

For the simulator zsim, both terms are synonymous, and the capital "Remote" is used.


# Required Classes

To add a new Remote, it must inherit from RemoteBase. RemoteBase defines an API that DeZog uses to communicate with the actual remote. It encompasses all methods that you may or must override. All "must override" methods in RemoteBase include an assertion. Other methods are left empty. If you choose to override some of the non-assertion methods, you can provide additional functionality. The debug adapter will automatically determine which functions have been overridden.

Since you also need a transport layer for communicating with the remote, this layer can either be implemented as a separate class or directly within the Remote class.


# RemoteBase API

Here are examples of methods that require overriding:
- Lifecycle
    - init: Initializes the Remote and is called by the DebugSessioncCass when DeZog receives a launchRequest from vscode (also used by Z80UnitTestRunner).
    - disconnect: : Disconnects the Remote, which may involve disconnecting the transport layer. Called by the DebugSessionClass when disconnectRequest is received from vscode (also by Z80UnitTestRunner).
    - terminate: Terminates the Remote. Z80UnitTestRunner uses this to terminate a possibly running Remote instance before starting. The key difference from disconnect is that "terminated" is emitted. terminate also triggers a disconnectRequest as it sends the TerminatedEvent.
- Data
    - getRegisters: Requests the Transport to fetch register values from the external Remote.
    - setRegisterValue: Communicates with the Transport to set a specific Register value.
    - getMemoryDump: Reads raw memory.
    - writeMemoryDump: Writes raw memory.
    - continue, pause, stepOver, stepInto, stepOut: Debugger commands sent to the Transport.
    - breakIfRunning: Sent to the transport to halt a running program.
- Breakpoints
    - setBreakpoint: Sets a specific breakpoint.
    - removeBreakpoint: Deletes a specific breakpoint.

The following methods can be overridden for additional functionality:
- Watchpoints
    - enableWPMEM: Enable/disable the watchpoints.
- Assertions
    - setASSERTIONArray: Sets the given assertion array.
    - enableAssertionBreakpoints: Enable/disable all ASSERTIONs.
- Logpoints
    - setLOGPOINTArray: Sets the logpoint array.
    - setLogpoints: Set all logpoints.
- Program flow
    - reverseContinue, stepBack: Special Debug Commands. Only required if the remote supports real CPU execution history like ZEsarUX.
- Debugger
    - dbgExec: Can be used to send remote-specific commands to the remote, bypassing DeZog.
- Memory
    - getMemoryBanks: Returns the memory banks. (e.g. ZX Next memory banks)


# Simpler

A simpler implementation can be achieved by deriving the Remote from DzrpRemote. DzrpRemote defines a clear set of messages sent to the external remote. In your derivative, you only need to implement a transport layer (e.g., socket) to send these messages to the remote. Refer to examples like ZXNextRemote or CSpectRemote for guidance. ZXNextRemote employs a serial connection as the transport, while CSpectRemote utilizes a socket connection to the CSpect DeZog Plugin.

Note: The ZEsarUX was the first implemented Remote. It works a little different that the other remotes and I would not recommend to derive new Remotes from the ZEsarUX Remote.


# Selecting The New Remote

The RemoteFactory generates the appropriate Remote based on the 'remoteType' (e.g., 'zrcp,' 'cspect,' or 'zsim').


# Example

The following example demonstrates the implementation of the ZX Next Remote.

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
                                       │      DebugSessionClass      │
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
│                    │                             │     DzrpRemote     │◆───────────────────────────────┬────────────┬────────────┐
│   ZesaruxRemote    │                             │                    │                                │            │            │
│                    │                             └────────────────────┘                           ┌─────────┐  ┌─────────┐  ┌─────────┐
└────────────────────┘                                        △                                     │ NexFile │  │ SnaFile │  │   Obj   │
           ▲                                                  │                                     └─────────┘  └─────────┘  └─────────┘
           │                                                  │
           ▼                               ┌──────────────────┴────────────────────────┬──────────────────────────────────────────┐
   ┌───────────────┐                       │                                           │                                          │
   │ ZesaruxSocket │                       │                                           │                                          │
   └───────────────┘                       │                                           │                                          │
           ▲                  ┌─────────────────────────┐                   ┌────────────────────┐                     ┌────────────────────┐
           │                  │                         │                   │                    │                     │                    │
           ▼                  │       ZSimRemote        │                   │  DzrpBufferRemote  │                     │     MameRemote     │
   ┌──────────────┐           │                         │                   │                    │                     │                    │
   │    socket    │           └─────────────────────────┘                   └────────────────────┘                     └────────────────────┘
   └──────────────┘                      ◆                                             △                                          ▲
                                         │                                ┌────────────┴─────────────────┐                        │
                                  ┌─────────────┐                         │                              │                        │
                                  │   Z80Cpu    │              ┌─────────────────────┐        ┌────────────────────┐              │
                                  └─────────────┘              │                     │        │                    │              │
                                         ◆                     │ ZxNextSerialRemote  │        │    CSpectRemote    │              │
                                ┌────────┴──────┐              │                     │        │                    │              │
                                │               │              └─────────────────────┘        └────────────────────┘              │
                          ┌──────────┐    ┌──────────┐                    ▲                              ▲                        │
                          │ ZxMemory │    │ ZxPorts  │                    │                              │                        │
                          └──────────┘    └──────────┘                    ▼                              ▼                        ▼
                                                                  ┌──────────────┐               ┌──────────────┐         ┌──────────────┐
                                                                  │    Serial    │               │    Socket    │         │    Socket    │
                                                                  └──────────────┘               └──────────────┘         └──────────────┘
~~~

