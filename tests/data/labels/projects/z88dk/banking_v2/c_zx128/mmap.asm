; Memory map for the banked code. Linked before the other modules, so these
; sections follow the memory map of the CRT in link order. (The classic CRT
; can only replace its whole memory map, it has no CRT_APPEND_MMAP.)
; A section with the bank in its name (BANK_n plus a suffix) and an ORG,
; followed by the sections the code is put in (--codeseg, --constseg).
; These have no bank in their name: the bank is the block they are linked
; into (z88dk/z88dk#3197), e.g.
;   __banked_code_head = $6C000 ; const, public, def, , BANK_6_CODE,

SECTION BANK_6_CODE     ; 16k bank 6
	org 0x06C000
SECTION banked_code
SECTION banked_const
