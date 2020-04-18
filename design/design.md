# Design

## Overview

~~~
                                                               ┌────────────────────┐
                                                       ┌───┐   │Remote              │
                                                       │   │   │   ┌────────────────┴───┐
┌────────────────┐              ┌─────────────────┐    │ S │   │   │MAME                │
│                │   Request    │                 │    │ o │   │   │   ┌────────────────┴──┐
│                │─────────────▶│                 │────┼─c─┼──▶│   │   │ZEsarUX            │
│                │              │                 │    │ k │   └───┤   │   ┌───────────────┴───┐
│                │              │                 │◀───┼─e─┼───    │   │   │CSpect             │
│                │              │                 │    │ t │       └───┤   │                   │
│                │              │                 │    │   │           │   │                   │
│                │   Response   │      DeZog      │    └───┘           └───┤                   │
│     vscode     │◀─────────────│  Debug Adapter  │    ┌───┐               │                   │
│                │              │                 │    │ / │               └───────────────────┘
│                │              │                 │    │ d │                     ┌────────────────────┐
│                │              │                 │    │ e │    ┌──────────┐     │      ZX Next       │
│                │              │                 │────┼─v─┼────┤USB/Serial├────▶├────┐(ZXNextHW)     │
│                │              │                 │    │ / │    │Converter │     │UART│               │
│                │              │                 │◀───┼─t─┼────┤          ├─────├────┘               │
│                │              │                 │    │ t │    └──────────┘     │                    │
└────────────────┘              └─────────────────┘    │ y │                     └────────────────────┘
                                                       └───┘
~~~~

## Main Classes

- DebugSessionClass: Just runs DeZog. I s the main class to communicate with vscode.
- Extension: The extension class. Activates the extension and registers commands.
- Frame: Represents a Z80 StackObject, i.e. caller address and objects on stack.
- Labels: Singleton which reads the .list and .labels file and associates addresses, labels, filenames and line numbers.
- Settings: Singleton to hold the extension's settings.
- ShallowVar: DisassemblyVar, RegistersMainVar, RegistersSecondaryVar, StackVar, LabelVar. Representations of variables. They know how to retrieve the data from zesarux.
- Z80Registers: Static class to parse (from zesarux) and format registers.
- Remote: Gets requests from the DebugSessionClass and passes them to e.g. ZEsarUX (via ZesaruxSocket). There are several Remote classes e.g. Zesaruxremote or ZxSimulatorRemote.
- ZesaruxSocket: Socket connection and communication to zesarux emulator. Knows about the basic communication, but not the commands.


Helper classes:
- Log: Used for logging. Adds the caller and break time to the logs.
- RefList: List to associate variable references to objects.
- MemBuffer: Used for serialization.
- Utility: Misc functions. E.g. for formatting.

