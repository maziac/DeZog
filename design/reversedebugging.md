# Reverse Debugging

The main idea is to support not only the (normal) forward stepping but also stepping backwards in time.
Reverse Debugging relies on the instruction history. I.e. the executed instruction are recorded and played back when backwards stepping in reverse order.

There are 2 basic types of instruction history:
- the step (or lite) history (base class StepHistory)
- and the cpu (or true) history (vase class CpuHistory)

The step history works with all kind of remotes. It just records the the instructions where the user stepped or breaked.
I.e. it basically records your actions in the debugger and you can replay the locations backwards.
It is not a true instruction history as it misses instructions. E.g. if you press 'continue' and then break it records only the start an the end point, not all the instructions in between.
Although this is less powerful than a true cpu history it has the big advantage that it works without support from the remote.

The cpu history requires support from the remote. In fact the remote does all the recording and DeZog just requests the history entries from the remote.
ZEsarUX supports such a true cpu history.

During stepping the following main classes (singletons) are involved:
- DebugAdapter
- Remote
- CpuHistory/StepHistory
- Z80Register

Here is a basic MSC for the lite and true history.

```puml
hide footbox
title (Lite) Step History

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

~~~
                            ┌────────────────────┐
                            │                    │
                            │  StepHistoryClass  │
                            │                    │
                            └────────────────────┘
                                       △
                                       │
                            ┌────────────────────┐
                            │                    │
                            │  CpuHistoryClass   │
                            │                    │
                            └────────────────────┘
                                       △
           ┌───────────────────────────┼───────────────────────────┐
           │                           │                           │
┌────────────────────┐      ┌────────────────────┐      ┌────────────────────┐
│                    │      │                    │      │                    │
│ ZesaruxCpuHistory  │      │  ZxSimCpuHistory   │      │        ...         │
│                    │      │                    │      │                    │
└────────────────────┘      └────────────────────┘      └────────────────────┘
~~~

The history is a singleton called StepHistory.
There exist a second global variable CpuHistory which points to the same StepHistory instance in case true cpu history is supported.

CpuHistory is created by the Remote whereas StepHistory is created by the DebugAdapter in case the Remote did not create any CpuHistory.
Thus, if the Remote does not support true CPU history, it simply does not do anything.
The DebugAdapter jumps in and handles the StepHistory outside of the Remote.
If, on the other hand, the Remote did create a CpuHistory then the DebugAdapter does ntohing and the history is handled by the Remote.

The CpuHistory retrieves the callstack when entering reverse debug mode and then manipulates it by interpreting the Z80 instructions.
The StepHistory is simpler, it directly stores the callstack at each step position.

The following MSCs show the paths for the cpu history.

```puml
hide footbox
title User pressed "Step Back or Reverse Continue"
actor user
participant vscode
participant "DebugAdapter" as da
participant "History" as history
participant "Remote" as remote
participant "Z80Registers" as registers

user -> vscode: "Step Back" etc.
vscode -> da: stepBackRequest\ncontinueReverseRequest
vscode <-- da: response

da -> history: revDbgPrev
history -> remote: getHistoryItem
history <-- remote: history item
note over history: Manipulate the\ncall stack
da <-- history: history item
history -> registers: setCache
vscode <-- da: StoppedEvent

vscode -> da: ...

vscode -> da: stackTraceRequest
da -> history: getCallStack
da <-- history
vscode <-- da: response

vscode -> da: variablesRequest

da -> registers: getRegisters
da <-- registers

da -> remote: getMemoryDump
da <-- remote
```


```puml
hide footbox
title User pressed "Step forward during reverse debugging"
actor user
participant vscode
participant "DebugAdapter" as da
participant "History" as history
participant "Remote" as remote
participant "Z80Registers" as registers

user -> vscode: "Step" etc.
vscode -> da: nextRequest\nstepInRequest\nstepOutRequest\ncontinueRequest
vscode <-- da: response

da -> history: revDbgNext
note over history: Manipulate the\ncall stack
da <-- history: history item
history -> registers: setCache
vscode <-- da: StoppedEvent

vscode -> da: ...

vscode -> da: stackTraceRequest
da -> history: getCallStack
da <-- history
vscode <-- da: response

vscode -> da: variablesRequest

da -> registers: getRegisters
da <-- registers

da -> remote: getMemoryDump
da <-- remote

```

Note: As you can see: the memory is not part of the history. I.e. the memory contents you see is the actual one. There is no history for the memory.


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
- stackTraceRequest: The stack trace request does not request the stack from Remote but uses the internal reverse debug stack instead.
- variablesRequest: No special behavior. The only special variables that change are the registers. These are set by theStep/CpuHistory in the Z80Registers.
