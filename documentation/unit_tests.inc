;--------------------------------------------------------
; unit_tests.inc
;
; Contains all macros used for unit testing.
;--------------------------------------------------------

  IFDEF _SJASMPLUS
    ; -----------------------------------------------------------
    ; Code for sjasmplus

    MACRO UNITTEST_INITIALIZE

    ; Called to call each unit test.
@UNITTEST_TEST_WRAPPER:
        di
        ld sp,UNITTEST_STACK
@UNITTEST_CALL_ADDR: 
        call 0x0000 ; Will be changed by the z80 unit tests.
        nop
        
@UNITTEST_TEST_READY_SUCCESS:
        jr UNITTEST_TEST_READY_SUCCESS	; A breakpoint will be set here.

@UNITTEST_TEST_READY_FAILURE:
        nop 
@UNITTEST_TEST_READY_FAILURE_BREAKPOINT:
        ret 	; A breakpoint will be set here. The next step will return to the failed test case
@UNITTEST_MIN_STACK_GUARD:
        defw 0	; A write watchpoint will be set here to guard the stack
        defs 2*50	; Stack depth of 50 should be enough
@UNITTEST_STACK:

@UNITTEST_MAX_STACK_GUARD:
        defw 0	; A write watchpoint will be set here to guard the stack

@UNITTEST_SAVE_REG:
        defw 0  ; Used to save register values.
        

    ; The unit test initialization. Provided by the user.
@UNITTEST_START:
        ; Disable interrupts
        di 
        ; Flow through.
        ; Directly after the UNITTEST_INITIALIZE macro the user
        ; should put his test initialization code.
        ; Note: the stack pointer does not need to be set up.

    ENDM


    ; Tests a memory address for a specific byte value.
    MACRO TEST_MEMORY_BYTE addr?, value?
        ld (UNITTEST_SAVE_REG),a
        ld a,(addr?)
        cp value?
        call nz,UNITTEST_TEST_READY_FAILURE
        ld a,(UNITTEST_SAVE_REG)
    ENDM

    ; Tests a memory address for a specific word value.
    ; If the test fails the '(addr)' can be found in DE.
    MACRO TEST_MEMORY_WORD addr?, value?
        push de
        push hl
        ld hl,value?
        ld de,(addr?)
        or a 
        sbc hl,de 
        pop hl 
        call nz,UNITTEST_TEST_READY_FAILURE ; de = (addr)
        pop de 
    ENDM

    ; Tests A for a specific value.
    MACRO TEST_A value?
        cp value?
        call nz,UNITTEST_TEST_READY_FAILURE
        nop
    ENDM

    ; Tests that A is not equal to a specific value.
    MACRO TEST_A_UNEQUAL value?
        cp value?
        call z,UNITTEST_TEST_READY_FAILURE
        nop
    ENDM

    ; Tests a single register for a specific value.
    ; E.g. TEST_REG b, 6 ; Tests if register b == 6
    MACRO TEST_REG reg?, value?
        ld (UNITTEST_SAVE_REG),a
        ld a,reg?
        cp value?
        call nz,UNITTEST_TEST_READY_FAILURE
        ld a,(UNITTEST_SAVE_REG)
    ENDM

    ; Tests that a single register is not a specific value.
    ; E.g. TEST_REG_UNEQUAL b, 6 ; Tests if register b != 6
    MACRO TEST_REG_UNEQUAL reg?, value?
        ld (UNITTEST_SAVE_REG),a
        ld a,reg?
        cp value?
        call z,UNITTEST_TEST_READY_FAILURE
        ld a,(UNITTEST_SAVE_REG)
    ENDM

    ; Tests a double register for a specific value.
    ; E.g. TEST_REG hl, label1 ; Tests if register hl == label1
    MACRO TEST_DREG dreg?, value?
        push de
        push hl
        push dreg?
        pop hl
        ld de,value?
        or a 
        sbc hl,de
        pop hl 
        pop de 
        call nz,UNITTEST_TEST_READY_FAILURE ; de = (addr)
        nop        
    ENDM


     ; Tests a double register for a specific value.
    ; E.g. TEST_REG hl, label1 ; Tests if register hl == label1
    MACRO TEST_DREG_UNEQUAL dreg?, value?
        push de
        push hl
        push dreg?
        pop hl
        ld de,value?
        or a 
        sbc hl,de
        pop hl 
        pop de 
        call z,UNITTEST_TEST_READY_FAILURE ; de = (addr)
        nop        
    ENDM


    ; Test two registers for equality.
    ; Testcase fails if registers are not equal.
    MACRO TEST_DREGS dreg1?, dreg2?
        push de
        push hl
        push dreg1?
        push dreg2?
        pop de
        pop hl
        or a 
        sbc hl,de 
        pop hl 
        pop de 
        call nz,UNITTEST_TEST_READY_FAILURE 
        nop
    ENDM


    ; Test two registers for unequality.
    ; Testcase fails if registers are equal.
    MACRO TEST_DREGS_UNEQUAL dreg1?, dreg2?
        push de
        push hl
        push dreg1?
        push dreg2?
        pop de
        pop hl
        or a 
        sbc hl,de 
        pop hl 
        pop de 
        call z,UNITTEST_TEST_READY_FAILURE 
        nop
    ENDM


    ; Tests a memory address for a specific string.
    ; addr = the tested string
    ; string = the compared string
    ; term0 = If 0 it is also tested that the string (addr) is null termiated
    MACRO TEST_STRING addr?, string?, term0?
        push af
        push hl
        push de 
        ld de,.comp_string
        ld hl,addr? 
