

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
	; self modifying label in sub
	LD A,6
	LD (LBL_SELF_MOD+1),A
	CALL SUB_1009

	RET

SUB_1009:
	NOP
LBL_SELF_MOD:
	LD C,7
	RET


	DEFS 0x1100-$
	; self modifying label at sub
	LD A,6
	LD (SUB_1109+1),A
	CALL SUB_1109

	RET

SUB_1109:
	LD C,7
	RET


	DEFS 0x1200-$
	; self modifying label wo sub
	LD A,6
	LD (LBL2_SELF_MOD+1),A
	NOP
LBL2_SELF_MOD:
	LD C,7
	RET


	DEFS 0x1300-$
	; referencing data
	LD A,6
	LD HL,(LBL_DATA)
	JP LBL_CONT

LBL_DATA:
	DEFW 0x1234

LBL_CONT:
	LD DE,0xDEDE
	RET




	DEFS 0x4000-$
	; Depth
	CALL SUB4004

	RET

SUB4004:
	CALL SUB4008

	RET

SUB4008:
	CALL SUB400C

	RET

SUB400C:
	RET


	DEFS 0x4100-$
	; Depth 4, different call order
	CALL SUB4108

	RET

SUB4104:
	CALL SUB410C

	RET

SUB4108:
	CALL SUB4104

	RET

SUB410C:
	RET


	DEFS 0x4200-$
	; recursive
	CALL SUB4204

	RET

SUB4204:
	CALL SUB4204

	RET


	DEFS 0x4300-$
	; partly same branch
	CALL SUB4307

	CALL SUB4309

	RET

SUB4307:
	LD A,5
	
SUB4309:
	RET
