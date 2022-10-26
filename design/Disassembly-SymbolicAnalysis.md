# Disassembly and Symbolic Analysis

NOT IMPLEMENTED!


# Parameter Analysis - not implemented

Note: This is a thought experiment how symbolic analysis could be implemented.

Apart from call graph and flow chart analysis there is also a symbol execution analysis which is somewhere between static and dynamic analysis.

The goal of this symbolic execution is to find
- the input parameters/registers
- the changed registers
- if memory is used or modified

of a subroutine.

The analyzer cannot distinguish between (accidentally) changed registers and "real" output registers.
So, the user has to decide by himself what from the changed register is output and what is just a side effect.


A changed register is a register that is modified in the subroutine such that it may contain a different value when leaving the subroutine than when entering it.

An input parameter/register is a register that somehow modifies the output.
Output can be another register, memory or I/O.

Notes:
- Side effects are not considered. I.e. if an I/O port is read from an "input" register but the IN result is afterwards "thrown away" the "input" register is not recognized as input.

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
- 'known', additionally the concrete value is saved.
- 'unknown'

~~~json
"SymbolicValue": {
	"known": boolean,
	"values": (number|string)[],	// A concrete number or a symbolic value (string)
}
~~~


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
- A is input (as it is copied to B)

Note: Maybe B was used here just to save and restore register A. Or the intention was also to copy the value. The algorithm cannot decide on that.


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


## Registers

If a register is set there are several possibilities how a registers gets its symbolic value.

- Simple assignment: Example: LD A,5: Symbol(A) = known
- Copy: Example: LD A,B: Symbol(A) = Symbol(B)
- Modification:	Example: INC A
	Any input stays as it was. The 'known' is changed to false.
- Calculation with 2 inputs: Example: ADD A,B
	The input is merged. The 'known' is changed to false.
	See also the more advanced explanation below.

### Symbolic calculations with 2 inputs

The symbolic values calculations below apply to all map entries, not only memory.
(E.g. "ADD A,B")

| A         | B         | Result      |
|-----------|-----------|-------------|
| input-X,k | input-Y,k | input-X,Y,u |
| known     | known     | unknown     |
| known     | unknown   | unknown     |
| unknown   | known     | unknown     |
| input-X,k | known     | input-X,u   |
| known     | input-Y,k | input-Y,u   |
| input-X,k | unknown   | input-X,u   |
| unknown   | input-Y,k | input-Y,u   |
| input-X,u | input-Y,k | input-X,Y,u |
| input-X,k | input-Y,u | input-X,Y,u |
| input-X,u | input-Y,u | input-X,Y,u |

Simplified:
- 'unknown' has a higher priority than 'known'
- 'input' are handled independent of known/unknown and inputs are simply merged.

| A         | B         | Result      |
|-----------|-----------|-------------|
| known     | known     | unknown     |
| known     | unknown   | unknown     |
| unknown   | known     | unknown     |
| unknown   | unknown   | unknown     |

I.e. no matter what operands are used in the calculation, the result is unknown.



## Memory and I/O

Memory like "($80000)" or "(HL)" is also handled as registers.
I.e. in the same map.

The "input" can often be read as "depends on. I.e. a ```LD A,(HL)``` gets the value: "input-H,L,u" as it depends on H and L. It is 'unknown' because even if H and L are known it is unknown which exact value the memory contents is.

Examples:

~~~asm
	LD ($8000),A	; Symbol("($8000)") = input-A, known
	RET
	; Here A would be an input as "($8000)" is added to the map and contains "input-A".
~~~

~~~asm
	INC A			; Symbol(A) = input-A, unknown
	LD ($8000),A	; Symbol("(HL)") = input-A, unknown
	RET
	; A is input because of 2 reasons:
	;   - A was incremented ("input-A,u") and
	;   - "(HL)" is added to the map and contains "input-A".
~~~

~~~asm
	INC A			; Symbol(A) = input-A, unknown
	LD A,($8000)	; Symbol(A) = input-$8000, k
	RET
	; A is not input. No entry in the map contains "input-A".
	; Memory $8000 becomes input as A contains "input-$8000, k"
~~~

~~~asm
	LD A,(HL)	; Symbol(A) = "input-H,L,u"; Symbol("(HL)") = "input-H,L,k" or not created
	RET
	; HL is input as the map contains "input-H,L,k" for "(HL)" and "input-H,L,u" for "A"
~~~

