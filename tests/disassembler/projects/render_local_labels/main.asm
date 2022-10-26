
	call SUB_0200
	call SUB_0XXX
	ret

	call SUB_063E
	call SUB_0675
	ret


	defs 0x0200 - $
SUB_0200:
	jr nz,.L1
	nop

.L1:
	nop

.L2
	ret


SUB_0XXX:
	nop
	jr SUB_0200.L2





	defs 0x063E - $
SUB_063E:
	ld de,42BDh
	ld hl,3085h

LBL_0644:
	xor a
	ld b,06h

LBL_0647:
	rld
	jr nz,LBL_0650

	push af
	ld a,00h
	jr LBL_0657

LBL_0650:
	or 80h
	push af
	and 0Fh
	add a,01h

LBL_0657:
	ld (de),a
	pop af
	push hl
	ld hl,0020h
	add hl,de
	ex de,hl
	pop hl
	bit 0,b
	jr z,LBL_0669

	rld
	inc hl
	jr LBL_0672

LBL_0669:
	ld c,a
	ld a,b
	cp 02h
	ld a,c
	jr nz,LBL_0672

	or 80h

LBL_0672:
	jr nz,LBL_0647

	ret


SUB_0675:
		 ld de,421Bh
		 jr LBL_0644
