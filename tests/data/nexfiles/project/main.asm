; Program to test the nex file loading.
; The created nex file is used in unit testing.
; But the program can also be loaded in an emulator and tested.
; Mapping slot to 16k banks: ROM, 5, 2, entry bank
; Mapping to 8k banks: 254, 255, 10, 11, 4, 5, 2*entryBank, 2*entryBank+1

    SLDOPT COMMENT WPMEM, LOGPOINT, ASSERTION

	DEVICE ZXSPECTRUMNEXT


    ; Default banks
    ORG $4000
    defb 1, 1, 0
    ORG $6000
    defb 2, 2, 0

    ORG $8000
    defb 3, 3, 0
    ORG $A000
    defb 4, 4, 0

    ; Set banks 80-82
    MMU $4000, 80
    ORG $4000
    defb 80, 80, 0    ; $50
    MMU $6000, 81
    ORG $6000
    defb 81, 81, 0    ; $51

    MMU $8000, 82
    ORG $8000
    defb 82, 82, 0   ; $52
    MMU $A000, 83
    ORG $A000
    defb 83, 83, 0   ; $53

    MMU $C000, 84
    ORG $C000
    defb 84, 84, 0   ; $54
    MMU $E000, 85
    ORG $E000
    defb 85, 85, 0   ; $55

    MMU $6000, 11
    ORG $7A12
start:
    ; Default banks
    ld a,($4000)
    nop ; ASSERTION a == 1
    ld a,($6000)
    nop ; ASSERTION a == 2
    ld a,($8000)
    nop ; ASSERTION a == 3
    ld a,($A000)
    nop ; ASSERTION a == 4

    ; Custom banks
    ld a,($C000)
    nop ; ASSERTION a == 84
    ld a,($E000)
    nop ; ASSERTION a == 85

    nextreg $56, 80
    nextreg $57, 80 + 1
    ld a,($C000)
    nop ; ASSERTION a == 80
    ld a,($E000)
    nop ; ASSERTION a == 81

    nextreg $56, 82
    nextreg $57, 82 + 1
    ld a,($C000)
    nop ; ASSERTION a == 82
    ld a,($E000)
    nop ; ASSERTION a == 83

    nextreg $56, 84
    nextreg $57, 84 + 1
    jr start


    ; Write everything into NEX file
    SAVENEX OPEN "main.nex", start, $6EDA, 42 /* Bank */
    SAVENEX CORE 3, 1, 5
    SAVENEX CFG 4, 1, 0, 1      ; green border, file handle in BC, reset NextRegs, 2MB required
    SAVENEX BAR 1, $E0, 50, 25  ; do load bar, red colour, start/load delays 50/25 frames
    SAVENEX BANK 5, 2, 40, 41, 42    ; store the 16ki banks 5 (contains the code at 0x7E12), 100, 101
    SAVENEX CLOSE               ; (banks 100 and 101 are added just as example)
