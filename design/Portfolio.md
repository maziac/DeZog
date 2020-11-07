# Portfolio

## Overviews

DeZog + Simulator:
~~~
    ┌───────────────┐              ┌────────────────────┐
    │               │              │DeZog               │
    │               │              │                    │
    │               │              │       ┌───────────┐│
    │    vscode     │              │       │           ││
    │               │◀────────────▶│       │ Internal  ││
    │               │              │       │ Simulator ││
    │               │              │       │           ││
    │               │              │       └───────────┘│
    └───────────────┘              └────────────────────┘
~~~

DeZog + ZEsarUX emulator:
~~~
    ┌───────────────┐              ┌─────────────────┐          ┌────────────────────┐
    │               │              │                 │          │                    │
    │               │              │                 │          │                    │
    │               │              │                 │          │                    │
    │    vscode     │              │      DeZog      │          │      ZEsarUX       │
    │               │◀─────────────│                 │          │                    │
    │               │              │                 │          │                    │
    │               │              │                 │          │                    │
    │               │              │                 │          └────────────────────┘
    └───────────────┘              └─────────────────┘                     ▲
                                            ▲                              │
                                            │                              │
                                   ┌────────▼──────────────────────────────▼─────────┐
                                   │  ┌──────────┐                   ┌──────────┐    │
                                   │  │  Socket  │◀─────────────────▶│  Socket  │    │
                                   │  └──────────┘                   └──────────┘    │
                                   │              macOS, Linux, Windows              │
                                   └─────────────────────────────────────────────────┘
~~~


DeZog + CSpect emulator:

~~~
   ┌───────────────┐              ┌─────────────────┐          ┌────────────────────┐
   │               │              │                 │          │                    │
   │               │              │                 │          │       CSpect       │
   │               │              │                 │          │                    │
   │    vscode     │              │      DeZog      │          │                    │
   │               │◀────────────▶│                 │          └────────────────────┘
   │               │              │                 │                     ▲
   │               │              │                 │                     │
   │               │              │                 │                     ▼
   └───────────────┘              └─────────────────┘          ┌────────────────────┐
                                           ▲                   │    DeZog Plugin    │
                                           │                   └────────────────────┘
                                           │                              ▲
                                           │                              │
                                  ┌────────▼──────────────────────────────▼─────────┐
                                  │  ┌──────────┐                   ┌──────────┐    │
                                  │  │  Socket  │◀─────────────────▶│  Socket  │    │
                                  │  └──────────┘                   └──────────┘    │
                                  │              macOS, Linux, Windows              │
                                  └─────────────────────────────────────────────────┘
~~~

DeZog + ZX Next:
~~~
                                                                                         ┌──────────────────────────┐
                                                                                         │         ZX Next          │
                                                                                         │ ┌──────────────────────┐ │
┌───────────────┐     ┌─────────────────┐                                                │ │   Debugged Program   │ │
│               │     │                 │                                                │ └──────────▲───────────┘ │
│               │     │                 │                                                │            │             │
│               │     │                 │                                                │ ┌──────────▼───────────┐ │
│    vscode     │     │      DeZog      │                                                │ │       dezogif        │ │
│               │◀───▶│                 │                                                │ │          SW          │ │
│               │     │                 │                                                │ └──────────▲───────────┘ │
│               │     │                 │                                                │            │             │
│               │     │                 │     ┌──────────────────────────┐               │          ┌─▼──┐          │
└───────────────┘     └─────────────────┘     │  DeZog Serial Interface  │               │          │UART│          │
                               ▲              │            SW            │               │          │HW  │          │
                               │              └──────────────────────────┘               └──────────┴────┴──────────┘
                               │                    ▲                ▲                                ▲
                               │                    │                │                                │
                      ┌────────▼────────────────────▼────────────────▼───────────────┐                ▼
                      │  ┌──────────┐         ┌──────────┐     ┌──────────────┐      ├────┐     ┌──────────┐
                      │  │  Socket  │◀───────▶│  Socket  │     │    Serial    │      │USB │     │USB/Serial│
                      │  └──────────┘         └──────────┘     │COM, /dev/tty │◀────▶│HW  │◀───▶│Converter │
                      │                                        └──────────────┘      ├────┘     │HW        │
                      │                    macOS, Linux, Windows                     │          └──────────┘
                      └──────────────────────────────────────────────────────────────┘
