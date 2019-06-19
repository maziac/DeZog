# Reverse Debugging

Markdown paraemeters: markdown-raw_tex+tex_math_single_backslash
List:
- a
- b
- c

The main idea is to support not only the (normal) forward stepping but also stepping backwards in time.

Due to emulator restrictions a lightweight approach is chosen.
Fortunately ZEsarUx supports a cpu-transaction-log.
This can record for each executed opcode
- the address
- the opcode
- the registers contents

I.e. while stepping backwards it would be possible to show the correct register contents at that point in time.

The memory contents or other HW states are not recorded.
Therefore this is a lightweight solution.

Anyhow in most cases the reverse debugging feature is used in case we hit a breakpoint and have to step back some opcodes to see why we ended up there.
Of course, knowing the correct memory contents would be beneficially but also without it will be a good help.


# Design

The whole cpu-transaction-log logic is implemented in the ZesaruxEmulator.
I.e. it is hidden from the Emulator class.

The Emulator/ZesaruxEmulator class has to provide methods for step back and running reverse.


When the ZesaruxEmulator class receives a stepBack for the first time it will increment a stepBackCounter.
If this stepBackCounter is not 0 this means the system is in reverse debugging mode.
It now reads the last line of the cpu-transaction-log file and retrieve
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
participant "ZEsarUX\nEmulator" as zemul

user -> vscode: "Step Back"
vscode -> session: stepBackRequest

session -> zemul: stepBack

note over zemul: - stepBackCounter++\n- move file pointer to prev line\nin transaction-log

session <-- zemul

vscode <-- session: response
vscode <-- session: StoppedEvent('step')

vscode -> session: ...

vscode -> session: variablesRequest
note over session: ...
session -> emul: getRegisters

emul -> zemul: getRegistersFromEmulator

alt stepBackCounter != 0
note over zemul: - read line of transaction-log\n- read PC and registers and \nreturn values
end

emul <-- zemul
session <-- emul

vscode <-- session: response


```


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
"StepBack" simply moves up the transaction log by one.


### ContinueReverse

"ContinueReverse" moves up the transaction log until
- a breakpoint is hit or
- the file ends


## Forward

The forward procedures all work basically in 2 modes.
- the normal mode: stepping/runnning in the emulator, ZEsarUX)
- the reverse mode: stepping/runnning through the transaction log

Below are only the reverse procedures described.


### Continue

"Continue" moves down in the transaction log until
- a breakpoint is hit or
- the file ends

Note: When the file ends "Continue" stops. It does not automatically move over into "normal" continue mode.


### StepOver

"StepOver" needs to step over "CALL"s and "RST"s. This is not so simple as it seems.

**Approach A: Using PC**

If a "CALLxxx" (conditional or unconditional) is found the next expected step-over address is current_PC+3 (PC=program counter).

If a "RST" is found the next expected address is PC+1. With ESXDOS RST implementation it is PC+2.

If a "JR"/"JP"/"DJNZ" is found it is either the next address or the jump-to-address.

If a "RETx" (conditional or unconditional) is found it is either the next address or some address from the stack.

I.e. with all this it is not possible to clarify if the next address(es) should be skipped because it is an interrupt or if "StepOver" should stop.

Example:
A "RET" is found. So there is no hint what address to expect next. If the same time the interrupt kicks in with some address "StepOver" would stop here and not skip it.


**Approach B: Using SP**

The idea is that if a subroutine is "CALL"ed then the SP (stack pointeR) will decrease by 2.
I.e. if no subroutine is called the SP will not change.

I.e. the algorithm simply searches the transaction log downwards until a line with the same SP is found.

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


Note: If during moving through the transaction log a breakpoint is hit "StepOver" stops.


### StepInto

"StepInto" simply moves down the transaction log by one.


### StepOut

"StepOut" moves down the transaction log until
- a breakpoint is hit or
- a "RETx" (conditional or unconditional) is found

**Approach A:**
The current SP is is stored and the transaction log is analyzed until a "RET" is found and the next line contains an SP that is smaller than the original SP.

Problems:
- as POP etc. can also modify the SP

Noch nicht zu Ende gedacht.


**Approach B:**
If a "RETx" is found the SP value is stored and the next line is analysed.
if SP has been decremented by 2 the RET was executed. If so "StepOut" stops otherwise it continues.

Note:
If an interrupts happens right after the "RETx" it should be skipped because then the next SP wouldn't be decremented by 2.

Problems:
- If an interrupt kicks in anywhere else and returns then this "RETI" is found and "StepOut" stops.
One could ignore the "RETI" but then "StepOut" of an interrupt would not work.


### Interrupts

The transaction log simply records the executed addressed. This also means that the interrupts are inserted when they occur.


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
- stackTraceRequest: No special behavior. As the memory contents changes are not known this will simply return the current memory state at stepBackCounter=0.
- variablesRequest: No special behavior. The only special variables that change are the registers. These are special treated in the Emulator.


# Open

- Soll ich tstates Information anzeigen?
- müsste ich ja auch aufsummieren bei "reverseContinue" bis zum BreakPoint.

- init() vom ZesaruxTransactionLog ist in CodeCoverage Funktion. Das muss ich umdesignen.

- Wenn sowieso immer alle Register gebracht werden in dem CPU transaction log, dann ist die address Information redundant, da sie auch in den Registern vorhanden ist. Ich kann also 5 byte sparen, wenn ich die Adress Info nicht mehr explizit anfordere sondern aus "PC=xxxx" extrahiere.


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
1. "cpu-step" is received while in "reverse-debug-made". The rl_index is increased.
~~~
	If rl_index > record_list then: leave "reverse-debug-made".
~~~
2. "get-registers" is received: ... same as above


### Continue (forward)
1. "run" is received while in "reverse-debug-made". The rl_index is increased in a loop until (this is done very fast)
	a) the list end is reached: leave "reverse-debug-made". Run normal "run" (i.e. continue seemingless with normal run mode).
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
Note: this would require to read always the complete transaction-log.


# Length of the recording

The transaction log can become very big very fast. Each transaction will occupy about 100 bytes. I.e. at a 4MHZ clock speed we will generate about 100MB of data.
Or 1GB per 10 secs. A minute will generate 6GB and an hour generates 360GB.
In modern PCs this is manageable as normally one would require to run a program only for a few secs, maybe minutes.
But in some cases, when e.g. hunting a bug that very rarely occurs and were the system e.g. would have to run over night, it would be more beneficial to have an option to limit the max. length of the transaction log and store only the last transactions.
Like a queue that forgets the oldest entries.

<This is currently discussed with Cesar>.


# Reaching the End of the Recording

When reaching the end of the recording it is not possible to step back further.


# Breakpoints

Running inside the transaction log will, of course, not fire any of the ZEsarUX breakpoints. Neither when running backwards nor forward.

There are several options:
- ignore breakpoints: running would run til the end of the transaction log. This is not helpful. In fact it would be mean that running backward does not work only stepping backward.
- ignore breakpoint conditions (other than the PC): This would be simple to implement and would already cover a lot of use case.
- mimic the breakpoint conditions: the breakpoint conditions could be evaluated during running inside the transaction-log. This would be one of the best options although the most difficult to implement. It is also questionable how many use cases this will really include as the memory conditions can anyway not be tested. So we can only check on register values.




# Additional Features

Ideas:

- E.g. history of registers:
It would be possible to have a look at the registers, e.g. when they changed. With a click one could move to the source code location/time when the change happened.