.loop:
        ld a,(de)
        ; Check for null termination
        or a 
        jr z,.null_found
        cp (hl)
        inc de 
        inc hl
        jr z,.loop
    
.not_equal:
        ; Strings are not equal
        pop de
        pop hl
        pop af
        call UNITTEST_TEST_READY_FAILURE 
        jr .end

.comp_string:
        defb string?, 0

.null_found:
        ; We are at the end of the compare string.
        ; Check if null termination should be compared with the tested string.
      IF term0? == 0
        cp (hl) 
        jr nz,.not_equal
      ENDIF

        pop de
        pop hl
        pop af
.end:
    ENDM


    ; Initializes the registers with default values.
    ; Use before the tested function is called.
    ; After the call the TEST_UNCHANGED_XX tests can be used
    ; to check if the register was changed.
    MACRO DEFAULT_REGS
        ld a,0xAA
        ld bc,0xBBCC
        ld de,0xDDEE
        ld hl,0x8899
    ENDM

    MACRO TEST_UNCHANGED_BC
        push hl 
        ld hl,0xBBCC
        or a
        sbc hl,bc
        pop hl
        call nz,UNITTEST_TEST_READY_FAILURE 
        nop
    ENDM

    MACRO TEST_UNCHANGED_DE
        push hl 
        ld hl,0xDDEE
        or a
        sbc hl,de
        pop hl
        call nz,UNITTEST_TEST_READY_FAILURE 
        nop
    ENDM

    MACRO TEST_UNCHANGED_HL
        push de 
        ld de,0x8899
        or a
        sbc hl,de
        add hl,de   ; restore hl without affecting the flags
        pop de
        call nz,UNITTEST_TEST_READY_FAILURE 
        nop
    ENDM

    MACRO TEST_UNCHANGED_BC_DE
        TEST_UNCHANGED_BC
        TEST_UNCHANGED_DE
    ENDM

    MACRO TEST_UNCHANGED_BC_DE_HL
        TEST_UNCHANGED_BC_DE
        TEST_UNCHANGED_HL
    ENDM

    MACRO TEST_UNCHANGED_A
        TEST_A 0xAA
    ENDM

    MACRO TEST_UNCHANGED_B
        TEST_REG b, 0xBB
    ENDM

    MACRO TEST_UNCHANGED_C
        TEST_REG c, 0xCC
    ENDM

    MACRO TEST_UNCHANGED_D
        TEST_REG d, 0xDD
    ENDM

    MACRO TEST_UNCHANGED_E
        TEST_REG e, 0xEE
    ENDM

    MACRO TEST_UNCHANGED_H
        TEST_REG h, 0x88
    ENDM

    MACRO TEST_UNCHANGED_L
        TEST_REG l, 0x99
    ENDM

    
    ; Macro to test flags for Z.
    ; Testcase fails for NZ.
    MACRO TEST_FLAG_Z
        call nz,UNITTEST_TEST_READY_FAILURE 
        nop
    ENDM


    ; Macro to test flags for NZ.
    ; Testcase fails for Z.
    MACRO TEST_FLAG_NZ
        call z,UNITTEST_TEST_READY_FAILURE 
        nop
    ENDM


    ; This macro uses all registers, also the shadow registers.
    MACRO USE_ALL_REGS
        ld a,0xCD 
        ld bc,0xBBCC
        ld de,0xDDEE
        ld hl,0xFF11
        ld ix,0x7788
        ld iy,0x99AA
        exx
        ld a,0xDC
        ld bc,0x1122
        ld de,0x3344
        ld hl,0x5566
        exx
    ENDM

    ; sjasmplus end
    ; -----------------------------------------------------------


  ELSE
    ; -----------------------------------------------------------
    ; Code for other assemblers


    ; Tests a memory address for a specific byte value.
