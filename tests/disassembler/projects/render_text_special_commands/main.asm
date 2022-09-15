
	DEFS 0x0008-$
RST_08: ; Consumes one bye from stack
	EX (SP),HL
	INC HL
	EX (SP),HL
	RET

	DEFS 0x0010-$
RST_10: ; Consumes two bytes from stack
	EX (SP),HL
	INC HL
	INC HL
	EX (SP),HL
	RET



	DEFS 0x0100-$
	RST 8
	DEFB 2
	NOP
	RET


	DEFS 0x0200-$
	RST 16
	DEFW 0xABCD
	NOP
	RET

