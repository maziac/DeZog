# Adding A New Remote

This document outlines the necessary steps for implementing support for a new Remote in DeZog.


# What is a 'Remote'?

A remote typically refers to an external emulator that operates independently of DeZog. For example, ZEsarUX serves as such a remote. It connects via an interface (in the case of ZEsarUX, a socket) and adheres to a protocol (ZRCP - ZEsarUX Remote Communication Protocol in the case of ZEsarUX). Similarly, CSpect utilizes a socket interface with DZRP as its protocol. In the context of CSpect, the external remote comprises both CSpect itself and the CSpect DeZog Plugin, which facilitates communication with DeZog.

However, a remote can also be a physical piece of hardware, such as real ZX Next hardware. The ZX Next can establish a connection with the PC through a serial interface, with the serial data being accessible via a USB-to-Serial Interface (e.g., /dev/tty.usbserial on macOS).

In DeZog, a Remote class is derived from RemoteBase and represents the emulator or remote within DeZog. The capitalized "Remote" refers to the class within DeZog, while the lowercase "remote" pertains to the external emulator or remote.

For the simulator zsim, both terms are synonymous, and the capital "Remote" is used.


# Derive from DzrpQueuedRemote

To introduce a new Remote, it is advisable to inherit from the DzrpQueuedRemote class. The Dzrp... classes exhibit a similar behavior among derived Remotes, making maintenance and the addition of new features more straightforward. This approach eliminates the need to modify all Remotes for new features but only the base classes.

DzrpQueuedRemote (or better DzrpRemote) establishes a well-defined set of messages sent to the external remote. In your custom implementation, your primary task is to create a transport layer (e.g. socket) for transmitting these messages to the remote device.
For guidance, consult examples such as ZXNextRemote or CSpectRemote.
ZXNextRemote employs a serial connection as its transport method, while CSpectRemote utilizes a socket connection to the CSpect DeZog Plugin.
If your remote (emulator or hardware) already supports a different protocol (e.g. gdb in the case of MAME), you can override the sendDzrpCmd... functions and implement the protocol within.
It's worth noting that using the DZRP **binary** protocol isn't mandatory; however, implementing its functionality (in the sendDzrpCmd... functions) is crucial.
Refer to DZRP for more details.
See [DZRP](DeZogProtocol.md#important-note).


Note: Please be aware that the ZEsarUX Remote was the initial implementation and functions somewhat differently compared to the other Remotes.
I recommend avoiding the derivation of new Remotes from the ZEsarUX Remote or the RemoteBase. Instead, start with the DzrpQueuedRemote.
Only consider deriving from RemoteBase if you encounter specific issues that cannot be addressed through the former approach.


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
           │                               ┌──────────────────┴──────────────────────────┐
           ▼                               │                                             │
   ┌───────────────┐                       │                                             │
   │ ZesaruxSocket │                       │                                             │
   └───────────────┘          ┌─────────────────────────┐                     ┌────────────────────┐
           ▲                  │                         │                     │                    │
           │                  │       ZSimRemote        │                     │  DzrpQueuedRemote  │
           ▼                  │                         │                     │                    │
   ┌──────────────┐           └─────────────────────────┘                     └────────────────────┘
   │    socket    │                      ◆                                               △
   └──────────────┘                      │                                               │
                                         │                                               ├─────────────────────────────────────────┐
                                  ┌─────────────┐                                        │                                         │
                                  │   Z80Cpu    │                                        │                                         │
                                  └─────────────┘                             ┌────────────────────┐                    ┌────────────────────┐
                                         ◆                                    │                    │                    │                    │
                                ┌────────┴──────┐                             │  DzrpBufferRemote  │                    │     MameRemote     │
                                │               │                             │                    │                    │                    │
                          ┌──────────┐    ┌──────────┐                        └────────────────────┘                    └────────────────────┘
                          │ ZxMemory │    │ ZxPorts  │                                   △                                         ▲
                          └──────────┘    └──────────┘                     ┌─────────────┴────────────────┐                        │
                                                                           │                              │                        │
                                                                ┌─────────────────────┐        ┌────────────────────┐              │
                                                                │                     │        │                    │              │
                                                                │ ZxNextSerialRemote  │        │    CSpectRemote    │              │
                                                                │                     │        │                    │              │
                                                                └─────────────────────┘        └────────────────────┘              │
                                                                           ▲                              ▲                        │
                                                                           │                              │                        │
                                                                           ▼                              ▼                        ▼
                                                                   ┌──────────────┐               ┌──────────────┐         ┌──────────────┐
                                                                   │    Serial    │               │    Socket    │         │    Socket    │
                                                                   └──────────────┘               └──────────────┘         └──────────────┘
~~~


# Selecting The New Remote

The RemoteFactory generates the appropriate Remote based on the 'remoteType' (e.g., 'zrcp,' 'cspect,' or 'zsim').


# Example ZX Next Remote System Overview

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

