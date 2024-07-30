;-----------------------------------------------------------
; zxndma.asm
;
; Routines to program the ZX Next DMA controller.
;-----------------------------------------------------------


	MODULE zxndma

;------------------------------------------------------------------------------
; Fills a memory area with a constant value.
; DE = dest, A = fill value, BC = lenth
;------------------------------------------------------------------------------
fill:
	di
	ld (.fill_value),a
	ld (.dma_dest),de
	ld bc,3
	ld (.dma_length),bc
	ld hl,.dma_code
	ld b,.dma_len
	ld c,ZXN_DMA_PORT
	otir
	nop
	nop
	nop  ; here both
	nop
	nop
	nop
	nop
	nop
	nop
	nop
	nop
	nop
	nop
	ei
	nop
	nop
	nop
	nop
	nop
	nop
	nop
	nop
	nop
	nop
	nop
	nop
	nop
	nop
	nop
	nop

	ret

.fill_value:	db 0
.dma_code:		db DMA_DISABLE
				db 0b01111101
.dma_source:	dw .fill_value
.dma_length:	dw 0
				db 0b01100100	; WR0:
				db 0b00000010	; Cycle length (A) = 2
				db 0b00010000
				;db 0b10101101	; WR4: Continuous mode
				db 0b11001101	; WR4: Burst mode
.dma_dest:		dw 0
				db 0b01010000 ; WR2
				db 0b00100010 ; Cycle Length (B) = 2
				db 3		  ; Prescalar = 3, every 12 T
				;db 0b10100010 ; WR5: Auto restart
				db DMA_LOAD
				db DMA_ENABLE
.dma_len:		equ $-.dma_code


;------------------------------------------------------------------------------
; Reads all registers (RR1 - RR6) of the DMA controller
; and writes them to the read_registers.registers structure.
;------------------------------------------------------------------------------
read_registers:
	di
	; DMA command to read the registers
	ld hl,.dma_code
	ld b,.dma_end-.dma_code
	ld c,ZXN_DMA_PORT
	otir
	; Read the registers
	ld hl,.registers
	ld b,.registers_end-.registers
	inir
	ei
	ret

.dma_code:		db DMA_DISABLE
				db 0b10111011	; Read mask follows
				db 0b01111111	; Read mask
.dma_end

.registers:
.statusByteRR0:		db 0
.blockCounterRR12:	dw 0
.portAaddessRR34:	dw 0
.portBaddessRR56:	dw 0
.registers_end

	ENDMODULE