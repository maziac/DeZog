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
	ld (.dma_length),bc
	ld hl,.dma_code
	ld b,.dma_len
	ld c,ZXN_DMA_PORT
	otir
	ei
	ret

.fill_value:	db 0
.dma_code:		db DMA_DISABLE
				db 0b01111101
.dma_source:	dw .fill_value
.dma_length:	dw 0
				db 0b00100100
				db 0b00010000
				db 0b10101101
.dma_dest:		dw 0
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