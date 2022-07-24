
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
