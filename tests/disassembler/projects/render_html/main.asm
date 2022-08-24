

	DEFS 0x0100-$
	; Start Label, label, references
SUB_0100:
	NOP
	CALL SUB_0105
	RET
SUB_0105:
	RET



	DEFS 0x0200-$
	; Note
SUB_0200:
	LD BC,$1234
	JP SUB_0200+1