TEST_MEMORY_BYTE:    MACRO addr, value
        ld (UNITTEST_SAVE_REG),a
        ld a,(addr)
        cp value
        call nz,UNITTEST_TEST_READY_FAILURE
        ld a,(UNITTEST_SAVE_REG)
    ENDM

    ; Tests a memory address for a specific word value.
    ; If the test fails the '(addr)' can be found in DE.
TEST_MEMORY_WORD:    MACRO addr, value
        push de
        push hl
        ld hl,value
        ld de,(addr)
        or a 
        sbc hl,de 
        pop hl 
        call nz,UNITTEST_TEST_READY_FAILURE ; de = (addr)
        pop de 
    ENDM

    ; Tests A for a specific value.
TEST_A:    MACRO value
        cp value
        call nz,UNITTEST_TEST_READY_FAILURE
        nop
    ENDM

    ; Tests that A is not equal to a specific value.
TEST_A_UNEQUAL:    MACRO value
        cp value
        call z,UNITTEST_TEST_READY_FAILURE
        nop
    ENDM

    ; Tests a single register for a specific value.
    ; E.g. TEST_REG b, 6 ; Tests if register b == 6
TEST_REG:    MACRO reg, value
        ld (UNITTEST_SAVE_REG),a
        ld a,reg
        cp value
        call nz,UNITTEST_TEST_READY_FAILURE
        ld a,(UNITTEST_SAVE_REG)
    ENDM

    ; Tests that a single register is not a specific value.
    ; E.g. TEST_REG_UNEQUAL b, 6 ; Tests if register b != 6
TEST_REG_UNEQUAL:    MACRO reg, value
        ld (UNITTEST_SAVE_REG),a
        ld a,reg
        cp value
        call z,UNITTEST_TEST_READY_FAILURE
        ld a,(UNITTEST_SAVE_REG)
    ENDM

    ; Tests a double register for a specific value.
    ; E.g. TEST_DREG hl, label1 ; Tests if register hl == label1
TEST_DREG:    MACRO dreg, value
        push de
        push hl
        push dreg
        pop hl
        ld de,value
        or a 
        sbc hl,de
        pop hl 
        pop de 
        call nz,UNITTEST_TEST_READY_FAILURE 
        nop        
    ENDM

    ; Tests a double register is not a specific value.
    ; E.g. TEST_DREG_UNEQUAL hl, label1 ; Tests if register hl != label1
TEST_DREG_UNEQUAL:    MACRO dreg, value
        push de
        push hl
        push dreg
        pop hl
        ld de,value
        or a 
        sbc hl,de
        pop hl 
        pop de 
        call z,UNITTEST_TEST_READY_FAILURE 
        nop        
    ENDM


    ; Test two registers for equality.
    ; Testcase fails if registers are not equal.
TEST_DREGS:    MACRO dreg1, dreg2
        push de
        push hl
        push dreg1
        push dreg2
        pop de
        pop hl
        or a 
        sbc hl,de 
        pop de 
        pop hl 
        call nz,UNITTEST_TEST_READY_FAILURE 
        nop
    ENDM


    ; Test two registers for unequality.
    ; Testcase fails if registers are equal.
