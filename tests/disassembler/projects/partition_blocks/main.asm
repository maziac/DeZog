
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


	DEFS 0x0400-$
	; Complex jumping
SUBD:
	LD A,5
	JP Z,.L1

	RET

.L2:
	NOP
	RET

.L1:
	JP C,.L2

	NEG
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
	; Loop
SUBE:
	LD A,5

.LOOP:
	INC A
	DJNZ .LOOP

	RET


	DEFS 0x0800-$
	; Recursive call
SUB_REC:
	CP 0
	RET Z

	DEC A
	CALL SUB_REC

	RET

