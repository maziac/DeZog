;===========================================================================
; dezog.asm
;
; Subroutines to cooperate with the debugged program.
;===========================================================================


;===========================================================================
; Magic number addresses to recognize the debugger
;===========================================================================
dezog_magic_number_a:     equ 0x0000     ; Address 0x0000 (0xE000)
dezog_magic_number_b:     equ 0x0001
dezog_magic_number_c:     equ 0x0066      ; Address 0x0066 (0xE066)
dezog_magic_number_d:     equ 0x0067

; The corresponding values
DEZOG_MAGIC_NUMBER_VALUE_A:	equ 0x18
DEZOG_MAGIC_NUMBER_VALUE_B:	equ 0x64
DEZOG_MAGIC_NUMBER_VALUE_C:	equ 0xF5
DEZOG_MAGIC_NUMBER_VALUE_D:	equ 0xED



;===========================================================================
; Initializes the given bank with debugger code.
; 8 bytes at address 0 and 14 bytes at address 66h.
; If slot 0 does not contain the bank for DeZog or a
; already modified bank the function does nothing.
; Parameters:
;   A = bank to initialize.
; Changes:
;   AF
; ===========================================================================
dezog_init_slot0_bank:
	; Put the bank as parameter on the stack
	ld (.push+2),a

	; First check if slot0 already contains a bank with modifications for DeZog.
	ld a,(dezog_magic_number_a)	; ok (suppress warning)
	cp DEZOG_MAGIC_NUMBER_VALUE_A
	ret nz
	ld a,(dezog_magic_number_b)	; ok (suppress warning)
	cp DEZOG_MAGIC_NUMBER_VALUE_B
	ret nz
	ld a,(dezog_magic_number_c)	; ok (suppress warning)
	cp DEZOG_MAGIC_NUMBER_VALUE_C
	ret nz
	ld a,(dezog_magic_number_d)	; ok (suppress warning)
	cp DEZOG_MAGIC_NUMBER_VALUE_D
	ret nz

	; Push a 2=Execute "Function: init_slot0_bank"
.push:
	defb 0xED, 0x8A, 0, 2	; 0x0002
	; Push a 0x0000 on the stack. With this the call is distinguished from
	; a SW breakpoint.
	defb 0xED, 0x8A, 0, 0	; push 0x0000
	jp 0x0000

