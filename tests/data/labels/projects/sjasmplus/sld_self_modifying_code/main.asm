; File to tests address file association when executing self modifyfing code.
; In SLD files there is only the address of the start of an instruction.
; If the instruction is modified by the program also addresses "inside"
; the original instruction may occur.
; If such an new instruction is executed DeZog would create adisassembly file.
; The behavior is a little inconsistent as the first address still
; navigates to the original file although the instruction is "wrong".
;
; to at least get a consisten behavior deZog tries to estimate the size of an
; instruction and assiciates all addresses to this file.

    DEVICE ZXSPECTRUMNEXT
    SLDOPT COMMENT WPMEM, LOGPOINT, ASSERTION


	ORG 0x8000
	jp 0x9000	; 3 bytes will be associated
	nop

	ORG 0x8100
	jp 0x9000	; Only one byte is associated as the following address is more than 4 bytes away

	ORG 0x8200
	nop		; 1 byte instruction
	ld a,10	; 2 byte instruction
	jp 0x9000	; 3 bytes will be associated
	ld (ix+9),5	; 4 byte instruction
	nop

	ORG 0x8300
	ld a,9	; 2 byte instruction followed by data is not associated
	defb 0x0E


