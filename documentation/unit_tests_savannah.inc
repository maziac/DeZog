;--------------------------------------------------------
; unit_tests.inc
;
; Contains all macros used for unit testing.
; Code for e.g. Savannah's z80asm, maybe others.
;--------------------------------------------------------

UNITTEST_INITIALIZE:    MACRO

    ; Called to call each unit test.
UNITTEST_TEST_WRAPPER:  di
        ld sp,UNITTEST_STACK
UNITTEST_CALL_ADDR: call 0x0000 ; Will be changed by the z80 unit tests.
        nop

UNITTEST_TEST_READY_SUCCESS:    jr UNITTEST_TEST_READY_SUCCESS	; A breakpoint will be set here.


; Stack
        defw 0	; WPMEM ,2
        defs 2*50	; Stack depth of 50 should be enough
UNITTEST_STACK:   defw 0  ; WPMEM ,2



    ; The unit test initialization. Provided by the user.
UNITTEST_START: di       ; Disable interrupts
        ; Flow through.
        ; Directly after the UNITTEST_INITIALIZE macro the user
        ; should put his test initialization code.
        ; Note: the stack pointer does not need to be set up.

    ENDM



    ; Macro that must be used at the end of the test case (instead of a ret).
TC_END: MACRO
        jp UNITTEST_TEST_READY_SUCCESS
    ENDM

    ; Tests a memory address for a specific byte value.
TEST_MEMORY_BYTE:    MACRO addr value
        push hl
        ld hl,addr
        ld l,(hl)
        ld h,value
        nop ; ASSERTION L == H
        pop hl
    ENDM

    ; Tests a memory address for a specific word value.
    ; If the test fails the '(addr)' can be found in DE.
TEST_MEMORY_WORD:    MACRO addr value
        push hl
        push de
        ld hl,addr
        ld e,(hl)
        inc hl
        ld d,(hl)
        ld hl,value
        nop ; ASSERTION DE == HL
        pop de
        pop hl
    ENDM


