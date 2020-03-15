# Reverse Debugging

The main idea is to support not only the (normal) forward stepping but also stepping backwards in time.
Reverse Debugging relies on the instruction history. I.e. the executed instruction are recorded and played back when backwards stepping in reverse order.

There are 2 basic types of instruction history:
- the step (or lite) history (base class StepHistory)
- and the cpu (or true) history (vase class CpuHistory)

The step history works with all kind of remotes. It just records the the instructions where the user stepped or breaked.
I.e. it basically records your actions in the debugger and you can replay the locations backwards.
It is not a true instruction history as it misses instructions. E.g. if you press 'continue' and tehn break it records only the start an the end point, not all the instructions in between.
Although this is less powerful than a true cpu history it has the big advantage that it works without support from the remote.

The cpu history requires support from the remote. In fact the remote does all the recording and DeZog just requests the history entries from the remote.
ZEsarUX supports such a true cpu history.

During stepping the following main classes (singletons) are involved:
- DebugAdapter
- Remote
- CpuHistory/StepHistory
- Z80Register

Here is a basic MSC for the lite and true history. One can see that for the lite history the remote is not involved.

```puml
hide footbox
title (Lite) Step History

-> DebugAdapter: Step forward
DebugAdapter -> StepHistory: Store
note over StepHistory: Store registers and \ncallstack
DebugAdapter -> Remote: Step forward
...
-> DebugAdapter: Step back
DebugAdapter -> StepHistory: Step back
note over StepHistory: Recall registers and \ncallstack
DebugAdapter <-- StepHistory: Instruction, Registers, Callstack
```


```puml
hide footbox
title Alternative (Lite) Step History, favorised

participant DebugAdapter
participant StepHistory

-> DebugAdapter: Step forward
DebugAdapter -> Remote: Step forward
Remote -> StepHistory: Store
note over StepHistory: Store registers and \ncallstack
...
-> DebugAdapter: Step back
DebugAdapter -> StepHistory: Step back
note over StepHistory: Recall registers and \ncallstack
DebugAdapter <-- StepHistory: Instruction, Registers, Callstack
```

```puml
hide footbox
title (True) Cpu History

participant DebugAdapter
participant CpuHistory

-> DebugAdapter: Step forward
DebugAdapter -> CpuHistory: Store
note over CpuHistory: Does not store\nanything
DebugAdapter -> Remote: Step forward
note over Remote: Store registers and \ninstruction + (SP) for all\nexecuted instructions
...
DebugAdapter -> CpuHistory: Step back
CpuHistory -> Remote: Get History Entry
note over Remote: Recall registers\n+ instruction + (SP)
CpuHistory <-- Remote: Instruction, Registers
note over CpuHistory: Interprete instruction,\nadd to/remove from callstack
DebugAdapter <-- CpuHistory: Instruction, Registers, Callstack
```

Paradigm:
- The Remote takes care of communication with the History for storing the history info.
- The DebugAdapter communicates with the History for the reverse debugging.
- The DebugAdapter communicates with the Remote for the forward debugging

<hr>

Nicht so gut: Führt nur einen weiteren Schritt (Remote.stepBack) ein.
Vielleicht architekturell besser: DebugAdapter redet nur mit Remote nicht mit History.

```puml
hide footbox
title B: (Lite) Step History

-> DebugAdapter: Step forward
DebugAdapter -> Remote: Step forward
Remote -> StepHistory: Store
note over StepHistory: Store registers and \ncallstack
...
-> DebugAdapter: Step back
DebugAdapter -> Remote: Step back
Remote -> StepHistory: Get History Entry
note over StepHistory: Recall registers and \ncallstack
Remote <-- StepHistory: Instruction, Registers, Callstack
DebugAdapter <-- Remote: Instruction, Registers, Callstack
```

```puml
hide footbox
title (True) Cpu History

participant DebugAdapter
participant Remote
participant CpuHistory
participant External as "External remote"

-> DebugAdapter: Step forward
DebugAdapter -> Remote: Step forward
Remote -> External: Step forward
note over External: Store registers and \ninstruction + (SP) for all\nexecuted instructions
...
DebugAdapter -> Remote: Step back
Remote -> CpuHistory: Get History Entry
CpuHistory -> External: Get History Entry
note over External: Recall registers\n+ instruction + (SP)
CpuHistory <-- External: Instruction, Registers, (SP)
note over CpuHistory: Interprete instruction,\nadd to/remove from callstack
Remote <-- CpuHistory: Instruction, Registers, Callstack
DebugAdapter <-- Remote: Instruction, Registers, Callstack
```


