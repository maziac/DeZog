

	DEFS 0x0000
	; Simple node
	PUSH HL
	INC HL
	LD A,B
	INC A
	LD (HL),A
	POP HL
	RET


	DEFS 0x0008-$
RST_8:
	RET

	DEFS 0x0010-$
RST_10:
	RET

	DEFS 0x0018-$
RST_18:
	RET

	DEFS 0x0020-$
RST_20:
	NOP
	JR $

	DEFS 0x0028-$
RST_28:
	RET

	DEFS 0x0030-$
RST_30:
	RET

	DEFS 0x0038-$
RST_38:
	RET

	DEFS 0x0040-$
SUB_0040:
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
	; RST
	RST 0h
	RST 8h
	RST 10h
	RST 18h
	RST 20h
	RST 28h
	RST 30h
	RST 38h
	CALL SUB_0040
	RET


	DEFS 0x0300-$
	; RST not used
	JP 20h


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
	JR $




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



	DEFS 0x5000-$
	; code and data, no reference

DATA5000:
	DEFB 0x7F

	CALL SUB5007

	RET

DATA5005:	DEFW 0x1A2B

SUB5007:
	NOP
	RET


	DEFS 0x5100-$
	; code and data

DATA5100:
	DEFB 0x7F

	CALL SUB5107

	RET

DATA5105:	DEFW 0x1A2B

SUB5107:
	LD A,(DATA5100)
	LD HL,(DATA5105)
	LD DE,(DATA5120)
	RET

	DEFS 0x5120-$
DATA5120:	DEFB 1, 2, 3, 4, 5, 6, 7, 8


	DEFS 0x5200-$
	; self mod in other call
	LD A,(SUB5207.SELF_MOD+1)

	CALL SUB520A

	RET

SUB5207:
.SELF_MOD:
	LD B,6
	RET

SUB520A:
	RET


	DEFS 0x5300-$
	; Different depths, self mod in call
	LD (SUB530A.SELF_MOD+1),A
	LD (SUB530A.SELF_MOD2+1),A

	CALL SUB530F
	RET

SUB530A:
.SELF_MOD:
	LD B,6
.SELF_MOD2:
	LD C,9
	RET

SUB530F:
	CALL SUB530A

	RET
