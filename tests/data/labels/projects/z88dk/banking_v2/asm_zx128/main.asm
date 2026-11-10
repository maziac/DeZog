SECTION CODE            ; No bank prefix, 16 bit ORG: default mapping
org $8000
SECTION code_user

SECTION BANK_3          ; Bank prefix, 16 bit ORG
org $C000
SECTION code_bank3

SECTION extra           ; No bank prefix, 24 bit ORG: bank 4 (target zx)
org $04C000
SECTION code_extra

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

SECTION code_bank3
PUBLIC _bank3_fn
_bank3_fn:
	nop
	ret

SECTION code_extra
PUBLIC _far
_far:
	nop
	ret
