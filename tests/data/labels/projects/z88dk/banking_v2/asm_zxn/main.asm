SECTION CODE            ; No bank prefix, 16 bit ORG: default mapping
org $6000
SECTION code_user

SECTION BANK_0          ; 16k bank 0 at $8000 (not the default page 4)
org $8000
SECTION code_bank0

SECTION BANK_3_H        ; Upper 8k of 16k bank 3: page 7
org $E000
SECTION code_bank3h

SECTION PAGE_21         ; 8k page 21, continues in page 22
org $C100
SECTION code_page21

SECTION extra           ; No bank prefix, 24 bit ORG: page 20 (target zxn)
org $14C000
SECTION code_extra

SECTION code_user
PUBLIC _main
_main:
	nop
	ret

SECTION code_bank0
PUBLIC _banked
_banked:
	nop
	ret

SECTION code_bank3h
PUBLIC _bank3h_fn
_bank3h_fn:
	nop
	ret

SECTION code_page21
PUBLIC _page21_fn
_page21_fn:
	nop
	ret
	defs $2000
_page22_data:
	defb 1

SECTION code_extra
PUBLIC _far
_far:
	nop
	ret
