
    DEVICE NOSLOT64K
    SLDOPT COMMENT WPMEM, LOGPOINT, ASSERTION


label_equ1:		equ 100


	MACRO m1
	ld c,9
.mlocal:
	dec a
	ENDM


	ORG 0x8000

label1:
	nop

label2:	ld a,5

.locala:	ld b,8

.localb:
	nop		; ASSERTION

label3:	m1
 m1
label4:
	m1

label4_1:
	m1	; LOGPOINT

	IF 0
label5:	nop
	ENDIF

label6	nop
.local
	nop

	defs 0x8200-$
	ORG 0x8200
data:
	defb 1, 2, 3, 4		; WPMEM


	defs 0x9000-$
	ORG 0x9000

	include "filea.asm"

; Testing hovering global labels
@global_label:
	nop
.local:
	jr @global_label
	jr global_label
	jr @global_label.local
	jr global_label.local
