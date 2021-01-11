
    DEVICE NOSLOT64K
    SLDOPT COMMENT WPMEM, LOGPOINT, ASSERTION

	ORG 0xA000

	MACRO MEMGUARD
    defs 1 ; WPMEM
    ENDM


	defs 0x10		; WPMEM
	defs 0x10		; WPMEM, 5, w
	; WPMEM 0x7000, 10,  r
	; This is a watchpoint WPMEM 0x6000, 5,  w, A == 0
	; WPMEMx 0x9000, 5,  w, A == 0

	; Should now also work: no address and no used bytes: WPMEM

	ORG 0xA040
	MEMGUARD
	MEMGUARD

	ORG 0xA100

	nop		; ASSERTION
	nop		; ASSERTION B==1
	nop		; ASSERTIONx


	ORG 0xA200

	nop		; LOGPOINT [GROUP1] ${A}
	nop		; LOGPOINT [GROUP1] BC=${hex:BC}
	nop		; LOGPOINT [GROUP1]
	nop		; LOGPOINT MY LOG
	nop		; LOGPOINTx [GROUP2] ${A}

