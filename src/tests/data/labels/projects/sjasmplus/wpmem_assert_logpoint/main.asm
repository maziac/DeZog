
	ORG 0xA000

	defs 0x10		; WPMEM
	defs 0x10		; WPMEM, 5, w
	; WPMEM 0x7000, 10,  r
	; This is a watchpoint WPMEM 0x6000, 5,  w, A == 0
	; WPMEMx 0x9000, 5,  w, A == 0

	nop		; ASSERT
	nop		; ASSERT B==1
	nop		; ASSERTx

	nop		; LOGPOINT [GROUP1] ${A}
	nop		; LOGPOINTx [GROUP2] ${A}