~~~
┌─────────┐      ┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐        ┌──────────────────┐
│         │      │                                                                                                        │        │Helper            │
│         │      │                                           DebugSessionClass                                            │        │                  │
│         │      │                                                                                                        │        │                  │
│         │      └────────────────────────────────────────────────────────────────────────────────────────────────────────┘        │┌─────────┐       │
│         │         ▲                         ▲                          ▲                                       ▲                 ││Utility  │       │
│         │         │                         │                          │                                       │                 │└─────────┘       │
│Settings │         ▼                         │                          ▼                                       ▼                 │                  │
│         │    ┌───────────────┐              ▼               ┌────────────────────┐                   ┌──────────────────────┐    │┌─────────┐       │
│         │    │TextView       │         ┌─────────┐          │RemoteBase          │                   │Variables             │    ││RefList  │       │
│         │    │ ┌─────────────┴─┐       │         │          │  ┌─────────────────┴──┐                │┌───────────┐         │    │└─────────┘       │
│         │    │ │MemoryDumpView │       │ Labels  │◀────────▶│  │ZesaruxRemote       │                ││ShallowVar │         │    │                  │
│         │    │ │ ┌─────────────┴─┐     │         │  ┌──────▶│  │  ┌─────────────────┴──┐             │└───────────┘         │    │┌─────────┐       │
│         │    │ │ │MemoryReg.View │     └─────────┘  │       │  │  │ZesaruxExtRemote    │             │┌────────────────┐    │    ││MemBuffer│       │
└─────────┘    │ │ │ ┌─────────────┴─┐        ▲       │       │  │  │  ┌─────────────────┴──┐     ◀──▶ ││DisassemblyVar  │    │    │└─────────┘       │
               └─┤ │ │ZxN.SpritesView│        │       │       └──┤  │  │MameRemote          │          │└────────────────┘    │    │                  │
                 │ │ │               │        ▼       │          │  │  │  ┌─────────────────┴──┐       │┌────────────────┐    │    │┌────────────────┐│
                 └─┤ │               │  ┌ ─ ─ ─ ─ ─ ┐ │          └──┤  │  │CSpectRemote        │       ││MemorySlotsVar  │    │    ││DisassemblyClass││
                   │ │               │      Files     │             │  │  │  ┌─────────────────┴──┐    │└────────────────┘    │    │└────────────────┘│
                   └─┤               │  └ ─ ─ ─ ─ ─ ┘ │             └──┤  │  │ZXNextRemote        │    │┌────────────────┐    │    │                  │
                     │               │                │                │  │  │  ┌─────────────────┴──┐ ││RegisterMainVar │    │    │┌────┐            │
                     └───────────────┘                │                └──┤  │  │ZxSimulatorRemote   │ │└────────────────┘    │    ││Log │            │
                        ▲                             │                   │  │  │                    │ │┌────────────────────┐│    │└────┘            │
                        │                             │                   └──┤  │                    │ ││RegisterSecondaryVar││    │                  │
                        └─────────────────────────────┘            ▲         │  │                    │ │└────────────────────┘│    │                  │
                                                                   │         └──┤                    │ │┌──────────┐          │    └──────────────────┘
                                                                   │            │                    │ ││StackVar  │          │
                                                                   ▼            └────────────────────┘ │└──────────┘          │
                                                          ┌────────────────┐            ▲              │┌──────────┐          │
                                                          │                │            │              ││LabelVar  │          │
                                                          │  Z80Registers  │            │              │└──────────┘          │
                                                          │                │            │              └──────────────────────┘
                                                          └────────────────┘            │
                                                                   ▲                    │
                                                                   │                    │
                                                                   │                    │
                                                                   ▼                    ▼
                                                        ┌──────────────────────────────────────────────────────────────────────────┐
                                                        │Transport (sockets/file)                                                  │
                                                        │         ┌──────────┐ ┌───────────────┐ ┌────────────┐ ┌───────────────┐  │
                                                        │         │MameSocket│ │ ZesaruxSocket │ │CSpectSocket│ │ ZxNextSerial  │  │
                                                        │         └──────────┘ └───────────────┘ └────────────┘ └───────────────┘  │
                                                        │                                                                          │
                                                        └──────────────────────────────────────────────────────────────────────────┘
~~~


Communication:

DebugSessionClass <-> Remote:
DebugSessionClass takes care of association of vscode references and objects.
- Commands: step-over, step-into, step-out
- Data: Frames (call stack), Registers/Frame, expressions, breakpoints, Labels.

Remote <-> Socket:
- Commands: run, step-over, step-into, step-out, breakpoints
- Data: registers, memory dump, call stack



## Activation

DeZog is activated in the 'activate' function in extension.ts by registering the ZesaruxConfigurationProvider.
This happens e.g. when the Debugger is started.
Short after 'ZesaruxConfigurationProvider::resolveDebugConfiguration' is called.
As the debug adapter is entirely implemented in Typescript it lives in the same process as the extension which simplifies debugging the debug-adapter.
So in 'resolveDebugConfiguration' the 'ZesaruxDebugSession' is instantiated
and started as server (socket). In the same function the server (socket) is also connected by the extension.

Although the same process is used and therefore it is technically possible to directly call methods of the 'ZesaruxDebugSession' it is not done.
Instead the intended way (through 'customRequest' which uses sockets) is chosen.



## Showing variables, call stacks etc.

Whenever vscode thinks it needs to update some of the areas (VARIABLES, WATCHES, CALL STACK) it does a request.
The request might be chained. E.g. if an entry in the CALL STACK is selected this first requests the SCOPE for the call stack (frame) ID.
The scopes are displayed as header lines in the VARIABLES area.
They are very similar to variables but appear as head line.
In this adapter they are used for
- The disassembly (either starting at the PC or if a different callstack is selected the disassembly starts at the call stack address).
- The Z80 registers (divided in main and secondary registers).
- The stack, i.e. the stack that is currently used for push/pop.

For each scope a variables request is done. Here a variable is returned for each shown line. E.g. one line/variable for each register or one line/variable for each disassembly line.


vscode works with IDs/numbers only. Unfortunately it is not possible
to response with an array of objects that vscode passes back in
the next request.
Instead it is necessary to work with IDs/numbers.

So, when there is a stackTraceRequest (call stack) a list is used to map the IDs to objects.
At the start of the request the list is cleared. Then, for every returned frame (call stack entry) a new ID is generated (the index to the list is simply increased).
The object is created. It holds all necessary data for processing the next step. And the object is put in the list.

Here are the requests and the list/objects involved:

### stackTraceRequest:

