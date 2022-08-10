
	DEFS 0x0000
	; Simple node
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


	DEFS 0x0700-$
	; 2 calls, same sub
	LD A,5
	CALL SUB2

	CALL SUB2

	RET
SUB2:
	ADD A,2
	RET


	DEFS 0x1000-$
	;

