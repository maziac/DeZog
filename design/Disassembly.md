# Disassembly

The disassembly used in Dezog is derived from the [z80dismblr](https://github.com/maziac/z80dismblr) project.
DeZog uses 2 kinds of disassemblies:
1. The SimpleDisassembly: a brute force disassembly used in the VARIABLEs pane and for the 'dasm' command.
It is "brute force" because it disassembles a small amount (about 10) of instructions and just converts the opcodes into instructions.
2. A more intelligent i.e. "smart" disassembly (AnalyzeDisassembler and DisassemblyClass) which uses z80dismblr features to distinguish code labels from data labels etc. E.g. the disassembly will not necessarily go on with the disassembly after a RET is found.

This document discusses the 2nd (smart) disassembly.

# Glossary

| Name | Description |
|------|-------------|
| reverse engineered list file (rev-eng.list)| The list file maintained by the user. Code that the user has reverse engineered and understood is out here. Normally the user will copy part of the disassembly here, change the labels to meaningful names and add comments. |


# Smart Disassembly (z80dismblr)

Basically the disassembler works on own 'memory', a 64k address block.
The memory can have attributes attached to each address.
When nothing is known yet about the memory all is UNKNOWN (0).
But as soon as something gets known more flags are added.
If anything (what ever) is known at least the ASSIGNED flag is set.
If it gets known that the memory location is used for code it gets the CODE flag.
If it is the first byte of an opcode additionally it receives the CODE_FIRST flag.
If it is data it gets the DATA flag.

Note: as these are flags, combinations are unlikely, but possible. e.g. an address with CODE could also have the DATA attribute if it is e.g. self-modifying code.

The other important structure is the 'addressQueue' which holds a number of known addresses that have been stepped through. I.e. addresses that for sure share the CODE|CODE_FIRST attribute.

When starting a disassembly these addresses are used as entry points into the disassembly.

The original z80dismblr works only on 64k without paging/memory banks.
There are some strategies to overcome the limitation.

The disassembly takes a little time, not much but too much to do it on every step.

The disassembly works on the complete 64k memory space.
At start the 64k memory is fetched from the remote and disassembled.
A new fetch is done if either the slots change, if the memory at the current PC has changed or if the user presses the refresh button.
A new disassembly is done if the memory is refreshed or if there are new addresses to disassemble.
If the disassembly is not recent the refresh button is enabled for indication.

The last PC values are stored because these values are known to be code locations and are used for the disassembly.
A special handling is done for the callstack: The caller of the current subroutine cannot be determined to 100%.

I.e. the stack might be misinterpreted.
Therefore the stack addresses are stored in a different array. This array is cleared when the refresh button is pressed.
I.e. if something looks strange the user can reload the disassembly.

(On a reload only the call stack history is cleared but the current call stack is used for disassembly.)


# AnalyzeDisassembler and DisassemblyClass

The AnalyzeDisassembler and the DisassemblyClass are derived from the Disassembler (z80dismblr).
It modifies the behavior to be more suited for DeZog and (interactive) reverse engineering.

It hooks into the disassembler to change the output:
- funcAssignLabels: to assign labels for addresses. These labels are taken from the Labels instance (which was built from the reverse engineering list file).
- funcFilterAddresses: removes any line from the disassembly output that is already available in the  reverse engineering list file.
- funcFormatAddress: Formats the addresses in the output. Used to add the bank information to the hex address.

The DebugAdapter calls the DisassemblyClass to check for a new memory fetch and disassembly by calling 'setNewAddresses' on each stackTraceRequest.

Breakpoints:
When the disassembly text changes it is also necessary to remove the breakpoints from the disassembly and to add the adjusted values after the new disassembly is available because the line numbers might have been changed.

At the end it is also required to update the decorations for the code coverage info.

There is an additional button in the disasm.list editor that allows the user to manually fetch memory and do a disassembly.
The button is disabled when a disassembly just happened and enabled on each step no disassembly is done.
This is achieved via the context variable 'dezog:disassembler:refreshEnabled' used in package.json and in the Debug Adapter.


On debug session termination the disassembly list file itself stays there and is not removed. Maybe the user would want to continue with reverse engineering after the debug session.
But the breakpoints associated with the disassembly list files are removed.
Otherwise these would show up as error (not associated breakpoints), and would be removed, at the next start of an debug session.


# Special Problems

There are a few special problems to solve in the disassembly and sometimes no real solution exists.

## RST

The RST instruction is often used such that it is followed by one or more bytes that re ready by the RST sub routine.
The disassembler cannot analyze this. For one it would require a dynamic analysis and furthermore it can also be unclear which RST sub routine is used in case several ROMs can be page in.

For now the disassembly simply goes no after the RST instruction. This could lead into a wrong disassembly, e.g. a (1 byte) instruction is decoded that is not existing or, even more problematic), e.g. a non-existing 3 byte instruction is decoded so that also the following instruction is wrongly decoded.

