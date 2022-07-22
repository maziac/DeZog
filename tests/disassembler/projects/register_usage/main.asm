
	DEFS 0x0000
	; Input registers: B
	; Used registers: HL, A, B
	; Assigned registers: HL, A
	; Unchanged registers: HL, B
	PUSH HL
	INC HL
	LD A,B
	INC A
	LD (HL),A
	POP HL
	RET

	DEFS 0x0100-$
	PUSH HL
	INC HL
	LD A,B
	INC A
	LD (HL),A
	POP HL
	RET
