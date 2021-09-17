;--------------------------------------------------------
; unit_tests.inc
;
; Contains all macros used for unit testing.
; For sjasmplus.
;--------------------------------------------------------

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

; Stack
@UNITTEST_STACK_BOTTOM:
        defw 0
        defs 2*50	; Stack depth of 50 should be enough
@UNITTEST_STACK:
        defw 0

    ; The unit test initialization. Provided by the user.
@UNITTEST_START:
        ; Disable interrupts
        di
        ; Flow through.
        ; Directly after the UNITTEST_INITIALIZE macro the user
        ; should put his test initialization code.
        ; Note: the stack pointer does not need to be set up.

    ENDM


    ; Macro that must be used at the end of the test case (instead of a ret).
    MACRO TC_END
        jp UNITTEST_TEST_READY_SUCCESS
    ENDM


    ; Tests a memory address for a specific byte value.
    MACRO TEST_MEMORY_BYTE addr?, value?
        push hl
        ld hl,addr?
        ld l,(hl)
        ld h,value?
        nop ; ASSERTION L == H
        pop hl
    ENDM

    ; Tests a memory address for a specific word value.
    ; If the test fails the '(addr)' can be found in DE.
    MACRO TEST_MEMORY_WORD addr?, value?
        push hl, de
        ld hl,addr?
        ld e,(hl)
        inc hl
        ld d,(hl)
        ld hl,value?
        nop ; ASSERTION DE == HL
        pop de, hl
    ENDM

    ; Creates a failure when reached.
    MACRO TEST_FAIL
        nop ; ASSERTION false
    ENDM



    ; Compares 2 memory areas containing null terminated strings.
    ; addr1 = the first string
    ; addr2 = the second string
    MACRO TEST_STRING_PTR addr1?, addr2?
        push af
        push hl
        push de
        ld de,addr2?
        ld hl,addr1?
.loop:
        ld a,(de)
        ; Check for null termination
        cp (hl)
        jr nz,.not_equal
        or a
        jr z,.null_found
        inc de
        inc hl
        jr .loop

.not_equal:
        ; Strings are not equal
        pop de
        pop hl
        pop af
        nop ; ASSERTION false
        jr .end

.null_found:
        pop de
        pop hl
        pop af
.end:
    ENDM


    ; Tests a memory address for a specific string.
    ; addr = the tested string
    ; string = the compared string, e.g. "STRING"
    ; term0 = If 0 it is also tested that the string (addr) is null terminated
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
        nop ; ASSERTION false
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


    ; Tests a memory area on equality.
    ; addr1 = the tested memory area
    ; addr2 = the memory area to compare to
    ; count = the number of elements to compare
    MACRO TEST_MEM_CMP addr1?, addr2?, count?
        push af
        push hl
        push de
        push bc
        ld de,addr2?
        ld hl,addr1?
        ld bc,count?
.loop:
        ld a,(de)
        ; Compare
        cpi      ; cp (hl++); dec bc
        jr nz,.not_equal
        inc de
        jp pe,.loop

        ; Memory is equal
        pop bc
        pop de
        pop hl
        pop af
        jr .end

.not_equal:
        ; Memory areas are not equal
        pop bc
        pop de
        pop hl
        pop af
        nop ; ASSERTION false
        jr .end
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
        nop ; ASSERTION BC == 0xBBCC
    ENDM

    MACRO TEST_UNCHANGED_DE
        nop ; ASSERTION DE == 0xDDEE
    ENDM

    MACRO TEST_UNCHANGED_HL
        nop ; ASSERTION HL == 0x8899
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
        nop ; TEST ASSERTION A == 0xAA
    ENDM

    MACRO TEST_UNCHANGED_B
        nop ; TEST ASSERTION B == 0xBB
    ENDM

    MACRO TEST_UNCHANGED_C
        nop ; TEST ASSERTION C == 0xCC
    ENDM

    MACRO TEST_UNCHANGED_D
        nop ; TEST ASSERTION D == 0xDD
    ENDM

    MACRO TEST_UNCHANGED_E
        nop ; TEST ASSERTION E == 0xEE
    ENDM

    MACRO TEST_UNCHANGED_H
        nop ; TEST ASSERTION H == 0x88
    ENDM

    MACRO TEST_UNCHANGED_L
        nop ; TEST ASSERTION L == 0x99
    ENDM


    ; Macro to test flags for Z.
    ; Testcase fails for NZ.
    MACRO TEST_FLAG_Z
        nop ; TEST ASSERTION F & 0x40
    ENDM


    ; Macro to test flags for NZ.
    ; Testcase fails for Z.
    MACRO TEST_FLAG_NZ
        nop ; TEST ASSERTION (F & 0x40) == 0
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