~~~








DeZog, developing the serial IF (dezogif) for ZX Next:

~~~
                                             ┌─────────────────────────────────────────────────┐
                                             │                     CSpect                      │
                                             │ ┌──────────────────────┐                        │
                                             │ │   Debugged Program   │                        │
                                             │ │                      │                        │
  Serial Development:                        │ └──────▲───▲───────────┘                        │
                                             │        │   │                                    │
                                             │ ┌──────────▼─────────────────────────────────┐  │
                                             │ │                  dezogif                   │  │
  ┌───────────────┐     ┌─────────────────┐  │ │                     SW                     │  │     ┌─────────────────┐
  │               │     │                 │  │ └──────┬───▲───────────────────────▲───▲─────┘  │     │                 │
  │               │     │                 │  │            │                       │            │     │                 │
  │               │     │                 │  │      ┌─┴───▼──┐                    │   │        │     │                 │
  │    vscode     │     │     DeZog A     │  │      │  UART  │                    │            │     │     DeZog B     │
  │               │◀───▶│                 │  │      │  Sim.  │                    │   │        │     │                 │
  │               │     │                 │  └──────┴─────▲──┴────────────────────┼────────────┘     │                 │
  │               │     │                 │           │   │                       │   │              │                 │
  │               │     │          ▲      │               ▼                       ▼                  │           ▲     │
  └───────────────┘     └─────────────────┘    ┌──────┴─────────────┐   ┌─────────────┴──────┐       └─────────────────┘
                                 ▲ │           │ UART/Socket Plugin │   │    DeZog Plugin    │                ▲  │
                                 │             └──────┬─────────────┘   └─────────────┬──────┘                │
                                 │ │                     ▲                         ▲                          │  │
                                 │                    │  │                         │  │                       │
                        ┌────────▼─┼─────────────────────▼─────────────────────────▼──────────────────────────▼──┼───────────┐
                        │  ┌──────────┐         ┌─────┴────┐                 ┌────────┴─┐               ┌──────────┐         │
                        │  │  Socket  │◀───────▶│  Socket  │                 │  Socket  │◀─────────────▶│  Socket  │         │
                        │  │          ├ ─ ─ ─ ─ ┤          │                 │          ├ ─ ─ ─ ─ ─ ─ ─ ┤          │         │
                        │  └──────────┘         └──────────┘                 └──────────┘               └──────────┘         │
                        │                                       macOS, Linux, Windows                                        │
                        └────────────────────────────────────────────────────────────────────────────────────────────────────┘
~~~


## DeZog

The main program. An extension for vscode.
It implements a debugger / a debug extension that allows source level debugging on several remotes, i.e. ZEsarUX emulator, CSpect emulator, internal Simulator and a ZX Next.


## DeZogSerialInterface

A serial interface to connect DeZog with a ZX Next.
In theory this could have been integrated in DeZog directly.
It is a separate program as the serialport package has tendency to break dependencies in vscode.


## DeZogPlugin

Plugin to connect the CSpect emulator with DeZog.


# dezogif (dezogif.nex)

A Z80 asssembler program which runs on the ZXNext and serves as (serial) interface between the debugged program and DeZog.


## UartSocketPlugin

A plugin for CSpect which connects the (ESP) UART (inside CSpect) with a socket.
It's used for testing the real UART serial debugging.
Once the ZX Next dezogif has some stability it is not required anymore.


## z80-unit-tests

Z80 Unit Test Adapter to work with DeZog.


## z80-instruction-set

Shows the Z80 opcode when hovering over an instruction.


## asm-code-lens

A vscode language server that enables code lens, references, hover


## z80-sample-program

This is a small Z80 assembler program that just puts some colored lines on the ZX Spectrum's screen. The intention is to use this as a kind of tutorial for DeZog (Z80 debugger).


## z80dismblr

z80dismblr is a command line disassembler for the Z80 CPU.
Is not directly related to DeZog but it is also contained in side DeZog.
I.e. all sources are copied in DeZog.

