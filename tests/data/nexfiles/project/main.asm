; Program to test the nex file loading.
; The created nex file is used in unit testing.
; But the program can also be loaded in an emulator and tested.
; Mapping slot to 16k banks: ROM, 5, 2, entry bank
; Mapping to 8k banks: 254, 255, 10, 11, 4, 5, 2*entryBank, 2*entryBank+1

    SLDOPT COMMENT WPMEM, LOGPOINT, ASSERTION

	DEVICE ZXSPECTRUMNEXT

    MMU $4000, 100
    ORG $4000
    defb 100, 100, 0    ; $64
    MMU $6000, 101
    ORG $6000
    defb 101, 101, 0    ; $65

    MMU $8000, 102
    ORG $8000
    defb 102, 102, 0   ; $66
    MMU $A000, 103
    ORG $A000
    defb 103, 103, 0   ; $67

    MMU $C000, 104
    ORG $C000
    defb 104, 104, 0   ; $68
    MMU $E000, 105
    ORG $E000
    defb 105, 105, 0   ; $69

    MMU $6000, 11
    ORG $7A12
start:
    ld a,($C000)
    nop ; ASSERTION a == 104
    ld a,($E000)
    nop ; ASSERTION a == 105

    nextreg $56, 100
    nextreg $57, 100 + 1
    ld a,($C000)
    nop ; ASSERTION a == 100
    ld a,($E000)
    nop ; ASSERTION a == 101

    nextreg $56, 102
    nextreg $57, 102 + 1
    ld a,($C000)
    nop ; ASSERTION a == 102
    ld a,($E000)
    nop ; ASSERTION a == 103

    nextreg $56, 104
    nextreg $57, 104 + 1
    jr start


    ; Write everything into NEX file
    SAVENEX OPEN "main.nex", start, $6EDA, 52 /* Bank */
    SAVENEX CORE 3, 1, 5
    SAVENEX CFG 4, 1, 0, 1      ; green border, file handle in BC, reset NextRegs, 2MB required
    SAVENEX BAR 1, $E0, 50, 25  ; do load bar, red colour, start/load delays 50/25 frames
    SAVENEX BANK 5, 2, 50, 51, 52    ; store the 16ki banks 5 (contains the code at 0x7E12), 100, 101
    SAVENEX CLOSE               ; (banks 100 and 101 are added just as example)
