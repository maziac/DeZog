# Reverse Debugging

The main idea is to support not only the (normal) forward stepping but also stepping backwards in time.

Due to emulator restrictions a lightweight approach is chosen.
Fortunately ZEsarUx supports a cpu-history.
This can record for each executed opcode
- the address
- the opcode
- the registers contents
- andthe stack contents

I.e. while stepping backwards it is possible to show the correct register contents at that point in time.

The memory contents or other HW states are not recorded.
Therefore this is a lightweight solution.

Anyhow in most cases the reverse debugging feature is used in case we hit a breakpoint and have to step back some opcodes to see why we ended up there.
Of course, knowing the correct memory contents would be beneficially but also without it will be a good help.


# Design

The whole cpu-history logic is implemented in the ZesaruxEmulator.
I.e. it is hidden from the Emulator class.

The Emulator/ZesaruxEmulator class has to provide methods for step back and running reverse.


When the ZesaruxEmulator class receives a stepBack for the first time it will retrieve last item from the ZEsarUX cpu-history and the system is in reverse debugging mode.
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
Note: The registers are caught by the Emulator instance and returned from the cpu-transcation-log.
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

Below are only the reverse procedures described.


### Continue

"Continue" moves down in the cpu-history until
- a breakpoint is hit or
- start of the cpu-history

Note: When the start of the cpu-history is found it does not automatically move over into "normal" continue mode.


### StepOver

<<<TODO: NEEDS REWORK>>>

"StepOver" needs to step over "CALL"s and "RST"s. This is not so simple as it seems.

**Approach A: Using PC**

If a "CALLxxx" (conditional or unconditional) is found the next expected step-over address is current_PC+3 (PC=program counter).

If a "RST" is found the next expected address is PC+1. With ESXDOS RST implementation it is PC+2.

If a "JR"/"JP"/"DJNZ" is found it is either the next address or the jump-to-address.

If a "RETx" (conditional or unconditional) is found it is either the next address or some address from the stack.

I.e. with all this it is not possible to clarify if the next address(es) should be skipped because it is an interrupt or if "StepOver" should stop.

Example:
A "RET" is found. So there is no hint what address to expect next. If the same time the interrupt kicks in with some address "StepOver" would stop here and not skip it.


**Approach B: Using SP (better)**

The idea is that if a subroutine is "CALL"ed then the SP (stack pointeR) will decrease by 2.
I.e. if no subroutine is called the SP will not change.

I.e. the algorithm simply searches the cpu-history downwards until a line with the same SP is found.

If an interrupt would kick in the SP changes and the interrupt would be skipped.

Some instructions change the SP intentionally. This instructions need special care:
- "PUSH": the expected_SP is SP-2
- "POP": the expected_SP is SP+2
- "DEC SP": the expected_SP is SP-1
- "INC SP": the expected_SP is SP+1
- "LD SP,nnnn": the expected_SP is nnnn
- "LD SP,HL": the expected_SP is HL
- "LD SP,IX": the expected_SP is IX
- "LD SP,IY": the expected_SP is IY
- "LD SP,(nnnn)": the expected_SP is unknown. In this case simply the next line is executed. This would be wrong only if an interrupt kicks in. As this command is used very rarely and it shouldn't be used while an interrupt is active this should almost never happen.
- "RETx": the expected_SP is either SP+2 or it could also be SP in case of a conditional RET. So both are checked. Note: for ease of implementation conditional and unconditonal RET is not distinguished.


Note: If during moving through the cpu-history a breakpoint is hit "StepOver" stops.


### StepInto

"StepInto" simply moves down the cpu-history by one.

If an interrupt kicks-in it steps into the interrupt.


### StepOut

"StepOut" moves down the cpu-history until
- a breakpoint is hit or
- a "RETx" (conditional or unconditional) is found


<<<TODO: NEEDS REWORK>>>


**Approach A:**
If a "RETx" is found the SP value is stored and the next line is analysed.
if SP has been decremented by 2 the RET was executed. If so "StepOut" stops otherwise it continues.

Note:
If an interrupts happens right after the "RETx" it should be skipped because then the next SP wouldn't be decremented by 2.

Problems:
- If an interrupt kicks in anywhere else and returns then this "RETI" is found and "StepOut" stops.
One could ignore the "RETI" but then "StepOut" of an interrupt would not work.


**Approach B: (better)**
The current SP is is stored and the cpu-history is analyzed until a "RET" is found and the next line contains an SP that is bigger than the original SP.