List:
listFrames, cleared on start of request, filled until response.
listVariables, cleared on start of request, filled by other requests.

Object:
- address: the address in the call stack (required for disassembly)
- fileName, lineNr: file and line number so that vscode can show the corresponding file when selected.


### scopesRequest:

The returned scopes list is basically always the same:
'Disassembly', 'Registers', 'Registers 2', 'Stack'
However, for each scope a variable reference is passed. This reference ID is different for different frames.
I.e. an object is created that includes necessary information for decoding in the variablesRequest.

'Disassembly':
- address

'Registers'/'Registers 2':
- none

'Stack':
- address
- size

List:
listVariables, filled until response.



### variablesRequest:
List:
listVariables, is only read.

### evaluateRequest:

An expression is past for hovering or 'add watch'. It normally
contains a label for wich a shallow var is constructed.

'Labels':
- pseudo variables for
	- byte array
	- word array

'Memory Dump' (byte/word array):
- address


### Shallow Variable References

A variable that has not been requested does exist only as number (ID) with associated shallow object.
The shallow object contains enough information to actually retrieve the variable information.
For variables a class is created that behaves similar for all different types of variables.

Basically it includes a anonymous function that has the knowledge to retrieve the data.

Examples:
- E.g. the call stack variable gets a function that communicates with the socket to retrieve the stack values.
- From evaluate (e.g. 'add watch') a label has been added. This is immediately displayed. The responses contained a var ID corresponding to an object with a function that communicates with the socket to retrieve a memory dump for that address.
If the variable is opened in the WATCH area a variable request is done for that ID. The corresponding object's function is executed and the data is retrieved and returned in the response.


# Problems / Decisions needed (old unsolved, but not so important)

vscode is highly asynchronous. All requests start with the 'request' and end with a 'response'. The 'response' would be typically generated in another function e.g. as a response from the zesarux socket answer.
Meanwhile vscode could have sent another request either for the same
(see stackTraceRequest) or for something else.
This becomes even more complicated because variables (displayed in vscode)
are referenced by a number only.
Therefore the debug adapter needs to keep track with a map or list of the variable references and the underlying objects.
Unfortunately there is no information available from vscode whenever a variable reference is not required anymore.
I.e. it is impossible to delete variable references and the underlying objects.
Because of the asynchronicity it is also imposible to bound the deleting
of objects to certain requests (like the stack trace request).

It would be much easier if vscode (instead of using reference numbers) would offer the possibility to set a variables reference as an object. Then simply garbage collection would take care of unused objects.

A way out would be to use a layer in between (between vscode and the emulator/socket).
This layer would request all required data wenever a 'next' (step) has been performed.
So all data is allocated for one 'step' only. At the start of the 'step' the old data is discarded and new data structures are allocated.
vscode requests would be ansewered (immediately) just by returning the already received data.

Problem with this approach is that this layer would have to requests all data at once and for every step.
E.g. even while stepping from one assembler instruction to the next all disassemblys (and, when this available later, all registers/stack objects
for that call stack item) need to be retrieved from the emulator in advance.
Even if the data in the vscode UI is collapsed.

This doesn't seem the rigth way. Let's see how the discussion with vscode guys will turn out.


# Other Components

## MemoryDumpView Sequence Diagrams

```puml
hide footbox
title Step
actor User
User -> vscode: Step
vscode -> DebugSessionClass: stepXxxRequest
DebugSessionClass -> MemoryDumpView: update
MemoryDumpView -> Remote: getMemoryDump(s)
MemoryDumpView <-- Remote: Data
note over MemoryDumpView: create html+js
MemoryDumpView -> webView: Set webview.html
```

```puml
hide footbox
title Hover
actor User
User -> webView: Hover
webView -> MemoryDumpView: getValueInfoText/getAddressInfoText
webView <- MemoryDumpView: valueInfoText/addressInfoText
```

```puml
hide footbox
title Change Memory Value
actor User
User -> webView: DoubleClick
webView -> MemoryDumpView: valueChanged
MemoryDumpView -> MemoryDumpView: changeMemory
MemoryDumpView -> Remote: writeMemory
webView <- MemoryDumpView: changeValue
```


## ZXNextSpritesView Sequence Diagrams

