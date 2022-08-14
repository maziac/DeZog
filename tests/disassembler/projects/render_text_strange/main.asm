

	DEFS 0x0000
	;jump into opcode
	NOP
LBL0001:
	LD A,5
	NOP
	NOP
	JP LBL0001+1

