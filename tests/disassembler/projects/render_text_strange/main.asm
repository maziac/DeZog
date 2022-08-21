	; Memory beginning at 0xC000 is UNUSED, i.e. not ASSIGNED.

	DEFS 0x0000

	DEFS 0x0008-$
	; RST 8
	RET

	DEFS 0x0100-$
	; jump into opcode
	NOP
LBL0101:
	LD A,5
	NOP
	NOP
	JP LBL0101+1


	DEFS 0x0200-$
	; depend on order, RST first
	CALL SUB_0207
	CALL SUB_020A
	RET

SUB_0207:
	RST 8
	DEFB  01, 16

SUB_020A:
	LD HL,$8000
	NOP
	NOP
	NOP
	RET


	DEFS 0x0300-$
	; depend on order, call after RST first
	CALL SUB_030A
	CALL SUB_0307
	RET

SUB_0307:
	RST 8
	DEFB  01, 16

SUB_030A:
	LD HL,$8000
	NOP
	NOP
	NOP
	RET


	DEFS 0x0400-$
	; depend on order, loop
	CALL SUB_0407
	RET

SUB_0407:
	RST 8
	DEFB  01, 16

SUB_040A:
	LD HL,$8000
	NOP
	NOP
	JR Z,SUB_040A
	RET


	DEFS 0x0500-$
	; jp to unassigned
	JP 0xC000

