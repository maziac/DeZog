;===========================================================================
; dezog.asm
;
; Subroutines to cooperate with the debugged program.
;===========================================================================


;===========================================================================
; Customizable area
;===========================================================================

; Set this to one to visualize the polling (flashing border).
DEZOG_VISUALIZE_POLL:	equ 1
;DEZOG_VISUALIZE_POLL:	equ 0


;===========================================================================
; Constants - Do not change
;===========================================================================

; UART TX. Write=transmit data, Read=status
DEZOG_PORT_UART_TX:   equ 0x133B

; UART Status Bits:
DEZOG_UART_RX_FIFO_EMPTY: equ 0   ; 0=empty, 1=not empty

; The port for the border
DEZOG_BORDER:	equ 0xFE

;===========================================================================
; Magic number addresses to recognize the debugger
;===========================================================================
magic_number_a:     equ 0x0000     ; Address 0x0000 (0xE000)
magic_number_b:     equ 0x0001
magic_number_c:     equ 0x0066      ; Address 0x0066 (0xE066)
magic_number_d:     equ 0x0067

; The corresponding values
MAGIC_NUMBER_VALUE_A:	equ 0x18
MAGIC_NUMBER_VALUE_B:	equ 0x64
MAGIC_NUMBER_VALUE_C:	equ 0xF5
MAGIC_NUMBER_VALUE_D:	equ 0xED


;===========================================================================
; Checks if a new message has arrived.
; If not then it returns without changing any register or flag.
; If yes the message is received and interpreted.
; Uses 2 words on the stack, one for calling the subroutine and one
; additional for pushing AF.
; To avoid switching banks, this is code that should be compiled together
; with the debugged program.
; Changes:
;  No register. 8 bytes on the stack are used including the call to this
;  function.
; Duration:
;  T-States=81 (with CALL), 2.32us@3.5MHz
; + 27 T-States if DEZOG_VISUALIZE_POLL==1
;===========================================================================
dezog_poll:			; T=17 for calling
	; Save AF
    push af						; T=11

 IF DEZOG_VISUALIZE_POLL == 1
	ld a,r						; T= 9, Get an almost random value
	and 1						; T= 7
	out (DEZOG_BORDER),a		; T=11
 ENDIF

	ld a,DEZOG_PORT_UART_TX>>8		; T= 7
	in a,(DEZOG_PORT_UART_TX&0xFF)	; T=11, Read status bits
    bit DEZOG_UART_RX_FIFO_EMPTY,a	; T= 8
    jr nz,_dezog_start_cmd_loop	; T= 7
	; Restore AF
    pop af						; T=10
	ret			 				; T=10

_dezog_start_cmd_loop:
	; Restore AF
	pop af

	; Jump to DivMMC code. The code is automatically paged in by branching
	; to address 0x0000.

	; Push a 1=Execute "Function: receive command"
	defb 0xED, 0x8A, 0, 1	; push 0x0001

	; Push a 0x0000 on the stack. With this the call is distinguished from
	; a SW breakpoint.
	; (Above is already the return address.)
	defb 0xED, 0x8A, 0, 0	; push 0x0000
	jp 0x0000


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
	ld a,(magic_number_a)	; ok (suppress warning)
	cp MAGIC_NUMBER_VALUE_A
	ret nz
	ld a,(magic_number_b)	; ok (suppress warning)
	cp MAGIC_NUMBER_VALUE_B
	ret nz
	ld a,(magic_number_c)	; ok (suppress warning)
	cp MAGIC_NUMBER_VALUE_C
	ret nz
	ld a,(magic_number_d)	; ok (suppress warning)
	cp MAGIC_NUMBER_VALUE_D
	ret nz

	; Push a 2=Execute "Function: init_slot0_bank"
.push:
	defb 0xED, 0x8A, 0, 2	; 0x0002
	; Push a 0x0000 on the stack. With this the call is distinguished from
	; a SW breakpoint.
	defb 0xED, 0x8A, 0, 0	; push 0x0000
	jp 0x0000