# Reverse Debugging with ZEsarUX

ZEsarUx supports a true cpu-history.
This can record for each executed opcode
- the address
- the opcode
- the registers contents
- and the stack contents

I.e. while stepping backwards it is possible to show the correct register contents at that point in time.

**The memory contents or other HW states are not recorded**.

Anyhow in most cases the reverse debugging feature is used in case we hit a breakpoint and have to step back some opcodes to see why we ended up there.
Of course, knowing the correct memory contents would be beneficially but also without it will be a good help.


# Design

The whole cpu-history logic is implemented in the ZesaruxEmulator.
I.e. it is hidden from the Remote class.

The Zesarux Remote class has to provide methods for step back and running reverse.


TODO: Needs rework: Most of the stuff is not done anymore in the Remote class but in the CpuHistory class.

When the ZesaruxEmulator class receives a stepBack for the first time it will retrieve the youngest item from the ZEsarUX cpu-history and the system is in reverse debugging mode.
It now reads the last line of the cpu-history and retrieves
- the address
- the registers
- the opcode (as string)

```puml
hide footbox
title User pressed "Step Back"
actor user
participant vscode
participant "Emul\nDebug\nSession" as session
participant "Emulator" as emul
participant "ZEsarUX" as zesarux

user -> vscode: "Step Back"
vscode -> session: stepBackRequest

session -> emul: stepBack
emul -> zesarux: cpu-history get 0
emul <-- zesarux
session <-- emul

vscode <-- session: response
vscode <-- session: StoppedEvent('step')

vscode -> session: ...

vscode -> session: variablesRequest

session -> emul: getRegisters
session <-- emul

session -> emul: getMemoryDump
emul -> zesarux: read-memory
emul <-- zesarux
session <-- emul

vscode <-- session: response
```
Note: The getRegisters command is caught by the Emulator instance and will return the cached value from the cpu-history command.
All other requests (like memory dump requests) will still go to the real emulator (ZEsarUX).
I.e. these values will not change during reverse debugging and may be potentially wrong, or better, they contain the value at the last executed machine cycle.


# Stepping in Reverse Debugging Mode

Not only "StepBack" need to be considered in reverse debug mode the other (forward) stepping procedures should work as well:
- ContinueReverse
- Continue
- StepOver
- StepInto
- StepOut


## Backward

### StepBack

The MSC is shown above.
"StepBack" simply moves up the cpu-history by one.


### ContinueReverse

"ContinueReverse" moves up the cpu-history until
- a breakpoint is hit or
- end of cpu-history


## Forward

The forward procedures all work basically in 2 modes.
- the normal mode: stepping/runnning in the emulator, i.e. no reverse debugging
- the reverse mode: stepping/runnning through the cpu-history


### Continue

"Continue" moves down in the cpu-history until
- a breakpoint is hit or
- start of the cpu-history

Note: When the start of the cpu-history is found it does not automatically move over into "normal" continue mode but stop instead.


### StepOver

"StepOver" needs to step over "CALL"s and "RST"s. This is not so simple as it seems.


### StepInto

"StepInto" simply moves down the cpu-history by one.

If an interrupt kicks-in it steps into the interrupt.


### StepOut

"StepOut" moves down the cpu-history until
- a breakpoint is hit or
- a "RETx" (conditional or unconditional) is found


## Reverse Callstack and Interrupts

Main problem in implementing the reverse debugging was to obtain a correct callstack.

This is basically done by observing the instructions for PUSH/POP/CALL/RST and the PC and SP to check for interrupts.

The methods dealing with the callstack are:
handleReverseDebugStackBack and handleReverseDebugStackForward.
The source code contains also pseudo code to explain the algorithm.


## Breakpoints

During forward or reverse stepping/running the breakpoint addresses are evaluated.
If a breakpoint address is reached "execution" is stopped.


# Other Requests

- scopesRequest: No special behavior.
- stackTraceRequest: The stack trace request does not request the stack from ZEsarUX but uses the internal reverse debug stack instead.
- variablesRequest: No special behavior. The only special variables that change are the registers. These are speciallly treated in the Emulator.
