; Memory map (as in a z88dk mmap.inc): a section with the bank in its name
; (BANK_n plus a suffix) and an ORG, followed by the sections the code is
; put in. These have no bank in their name: the bank is the block they are
; linked into (z88dk/z88dk#3197), e.g.
;   __fn_code_head = $C000 ; const, public, def, , BANK_3_CODE,
SECTION CODE            ; No bank, 16 bit ORG: default mapping
org $8000
SECTION code_user

SECTION BANK_3_CODE     ; 16 bit ORG: bank only from the block name
org $C000
SECTION fn_code

SECTION BANK_4_CODE     ; 24 bit ORG: bank 4 (16k, target zx)
org $04C000
SECTION far_code


SECTION code_user
PUBLIC _main
_main:
	; Page each bank in at $C000 (port $7FFD, ROM 1) and call its function
	ld bc,$7FFD
	ld a,$10+3
	out (c),a
	call _bank3_fn
	ld a,$10+4
	out (c),a
	call _far
	ld a,$10+0
	out (c),a
	ret

SECTION fn_code
PUBLIC _bank3_fn
_bank3_fn:
	nop
	ret

SECTION far_code
PUBLIC _far
_far:
	nop
	ret

; Start address and stack of the image, read by appmake from the map file
PUBLIC __crt_org_code, __register_sp
defc __crt_org_code = $8000
defc __register_sp = $7FF0