It would be nice if at least the user could correct the disassembly.
One possible solution could to interpret the RST in the rev-eng.list file.
If e.g.
~~~asm
	RST 8
	defb 5
~~~

I.e. data after a RST instruction then the rev-eng parser could mark this memory and pass it to the disassembler.
So the disassembler could also mark as DATA and skip to the next instruction.

Problem:
This is a new concept for the parser and also for the disassembler and this information need to be passed from parser to disassembler.

To be decided yet.


## Branching into Paged Banks

If there is a branch from a slot A into slot B and slot B is shared between 2 or more banks then it is not clear to which bank the branch will take us.

Example:
There are 2 slots.
Slot A is 0x0000-0xBFFF and slot B is 0xC000-0xFFFF.
Slot A is not paged i.e. always points to bank 0.
Slot B can point to bank 1 or bank 2.

Now suppose the following program:
~~~asm
				...
				... ; Some bank switching code
0x4100			call 0xC000
				...

0xC000.B1	SUB_BANK1:
0xC000.B1		ld a,5
0xC002.B1		ret

0xC000.B2	SUB_BANK2:
0xC000.B2		ld hl,0x0000
0xC002.B2		ret
~~~

At the time of disassembly it is unknown if the code at 0x4100 will jump to SUB_BANK1 or SUB_BANK2.
Even if, at the time of disassembly, bank 1 is paged in, it could happen that bank 2 will be paged in when 0x4100 is executed somewhere in the future.

To overcome this problem the disassembler will follow the execution flow only
- as long as the branch address is in the same slot
- or the slot of the branch address is not shared between several banks

Therefore the disassembler has to get the information about the used memory model, i.e. the usage of the slots.

Note: Branching will not only stop on CALLs but also on all other branches like JP/JR.
In case of a call graph the graph will simply stop at that point.



# Grammar

The disassembly list file requires a button. Therefore it requires to have an own language ID ("disassembly").
This is a different ID then "asm-collection". Therefore "ASM Code Lense" cannot be used for syntax coloring.

So DeZog also adds an own grammar, where it includes the grammar from "ASM Code Lens".
If "ASM Code Lense" is not installed this is silently ignored and no syntax highlighting is done.

The involved files are:
- package.json: "grammars"
- grammar/asm_disassembly.json


# Analysis

Apart from call graph and flow chart analysis there is also a symbol execution analysis which is somewhere between static and dynamic analysis.

The goal of this symbolic execution is to find
- the input parameters/registers
- the changed registers

of a subroutine.

The analyzer cannot distinguish between (accidentally) changed registers and "real" output registers.
So, the user has to decide by himself what from the changed register is output and what is just a side effect.


Additional to the flow path (as in flow chart and call graph) the values of the registers are taken into account.
The analysis is symbolic as the registers are normally not assigned with a concrete number but just with a symbolic value.


When a register gets a new value it is updated in a map called 'registers'.
- If, at subroutine end, a register does not exist in the map it's value is not touched by the subroutine. I.e. it is unused.
- If a register (1) is assigned from another register (2), e.g. ```LD A,B```:
	- register (1) is added to 'registers' and gets the symbolic value of register (2).
	- If register (2) does not exist in 'registers':
		- register (1) gets 'unknown'.
		- register (2) is saved in the 'inputRegisters' set. I.e. it is input to the subroutine.
- If a register is modified wo another register, e.g. ```INC A``` or ```LD A,(nn)```:
	- The register is added to 'registers' and gets 'unknown'.
	- If the register does not exist in 'registers':
		- the register is saved in the 'inputRegisters' set. I.e. it is input to the subroutine.
- If a register is set to a concrete value, e.g. ```LD A,#5```:
	- The register is added to 'registers' and gets 'known'. Additionally the value itself is saved.


