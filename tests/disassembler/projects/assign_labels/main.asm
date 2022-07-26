
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
	; 1 branch, local label
	LD A,5
	CP B
	JR Z,L1

	NEG

L1:
	RET


	DEFS 0x0200-$
	; JR after RET
SSUB_0200:
	LD A,5
	CP B
	JR Z,SSUB_0209

	NEG
	RET

	NOP

SSUB_0209:
	NOP
	RET


	DEFS 0x0300-$
	; Sub in sub
SUBAA:
	LD A,5
SUBA:
	INC A
	RET

	CALL SUBA

	JR $


	DEFS 0x0400-$
	; Complex jumping
SSUB_0400:
	LD A,5
	JP Z,.LL2

	RET

.LL1:
	NOP
	RET

.LL2:
	JP C,.LL1

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
SSUB_0600:
	LD A,5

.LLOOP:
	INC A
	DJNZ .LLOOP

	RET


	DEFS 0x0700-$
	; Nested loops
SSUB_0700:
	LD A,5

.LLOOP1:
	INC HL

.LLOOP2:
	INC DE
	DJNZ .LLOOP2

	DEC A
	JR NZ,.LLOOP1

	RET


	DEFS 0x0800-$
	; Nested loops, same label
SSUB_0800:
	LD A,5

.LLOOP:
	INC HL
	INC DE
	DJNZ .LLOOP

	DEC A
	JR NZ,.LLOOP

	RET


	DEFS 0x1000-$
	; Recursive call
SUB_REC:
	CP 0
	RET Z

	DEC A
	CALL SUB_REC

	RET


	DEFS 0x1100-$
	; JP
SUB_1100:
	LD A,5
	JP .LL1
.LL1:
	RET

