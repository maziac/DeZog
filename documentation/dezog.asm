;===========================================================================
; coop.asm
;
; Subroutines to cooperate with the debugged program.
;===========================================================================
 

;===========================================================================
; Constants
;===========================================================================

; UART TX. Write=transmit data, Read=status
PORT_UART_TX:   equ 0x133b

; UART Status Bits:
UART_RX_FIFO_EMPTY: equ 0   ; 0=empty, 1=not empty


;===========================================================================
; Checks if a new message has arrived.
; If not then it returns without changing any register or flag.
; If yes the message is received and interpreted.
; Uses 2 words on the stack, one for calling the subroutine and one
; additional for pushing AF.
; To avoid switching banks, this is code that should be compiled together 
; with the debugged program.
; Changes:
;  No register. 4 bytes on the stack are used including the call to this 
;  function.
; Duration:
;  T-States=81 (with CALL), 2.32us@3.5MHz
;===========================================================================
dezog_check_for_message:			; T=17 for calling
	; Save AF
    push af						; T=11
	ld a,PORT_UART_TX>>8		; T= 7
	in a,(PORT_UART_TX&0xFF)	; T=11, Read status bits
    bit UART_RX_FIFO_EMPTY,a	; T= 8
    jr nz,_dezog_start_cmd_loop	; T= 7
	; Restore AF 
    pop af						; T=10
	ret			 				; T=10
	
_dezog_start_cmd_loop:
	; Restore AF
	pop af
	
	; Jump to DivMMC code. The code is automatically paged in by branching
	; to address 0x0000.
	; Push a 0x0000 on the stack. With this the call is distinguished from
	; a SW breakpoint.
	; (Above is already the return address.)
	push 0x0000
	jp 0x0000