This results in 2 possible values:
- 'input', plus the register this value was copied from.
- 'known', additionally the concrete value is saved.
- 'unknown'

Together with the symbolic value also the origin is copied.
E.g.:
~~~asm
	LD B,A
	ADD A,5
	... ; Do something useful
	LD A,B
~~~

would copy 'input-A' to the 'registers' map for register 'B'.
Then something is done to A.
Eventually 'B's contents is copied to 'A' which contains 'input-A'.
I.e. the result is:
- A is unchanged.
- A is input


What the symbolic execution cannot find:
- Loops: The analyzer will not follow an loops. I.e. each branch is only followed once. Otherwise a complete execution and Z80 simulation would be required.
- The analyzer will not notice that a register is unchanged if it is modified and then inversely modified. E.g.
~~~asm
	INC A
	DEC A
~~~
To catch those flow paths a full symbolic calculation would be required. This would latest come to its limits when there are loops. E.g.
~~~asm
	LD B,5
L1:
	INC A
	DJNZ L1
	LD B,5
L2:
	DEC A
	DJNZ L2
~~~


## Memory

Memory like "($80000)" or "(HL)" is also handled as registers.
I.e. in the same map.


## Stack

HIER WEITER


## Branches

If the execution flow branches there are several possibilities how a particular register value is set.

Consider the following branches:
~~~dot
digraph {
  "n0" ["label" = "CP 10"];
  "c0" ["label" = "JR Z,L2"];
  "b1" ["label" = "LD B,6"];
  "b2" ["label" = "LD B,7"];
  "end" ["label" = "RET"];
  "n0" -> "c0";
  "c0" -> "b1" ["label" = "L1"];
  "c0" -> "b2" ["label" = "L2"];
  "b1" -> "end";
  "b2" -> "end";
}
~~~

If A would be 10 when entering the graph, B would become 7 at RET.
Otherwise B would be 6.
No other values for B are allowed.
At the end of the graph B is a set: B = known, [6, 7]


It becomes more difficult in the following case:
~~~dot
digraph {
  "n0" ["label" = "CP 10"];
  "c0" ["label" = "JR Z,L2"];
  "b1" ["label" = "INC B"];
  "b2" ["label" = "LD B,7"];
  "end" ["label" = "RET"];
  "n0" -> "c0";
  "c0" -> "b1" ["label" = "L1"];
  "c0" -> "b2" ["label" = "L2"];
  "b1" -> "end";
  "b2" -> "end";
}
~~~

IF A is 10 THEN: B = 7.
ELSE: B = input-B, modified.
At the end of the graph B is: input-B, modified.
'modified' includes all numbers (0-0xFFFF), so it includes also the 7.

The priority table is similar (but not equal) to the symbolic values calculations:

| L1        | L2        | Result      |
|-----------|-----------|-------------|
| input-X   | input-Y   | input-X,Y   |
| known     | known     | known (2 values) |
| known     | modified  | modified    |
| modified  | known     | modified    |
| input-X   | known     | input-X,m   |
| known     | input-Y   | input-Y,m   |
| input-X   | modified  | input-X,m   |
| modified  | input-Y   | input-Y,m   |
| input-X,m | input-Y   | input-X,Y,m |
| input-X   | input-Y,m | input-X,Y,m |
| input-X,m | input-Y,m | input-X,Y,m |

Note: input-X,Y, i.e. several input possibilities, implies 'modified'.
Simplified: 'input' has a higher priority over 'modified' and 'modified' is higher than 'known'.




| A        | B        | Result    |
|----------|----------|-----------|
| input-X  | input-Y  | input-X,Y |
| known    | known    | modified  |
| known    | modified | modified  |
| modified | known    | modified  |
| input-X  | known    | input-X   |
| known    | input-Y  | input-Y   |
| input-X  | modified | input-X   |
| modified | input-Y  | input-Y   |

Simplified: 'input' has a higher priority over 'modified' and 'modified' is higher than 'known'.

~~~json
{
	"input": string[],
	"symValue": 'unmodified|known|unknown|modified'
	"exactValue": number[],
}
~~~
Note: 'unmodified' is only used for unmodified input values.






## Examples:

~~~asm
	INC A	; Symbol(A) = input-A, modified
	RET		; A is input and changed register
~~~