TEST_DREGS_UNEQUAL:    MACRO dreg1, dreg2
        push de
        push hl
        push dreg1
        push dreg2
        pop de
        pop hl
        or a 
        sbc hl,de 
        pop de 
        pop hl 
        call z,UNITTEST_TEST_READY_FAILURE 
        nop
    ENDM


    ; Tests a memory address for a specific string.
    ; addr = the tested string
    ; string = the compared string
    ; term0 = If 0 it is also tested that the string (addr) is null terminated
TEST_STRING:    MACRO addr, string, term0
        push af
        push hl
        push de 
        ld de,.comp_string
        ld hl,addr?
.loop:
        ld a,(de)
        ; Check for null termination
        or a 
        jr z,.null_found
        cp (hl)
        inc de 
        inc hl
        jr z,.loop
    
.not_equal:
        ; Strings are not equal
        pop de
        pop hl
        pop af
        call UNITTEST_TEST_READY_FAILURE 
        jr .end

.comp_string:
        defb string, 0

.null_found:
        ; We are at the end of the compare string.
        ; Check if null termination should be compared with the tested string.
      IF term0 == 0
        cp (hl) 
        jr nz,.not_equal
      ENDIF

        pop de
        pop hl
        pop af
.end:
    ENDM


    ; Initializes the registers with default values.
    ; Use before the tested function is called.
    ; After the call the TEST_UNCHANGED_XX tests can be used
    ; to check if the register was changed.
DEFAULT_REGS:    MACRO
        ld a,0xAA
        ld bc,0xBBCC
        ld de,0xDDEE
        ld hl,0x8899
    ENDM

TEST_UNCHANGED_BC:    MACRO
        push hl 
        ld hl,0xBBCC
        or a
        sbc hl,bc
        pop hl
        call nz,UNITTEST_TEST_READY_FAILURE 
        nop
    ENDM

TEST_UNCHANGED_DE:    MACRO 
        push hl 
        ld hl,0xDDEE
        or a
        sbc hl,de
        pop hl
        call nz,UNITTEST_TEST_READY_FAILURE 
        nop
    ENDM

TEST_UNCHANGED_HL:    MACRO
        push de 
        ld de,0x8899
        or a
        sbc hl,de
        add hl,de   ; restore hl without affecting the flags
        pop de
        call nz,UNITTEST_TEST_READY_FAILURE 
        nop
    ENDM

TEST_UNCHANGED_BC_DE:    MACRO
        TEST_UNCHANGED_BC
        TEST_UNCHANGED_DE
    ENDM

TEST_UNCHANGED_BC_DE_HL:    MACRO
        TEST_UNCHANGED_BC_DE
        TEST_UNCHANGED_HL
    ENDM

TEST_UNCHANGED_A:    MACRO
        TEST_A 0xAA
    ENDM

TEST_UNCHANGED_B:    MACRO
        TEST_REG b, 0xBB
    ENDM

TEST_UNCHANGED_C:    MACRO
        TEST_REG c, 0xCC
    ENDM

TEST_UNCHANGED_D:    MACRO
        TEST_REG d, 0xDD
    ENDM

TEST_UNCHANGED_E:    MACRO
        TEST_REG e, 0xEE
    ENDM

TEST_UNCHANGED_H:    MACRO
        TEST_REG h, 0x88
    ENDM

TEST_UNCHANGED_L:    MACRO
        TEST_REG l, 0x99
    ENDM

    
    ; Macro to test flags for Z.
    ; Testcase fails for NZ.
TEST_FLAG_Z:    MACRO
        call nz,UNITTEST_TEST_READY_FAILURE 
        nop
    ENDM


    ; Macro to test flags for NZ.
    ; Testcase fails for Z.
TEST_FLAG_NZ:    MACRO
        call z,UNITTEST_TEST_READY_FAILURE 
        nop
    ENDM


    ; This macro uses all registers, also the shadow registers.
USE_ALL_REGS:    MACRO
        ld a,0xCD 
        ld bc,0xBBCC
        ld de,0xDDEE
        ld hl,0xFF11
        ld ix,0x7788
        ld iy,0x99AA
        exx
        ld a,0xDC
        ld bc,0x1122
        ld de,0x3344
        ld hl,0x5566
        exx
    ENDM

    ; other assemblers end
    ; -----------------------------------------------------------
  ENDIF
