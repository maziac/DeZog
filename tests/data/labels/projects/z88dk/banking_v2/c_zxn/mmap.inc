; Memory map appended to the one of the CRT (CRT_APPEND_MMAP, see zpragma.inc).
; A section with the page in its name (PAGE_n plus a suffix) and an ORG,
; followed by the sections the code is put in (--codeseg, --constseg).
; These have no page in their name: the page is the block they are linked
; into (z88dk/z88dk#3197), e.g.
;   __banked_code_head = $14C000 ; const, public, def, , PAGE_20_CODE,

SECTION PAGE_20_CODE    ; 8k page 20
	org 0x14C000
SECTION banked_code
SECTION banked_const
