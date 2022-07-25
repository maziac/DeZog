
	DEFS 0x0000
	; Simple block
	PUSH HL
	INC HL
	LD A,B
	INC A
	LD (HL),A
	POP HL
	RET


	DEFS 0x0100-$
	; 1 branch
	LD A,5
	CP B
	JR Z,L1

	NEG

L1:
	RET


	DEFS 0x0200-$
	; JR after RET
	LD A,5
	CP B
	JR Z,L2

	NEG
	RET

	NOP

L2:
	NOP
	RET


	DEFS 0x0300-$
	; Sub in sub
	LD A,5
SUBA:
	INC A
	RET

	CALL SUBA
	RET




	DEFS 0x0500-$
	; 2 subs, sharing block
SUBB:
	LD A,5

.L3:
	NEG
	RET

	DEFS 0x0520-$
SUBC:
	LD A,6
	JP SUBB.L3


	DEFS 0x0600-$
	; Simple call
	LD A,5
	CALL SUB1

	RET
SUB1:
	ADD A,2
	RET




	DEFS 0x0800-$
	; Recuvrsive call
SUB_REC:
	CP 0
	RET Z

	DEC A
	CALL SUB_REC

	RET


	DEFS 0x0900-$
	; Subroutine inside subroutine
	LD A,5

SUB3:
	INC A
	RET

	DEFS 0x0920-$
	CALL SUB3

	RET