Notes:
- as POP etc. can also modify the SP, it is searched for a "RET" and the SP of the following line. This could go wrong if the SP changes w.g. because of a POP and then a "RET cc" (conditional) is not executed. In that case the algorthm will stop although we have not really stepped out.
- it is searched for an SP bigger than and not for an SP that is equal to the old SP+2 because it may happen that the stack is manipulated. In general manipulation could happen in both directions but in order to skip an kicking in interrupt it is only checked that it is bigger.


### Interrupts

The cpu-history simply records the executed addressed. This also means that the interrupts are inserted when they occur.


### Breakpoints

During forward or reverse stepping/running the breakpoint addresses are evaluated.
If a breakpoint address is reached "execution" is stopped.

The breakpoint condition is **not** evaluated.
This has 2 reasons:
- effort for doing so would be quite high but the use case scenarios are limited
- even if implemented it could lead to false positives in case memory conditions are checked. The memory is not changed during reverse debugging, i.e. it may contain false value for the current PC address.

Of course, one could evaluate at lest the conditions without memory, i.e. the register related only, maybe this is done in the future.



# Other Requests

- scopesRequest: No special behavior.
- stackTraceRequest: No special behavior. As the memory contents changes are not known this will simply return the current memory state at the time the reverse debugging was entered.
- variablesRequest: No special behavior. The only special variables that change are the registers. These are special treated in the Emulator.


## Pseudocode (ZEsarUX):

### Step back
1. "cpu-step-back" is received: Mode is changed to "reverse-debug-mode". The rl_index is decreased.
3. "get-registers" is received: The register values from the record_list[rl_index] is sent.
3. "get-stack-trace" is received: ??? need to check how this list is generated. If it is a simple memory lookup then I need to save the memory values for sure.

### Continue reverse
1. "run-reverse" is received: Mode is changed to "reverse-debug-mode". The rl_index is decreased in a loop until (this is done very fast)
	a) the list start is reached
	b) a breakpoint condition is met
2. "get-registers" is received: ... same as above

### Step (forward)
1. "cpu-step" is received while in "reverse-debug-mode". The rl_index is increased.
~~~
	If rl_index > record_list then: leave "reverse-debug-mode".
~~~
2. "get-registers" is received: ... same as above


### Continue (forward)
1. "run" is received while in "reverse-debug-mode". The rl_index is increased in a loop until (this is done very fast)
	a) the list end is reached: leave "reverse-debug-mode". Run normal "run" (i.e. continue seemingless with normal run mode).
	b) a breakpoint condition is met
2. "get-registers" is received: ... same as above

### Get historic registers
1. "get-historic-register reg" is received: The record list is checked for changes in the register. The current and the past values are sent together with PC values and information when the change happened. E.g.
~~~
-> "get-historic-register DE"
<-
DE=5F8A
DE=34E9 PC=A123 dCount=15
DE=7896 PC=A089 dCount=2343
~~~
Note: dCount (differential count) is a decimal number, i.e. it can grow bigger than FFFFh.

vscode could show this when hovering above a register.
Note: this would require to read always the complete cpu-history.



# Restrictions

There is no reliable way to determine interrupts while stepping backwards.
This affects the displayed callstack.

The callstack requires the **called** address for display. This is the address that is e.g. called when an instruction like "CALL nnnn" is executed. nnnn in this example is the called address.

To obtain this address the return address (let's call it ret_addr) from the stack is used.
The ret_addr just points after the executed CALL instruction.
A CALL opcode start with one byte to determine the instruction followed by 2 bytes for the called address (nnnn).
To get the called address we need to get the memory contents from the location ret_addr-2, i.e. (ret_addr-2).

This works very well without interrupts.

With interrupts there are problems.
Since an interrupt can happen everytime, it can also happen when some "CALL mmmm" is executed.
In that case the algorithm would take the mmmm address as the called address and show that in the callstack. This is, of course, incorrect.

Anyhow after returning from the interrupt the callstack is OK again.

Thus, if you have enabled the option "skipInterrupt": true' you will normally not run into this problem.




# Open

- Soll ich tstates Information anzeigen?
- müsste ich ja auch aufsummieren bei "reverseContinue" bis zum BreakPoint.
- Will ich: "Get historic registers" um eine Register historie anzuzeigen?
E.g. history of registers:
It would be possible to have a look at the registers, e.g. when they changed. With a click one could move to the source code location/time when the change happened.