```puml
hide footbox
title Step
actor User
User -> vscode: Step
vscode -> DebugSessionClass: stepXxxRequest
DebugSessionClass -> ZXNextSpritesView: update
ZXNextSpritesView -> ZXNextSpritesView: getSprites
ZXNextSpritesView -> Remote: getTbblueSprite(s)
ZXNextSpritesView <-- Remote: Data
alt palette empty
    ZXNextSpritesView -> ZXNextSpritesView: getSpritePalette
    ZXNextSpritesView -> Remote: getTbblueRegister(whichPaletteXXX)
    ZXNextSpritesView <-- Remote: Used palette
    ZXNextSpritesView -> Remote: getTbbluePalette
    ZXNextSpritesView <-- Remote: Data
end
alt patterns empty
    ZXNextSpritesView -> ZXNextSpritesView: getSpritePatterns
    ZXNextSpritesView -> Remote: getTbbluePattern(s)
    ZXNextSpritesView <-- Remote: Data
end
note over ZXNextSpritesView: create html+js
ZXNextSpritesView -> webView: Set webview.html
```

```puml
hide footbox
title Reload Patterns
actor User
User -> webView: Click "Reload"

webView -> ZXNextSpritesView: getSpritePalette
    ZXNextSpritesView -> Remote: getTbblueRegister(whichPaletteXXX)
    ZXNextSpritesView <-- Remote: Used palette
    ZXNextSpritesView -> Remote: getTbbluePalette
    ZXNextSpritesView <-- Remote: Data

webView -> ZXNextSpritesView: getSpritePatterns
    ZXNextSpritesView -> Remote: getTbbluePattern(s)
    ZXNextSpritesView <-- Remote: Data

note over ZXNextSpritesView: create html+js
ZXNextSpritesView -> webView: Set webview.html
```


## Stopping the Emulator Debug Session

There are several reasons to stop the Emulator Debug Session.
- User pressed 'stop' button
- Connection error/connection closed by emulator (zesarux)
- Unit tests stop the emulator


```puml
hide footbox
title User initiated
actor user
participant vscode
participant "Emul\nDebug\nSession" as session
participant "Remote" as emul
participant "Socket" as socket
participant "ZEsarUX" as zesarux

user -> vscode: Pressed stop button
vscode -> session: disconnectRequest
session -> emul: disconnect
emul -> socket: quit
note over socket: removeAllListeners
note over socket: install new listeners\n(close, end, ...)

socket -> zesarux: cpu-code-coverage enabled yes
socket <-- zesarux
socket -> zesarux: cpu-history enabled yes
socket <-- zesarux
socket -> zesarux: clear-membreakpoints
socket <-- zesarux
socket -> zesarux: disable-breakpoints
socket <-- zesarux
socket -> zesarux: quit
socket <-- zesarux
note over socket: close socket
note over socket: removeAllListeners
emul <-- socket

session <-- emul
note over session: removeAllListeners
vscode <-- session: response
```


```puml
hide footbox
title Error
'actor user
participant vscode
participant "Emul\nDebug\nSession" as session
participant "Remote" as emul
participant "Socket" as socket
'participant "ZEsarUX" as zesarux

emul <-- socket: 'error'/'close'/'end'
session <-- emul: 'error'

session -> session: terminate
note over session: removeAllListeners
vscode <-- session: TerminatedEvent

vscode -> session: disconnectRequest
session -> emul: disconnect
emul -> socket: quit
note over socket: ...
emul <-- socket

session <-- emul
note over session: removeAllListeners
vscode <-- session: response
```


```puml
hide footbox
title User started unit tests
actor user
participant Z80UnitTests as unittest
participant vscode
participant "Emul\nDebug\nSession" as session
participant "Remote" as emul
participant "Socket" as socket
'participant "ZEsarUX" as zesarux

user -> unittest: start unit tests
unittest -> emul: terminate

session <-- emul: 'terminated'
session -> session: terminate

emul -> socket: quit
note over socket: ...
emul <-- socket

note over session: removeAllListeners
vscode <-- session: TerminatedEvent

alt If debug session active

vscode -> session: disconnectRequest
session -> emul: disconnect
emul -> socket: quit
'note over socket: ...
emul <-- socket

session <-- emul
note over session: removeAllListeners
vscode <-- session: response

end

note over unittest: Wait until debug session\nnot active anymore
note over unittest: Start unit tests

```



## Code Coverage

Code coverage can be enabled in the launch settings.
Everytime the program is stopped the "Remote" will send information about the executed addresses.
DeZog will then highlight the covered lines.
This is available everywhere (e.g. during debugging or during execution of unit tests).

xxx is either the DebugSessionClass or the Z80UnitTests.

```puml
hide footbox
title Coverage new
participant xxx
Remote -> ZEsarUX: cpu-code-coverage enabled yes
...
xxx -> Remote: Step/Continue
Remote -> ZEsarUX: cpu-step/run
note over ZEsarUX: stopped
Remote <-- ZEsarUX
Remote -> ZEsarUX: cpu-code-coverage get
Remote <-- ZEsarUX: Executed addresses
xxx <-- Remote: Event: 'coverage'
note over xxx: Convert addresses to\nsource file locations.
```



