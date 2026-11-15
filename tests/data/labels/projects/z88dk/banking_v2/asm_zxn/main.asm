; Memory map (as in a z88dk mmap.inc): a section with the bank or page in
; its name (BANK_n, BANK_n_L/H or PAGE_n plus a suffix) and an ORG, followed
; by the sections the code is put in. These have no bank in their name: the
; bank is the block they are linked into (z88dk/z88dk#3197), e.g.
;   __banked_code_head = $8000 ; const, public, def, , BANK_0_CODE,
SECTION CODE            ; No bank, 16 bit ORG: default mapping
org $6000
SECTION code_user

SECTION BANK_0_CODE     ; 16k bank 0 at $8000 (not the default page 4)
org $8000
SECTION banked_code

SECTION BANK_3_H_CODE   ; Upper 8k of 16k bank 3: page 7
org $E000
SECTION upper_code

SECTION PAGE_21_CODE    ; 8k page 21, continues in page 22
org $C100
SECTION paged_code

SECTION PAGE_20_CODE    ; 24 bit ORG: page 20 (8k, target zxn)
org $14C000
SECTION far_code

SECTION code_user
PUBLIC _main
_main:
	; Page each section in (MMU4 = $54 ... MMU7 = $57) and call its function
	nextreg $54,0
	call _banked
	nextreg $54,4
	nextreg $57,7
	call _bank3h_fn
	nextreg $56,21
	nextreg $57,22
	call _page21_fn
	ld a,(_page22_data)
	nextreg $56,20
	call _far
	nextreg $56,0
	nextreg $57,1
	ret

SECTION banked_code
PUBLIC _banked
_banked:
	nop
	ret

SECTION upper_code
PUBLIC _bank3h_fn
_bank3h_fn:
	nop
	ret

SECTION paged_code
PUBLIC _page21_fn
_page21_fn:
	nop
	ret
	defs $2000
_page22_data:
	defb 1

SECTION far_code
PUBLIC _far
_far:
	nop
	ret

; Start address and stack of the image, read by appmake from the map file
PUBLIC __crt_org_code, __register_sp
defc __crt_org_code = $6000
defc __register_sp = $5FF0