~~~asm
	LD (HL),A	; Symbol(A) = "input-A"; Symbol("(HL)") = "input-A,H,L,k"
	RET
	; HL is input as the map contains "input-H,L,k" for "(HL)"
~~~

~~~asm
	LD (HL),A	; Symbol(A) = "input-A"; Symbol("(HL)") = "input-A,H,L,k"
	LD B,(HL)	; Symbol(B) = "input-A,H,L,k"; Symbol("(HL)") = "input-A,H,L,k"
	RET
	; HL is input as the map contains "input-H,L,k" for "(HL)"
~~~

~~~asm
	IN A,(C)	; Symbol(A) = "input-B,C,u"; Symbol("IN(C)") = "input-B,C,k" or not created
	RET
	; BC is input as the map contains "input-B,C,u" for "A"
~~~

~~~asm
	OUT (C),A	; Symbol(A) = "input-A,k"; Symbol("OUT(C)") = "input-A,B,C,k"
	RET
	; BC is input as the map contains "input-A,B,C,k" for "OUT(C)"
	; A is input as the map contains A in "input-A,B,C,k" for "OUT(C)"
~~~


## Stack

NOTE: A good stack analysis would require algebra on the symbolic or concrete values which is ot done because it would also require a loop analysis.

Therefore the stack analysis is limited to PUSH/POP only and it assumes that these are not done in a LOOP or on different branches.
If such a piece of SW would be analyzed the results are certainly wrong.

The analysis here is mainly to find out that certain values have been restored and are not altered by the subroutine.


NOT DONE:

The stack is treated similar to memory but with the difference that changes to SP-memory are not considered as input.
For the stack pointer some calculation is available.
On entry of the subroutine the SP value is unknown, therefore only a relative addressing is available.
PUSH and POP are considered and would use the map entries of the SP value.

Example:
~~~asm
	PUSH BC		; Symbol("SP(-2)") = input-B,C,k
	PUSH HL		; Symbol("SP(-4)") = input-H,L,k
	LD HL,DE
	...
	POP HL		; Symbol(H,L) = input-H,L,k
	POP BC		; Symbol(B,C) = input-B,C,k
	RET
~~~


~~~asm
	INC C		; Symbol(C) = input-C,u
	PUSH BC		; Symbol("SP(-2)") = input-B,C,u
	...
	POP BC		; Symbol(B,C) = input-B,C,u
	RET
~~~

Note: this would result in B and C being input because they have been modified (Symbol(B,C) = input-B,C,u). but this is wrong, only C has been modified.


If SP is set to a certain value:
~~~asm
	LD SP,$8000	; Symbol(SP) = known
	PUSH BC		; Symbol("SP($8000-2)") = input-B,C,k
	PUSH HL		; Symbol("SP($8000-4)") = input-H,L,k
	LD HL,DE
	...
	POP HL		; Symbol(H,L) = input-H,L,k
	POP BC		; Symbol(B,C) = input-B,C,k
	RET
~~~

SP manipulates the return address (e.g. RST x; defb N):
~~~asm
	PUSH AF		; Save AF
	PUSH HL		; Save HL
	INC SP : INC SP : INC SP : INC SP	; Increment to point to return address
	POP HL		; Get return address
	LD A,(HL)	; Get value at return address
	INC HL		; Modify return pointer
	PUSH HL		; And put on stack
	...			; Do something
	DEC SP : DEC SP : DEC SP : DEC SP	; Decrement to restore HL and AF
	POP HL		; Restore HL
	POP AF		; Restore AF
	RET
~~~
~~~asm
	PUSH AF		; Symbol("SP(-2)") = input-A,F,k
	PUSH HL		; Symbol("SP(-4)") = input-H,L,k
	INC SP : INC SP : INC SP : INC SP	; Symbol(SP) = known, value=0
	POP HL		; Symbol(H,L) = input-SP(0), k
	LD A,(HL)	; Symbol(A) = input-SP(0), k
	INC HL		; Symbol(H,L) = input-SP(0), u
	PUSH HL		; Symbol("SP(0)") = input-SP(0), u
	...			; Do something
	DEC SP : DEC SP : DEC SP : DEC SP	; Symbol(SP) = known, value=-4
	POP HL		; Symbol(H,L) = input-H,L,k
	POP AF		; Symbol(A,F) = input-A,F,k
	RET
~~~
Result: HL, AF unchanged. The input data N after the RST is not exactly found.
This would require better symbolic algebra.



## Branches