~~~asm
	LD B,A	; Symbol(B) = input-A
	INC A	; Symbol(A) = input-A, modified
	LD A,B	; Symbol(A) = input-A
	RET		; A is unchanged, B is a changed register, B contains input-A
~~~

~~~asm
	LD B,A	; Symbol(B) = input-A
LOOP:
	DEC D	; Symbol(D) = input-D, modified
	DJNZ LOOP	; Symbol(B) = input-A, modified
	RET		; Changed: B, D. Input: A, D
~~~

~~~asm
	LD B,A	; Symbol(B) = input-A
	LD D,0	; Symbol(D) = known
LOOP:
	INC D	; Symbol(D) = modified
	DJNZ LOOP	; Symbol(B) = input-A, modified
	RET		; Changed: B, D. Input: A
~~~

~~~asm
	LD A,(HL)	; Symbol(A) = input-H,L, modified; Unchanged: Symbol(H,L) = input-H,L
	RET		; Changed: A. Input: H, L
~~~

~~~asm
	LD H,$80	; Symbol(H) = known
	LD A,(HL)	; Symbol(A) = input-L, modified; Unchanged: Symbol(L) = input-L
	RET		; Changed: H, A. Input: L
~~~

~~~asm
	LD HL,$8000	; Symbol(H,L) = known
	LD A,(HL)	; Symbol(A) = modified
	RET		; Changed: H=$80, L=$00, A. Input: -
~~~

~~~asm
	LD (IX+5),A	; Symbol(A) = input-A; Symbol(IXH,IXL) = input-IXH,IXL
	RET		; Changed: H=$80, L=$00, A. Input: -
~~~

~~~asm
	LD A,(DE)	; Symbol(A) = input-D,E, modified; Unchanged: Symbol(D,E) = input-D,E
	ADD A,(HL)	; Symbol(A) = input-D,E,H,L, modified; Unchanged: Symbol(H,L) = input-H,L
	RET		; Changed: A. Input: D, E, H, L
~~~

~~~asm
	LD A,B	; Symbol(A) = input-B, modified; Symbol(B) = input-B
	ADD A,E	; Symbol(A) = input-B,E, modified; Symbol(E) = input-E
	INC L	; Symbol(E) = input-L, modified
	ADD A,L	; Symbol(A) = input-B,E,L, modified; Unchanged: Symbol(L) = input-L, modified
	RET		; Changed: A, L. Input: B, E, L.
~~~

~~~asm
	PUSH HL		; Symbol(STACK) = input-H,L
	LD H,$80	; Symbol(H) = known
	LD A,(HL)	; Symbol(A) = input-L, modified; Unchanged: Symbol(L) = input-L
	POP HL		; Symbol(H,L) = input-H,L
	RET		; Changed: A. Input: L
~~~

~~~asm
	PUSH AF			; Symbol(STACK) = input-A,F
	LD ($8000),A	; Symbol($8000) = input-A
	POP AF			; Symbol(H,L) = input-A,F
	RET		; Changed: -. Input: A
~~~

~~~asm
	PUSH AF		; Symbol(STACK) = input-A,F
	PUSH HL		; Symbol(STACK) = input-H,L
	INC HL		; Symbol(H,L) = input-H,L, modified
	LD (HL),A	; Symbol("(HL)") = input-A
	POP HL		; Symbol(H,L) = input-H,L
	POP AF		; Symbol(H,L) = input-A,F
	RET		; Changed: -. Input: A
~~~

~~~asm
	PUSH HL			; Symbol(STACK) = input-A,F
	PUSH DE
	POP HL
	POP DE
	RET		; Changed: -. Input: A
~~~

Symbolic values calculations, e.g. for "ADD":

| A         | B         | Result      |
|-----------|-----------|-------------|
| input-X   | input-Y   | input-X,Y   |
| known     | known     | modified    |
| known     | modified  | modified    |
| modified  | known     | modified    |
| input-X   | known     | input-X,m   |
| known     | input-Y   | input-Y,m   |
| input-X   | modified  | input-X,m   |
| modified  | input-Y   | input-Y,m   |
| input-X,m | input-Y   | input-X,Y,m |
| input-X   | input-Y,m | input-X,Y,m |
| input-X,m | input-Y,m | input-X,Y,m |

Simplified: 'input' has a higher priority over 'modified' and 'modified' is higher than 'known'.