If the execution branches there are several possibilities how a particular register value is set.

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
ELSE: B = input-B, unknown.
At the end of the graph B is: input-B, unknown.
'unknown' includes all numbers (0-0xFFFF), so it includes also the 7.

The priority table is similar (but not equal) to the symbolic values calculations:

| L1        | L2        | Result      |
|-----------|-----------|-------------|
| input-X,k | input-X,k | input-X,k   |
| input-X,u | input-X,k | input-X,u   |
| input-X,k | input-X,u | input-X,u   |
| input-X,u | input-X,u | input-X,u   |
| input-X,k | input-Y,k | input-X,Y,u |
| known     | known     | known (2 values) |
| known     | unknown   | unknown     |
| unknown   | known     | unknown     |
| input-X,k | known     | input-X,u   |
| known     | input-Y,k | input-Y,u   |
| input-X,k | unknown   | input-X,u   |
| unknown   | input-Y,k | input-Y,u   |
| input-X,u | input-Y,k | input-X,Y,u |
| input-X,k | input-Y,u | input-X,Y,u |
| input-X,u | input-Y,u | input-X,Y,u |

Simplified:
- If branches are equal the result is L1 or L2 (are the same anyway)
- The result is 'known' only if all branches are 'known'.
- The inputs merge.

| A         | B         | Result      |
|-----------|-----------|-------------|
| known     | known     | known       |
| known     | unknown   | unknown     |
| unknown   | known     | unknown     |
| unknown   | unknown   | unknown     |

If, at the end,
- a register still contains 'input-R,k' (R = register name) then it is unchanged.
- a register (or memory) contains 'input-R,u' (no matter if R is own register name or not) then R is an input parameter.




## Examples:

~~~asm
	INC A	; Symbol(A) = input-A, unknown
	RET		; A is input and changed register
~~~

~~~asm
	LD B,A	; Symbol(B) = input-A
	INC A	; Symbol(A) = input-A, unknown
	LD A,B	; Symbol(A) = input-A
	RET		; A is unchanged, B is a changed register, B contains input-A
~~~

~~~asm
	LD B,A	; Symbol(B) = input-A
LOOP:
	DEC D	; Symbol(D) = input-D, unknown
	DJNZ LOOP	; Symbol(B) = input-A, unknown
	RET		; Changed: B, D. Input: A, D
~~~

~~~asm
	LD B,A	; Symbol(B) = input-A
	LD D,0	; Symbol(D) = known
LOOP:
	INC D	; Symbol(D) = unknown
	DJNZ LOOP	; Symbol(B) = input-A, unknown
	RET		; Changed: B, D. Input: A
~~~

~~~asm
	LD A,(HL)	; Symbol(A) = input-H,L, unknown; Unchanged: Symbol(H,L) = input-H,L
	RET		; Changed: A. Input: H, L
~~~

~~~asm
	LD H,$80	; Symbol(H) = known
	LD A,(HL)	; Symbol(A) = input-L, unknown; Unchanged: Symbol(L) = input-L
	RET		; Changed: H, A. Input: L
~~~

~~~asm
	LD HL,$8000	; Symbol(H,L) = known
	LD A,(HL)	; Symbol(A) = unknown
	RET		; Changed: H=$80, L=$00, A. Input: -
~~~

~~~asm
	LD (IX+5),A	; Symbol(A) = input-A; Symbol(IXH,IXL) = input-IXH,IXL
	RET		; Changed: H=$80, L=$00, A. Input: -
~~~

~~~asm
	LD A,(DE)	; Symbol(A) = input-D,E, unknown; Unchanged: Symbol(D,E) = input-D,E
	ADD A,(HL)	; Symbol(A) = input-D,E,H,L, unknown; Unchanged: Symbol(H,L) = input-H,L
	RET		; Changed: A. Input: D, E, H, L
~~~

~~~asm
	LD A,B	; Symbol(A) = input-B, unknown; Symbol(B) = input-B
	ADD A,E	; Symbol(A) = input-B,E, unknown; Symbol(E) = input-E
	INC L	; Symbol(E) = input-L, unknown
	ADD A,L	; Symbol(A) = input-B,E,L, unknown; Unchanged: Symbol(L) = input-L, unknown
	RET		; Changed: A, L. Input: B, E, L.
~~~

~~~asm
	PUSH HL		; Symbol(STACK) = input-H,L
	LD H,$80	; Symbol(H) = known
	LD A,(HL)	; Symbol(A) = input-L, unknown; Unchanged: Symbol(L) = input-L
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
	INC HL		; Symbol(H,L) = input-H,L, unknown
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
