; ===========================================================
; An Assembly Listing of the Operating System of the ZX81 ROM
; ===========================================================
; -------------------------
; Last updated: 13-DEC-2004
; -------------------------
;
; Work in progress.
; This file will cross-assemble an original version of the "Improved"
; ZX81 ROM.  The file can be modified to change the behaviour of the ROM
; when used in emulators although there is no spare space available.
;
; The documentation is incomplete and if you can find a copy
; of "The Complete Spectrum ROM Disassembly" then many routines
; such as POINTERS and most of the mathematical routines are
; similar and often identical.
;
; I've used the labels from the above book in this file and also
; some from the more elusive Complete ZX81 ROM Disassembly
; by the same publishers, Melbourne House.


;#define DEFB .BYTE      ; TASM cross-assembler definitions
;#define DEFW .WORD
;#define EQU  .EQU
	DEVICE NOSLOT64K        ; Let sjasmplus generate the listing


;*****************************************
;** Part 1. RESTART ROUTINES AND TABLES **
;*****************************************

; -----------
; THE 'START'
; -----------
; All Z80 chips start at location zero.
; At start-up the Interrupt Mode is 0, ZX computers use Interrupt Mode 1.
; Interrupts are disabled .

;; START
0000 D3 FD        OUT     ($FD),A         ; Turn off the NMI generator if this ROM is
                                ; running in ZX81 hardware. This does nothing
                                ; if this ROM is running within an upgraded
                                ; ZX80.
0002 01 FF 7F     LD      BC,$7FFF        ; Set BC to the top of possible RAM.
                                ; The higher unpopulated addresses are used for
                                ; video generation.
0005 C3 CB 03     JP      L03CB           ; Jump forward to RAM-CHECK.

; -------------------
; THE 'ERROR' RESTART
; -------------------
; The error restart deals immediately with an error. ZX computers execute the
; same code in runtime as when checking syntax. If the error occurred while
; running a program then a brief report is produced. If the error occurred
; while entering a BASIC line or in input etc., then the error marker indicates
; the exact point at which the error lies.

;; ERROR-1
0008 2A 16 40     LD      HL,($4016)      ; fetch character address from CH_ADD.
000B 22 18 40     LD      ($4018),HL      ; and set the error pointer X_PTR.
000E 18 46        JR      L0056           ; forward to continue at ERROR-2.

; -------------------------------
; THE 'PRINT A CHARACTER' RESTART
; -------------------------------
; This restart prints the character in the accumulator using the alternate
; register set so there is no requirement to save the main registers.
; There is sufficient room available to separate a space (zero) from other
; characters as leading spaces need not be considered with a space.

;; PRINT-A
0010 A7           AND     A               ; test for zero - space.
0011 C2 F1 07     JP      NZ,L07F1        ; jump forward if not to PRINT-CH.

0014 C3 F5 07     JP      L07F5           ; jump forward to PRINT-SP.

; ---

        DEFB    $FF             ; unused location.

; ---------------------------------
; THE 'COLLECT A CHARACTER' RESTART
; ---------------------------------
; The character addressed by the system variable CH_ADD is fetched and if it
; is a non-space, non-cursor character it is returned else CH_ADD is
; incremented and the new addressed character tested until it is not a space.

;; GET-CHAR
0018 2A 16 40     LD      HL,($4016)      ; set HL to character address CH_ADD.
001B 7E           LD      A,(HL)          ; fetch addressed character to A.

;; TEST-SP
001C A7           AND     A               ; test for space.
001D C0           RET     NZ              ; return if not a space

001E 00           NOP                     ; else trickle through
001F 00           NOP                     ; to the next routine.

; ------------------------------------
; THE 'COLLECT NEXT CHARACTER' RESTART
; ------------------------------------
; The character address in incremented and the new addressed character is
; returned if not a space, or cursor, else the process is repeated.

;; NEXT-CHAR
0020 CD 49 00     CALL    L0049           ; routine CH-ADD+1 gets next immediate
                                ; character.
0023 18 F7        JR      L001C           ; back to TEST-SP.

; ---

        DEFB    $FF, $FF, $FF   ; unused locations.

; ---------------------------------------
; THE 'FLOATING POINT CALCULATOR' RESTART
; ---------------------------------------
; this restart jumps to the recursive floating-point calculator.
; the ZX81's internal, FORTH-like, stack-based language.
;
; In the five remaining bytes there is, appropriately, enough room for the
; end-calc literal - the instruction which exits the calculator.

;; FP-CALC
0028 C3 9D 19     JP      L199D           ; jump immediately to the CALCULATE routine.

; ---

;; end-calc
002B F1           POP     AF              ; drop the calculator return address RE-ENTRY
002C D9           EXX                     ; switch to the other set.

002D E3           EX      (SP),HL         ; transfer H'L' to machine stack for the
                                ; return address.
                                ; when exiting recursion then the previous
                                ; pointer is transferred to H'L'.

002E D9           EXX                     ; back to main set.
002F C9           RET                     ; return.


; -----------------------------
; THE 'MAKE BC SPACES'  RESTART
; -----------------------------
; This restart is used eight times to create, in workspace, the number of
; spaces passed in the BC register.

;; BC-SPACES
0030 C5           PUSH    BC              ; push number of spaces on stack.
0031 2A 14 40     LD      HL,($4014)      ; fetch edit line location from E_LINE.
0034 E5           PUSH    HL              ; save this value on stack.
0035 C3 88 14     JP      L1488           ; jump forward to continue at RESERVE.

; -----------------------
; THE 'INTERRUPT' RESTART
; -----------------------
;   The Mode 1 Interrupt routine is concerned solely with generating the central
;   television picture.
;   On the ZX81 interrupts are enabled only during the interrupt routine,
;   although the interrupt
;   This Interrupt Service Routine automatically disables interrupts at the
;   outset and the last interrupt in a cascade exits before the interrupts are
;   enabled.
;   There is no DI instruction in the ZX81 ROM.
;   An maskable interrupt is triggered when bit 6 of the Z80's Refresh register
;   changes from set to reset.
;   The Z80 will always be executing a HALT (NEWLINE) when the interrupt occurs.
;   A HALT instruction repeatedly executes NOPS but the seven lower bits
;   of the Refresh register are incremented each time as they are when any
;   simple instruction is executed. (The lower 7 bits are incremented twice for
;   a prefixed instruction)
;   This is controlled by the Sinclair Computer Logic Chip - manufactured from
;   a Ferranti Uncommitted Logic Array.
;
;   When a Mode 1 Interrupt occurs the Program Counter, which is the address in
;   the upper echo display following the NEWLINE/HALT instruction, goes on the
;   machine stack.  193 interrupts are required to generate the last part of
;   the 56th border line and then the 192 lines of the central TV picture and,
;   although each interrupt interrupts the previous one, there are no stack
;   problems as the 'return address' is discarded each time.
;
;   The scan line counter in C counts down from 8 to 1 within the generation of
;   each text line. For the first interrupt in a cascade the initial value of
;   C is set to 1 for the last border line.
;   Timing is of the utmost importance as the RH border, horizontal retrace
;   and LH border are mostly generated in the 58 clock cycles this routine
;   takes .

;; INTERRUPT
0038 0D           DEC     C               ; (4)  decrement C - the scan line counter.
0039 C2 45 00     JP      NZ,L0045        ; (10/10) JUMP forward if not zero to SCAN-LINE

003C E1           POP     HL              ; (10) point to start of next row in display
                                ;      file.

003D 05           DEC     B               ; (4)  decrement the row counter. (4)
003E C8           RET     Z               ; (11/5) return when picture complete to L028B
                                ;      with interrupts disabled.

003F CB D9        SET     3,C             ; (8)  Load the scan line counter with eight.
                                ;      Note. LD C,$08 is 7 clock cycles which
                                ;      is way too fast.

; ->

;; WAIT-INT
0041 ED 4F        LD      R,A             ; (9) Load R with initial rising value $DD.

0043 FB           EI                      ; (4) Enable Interrupts.  [ R is now $DE ].

0044 E9           JP      (HL)            ; (4) jump to the echo display file in upper
                                ;     memory and execute characters $00 - $3F
                                ;     as NOP instructions.  The video hardware
                                ;     is able to read these characters and,
                                ;     with the I register is able to convert
                                ;     the character bitmaps in this ROM into a
                                ;     line of bytes. Eventually the NEWLINE/HALT
                                ;     will be encountered before R reaches $FF.
                                ;     It is however the transition from $FF to
                                ;     $80 that triggers the next interrupt.
                                ;     [ The Refresh register is now $DF ]

; ---

;; SCAN-LINE
0045 D1           POP     DE              ; (10) discard the address after NEWLINE as the
                                ;      same text line has to be done again
                                ;      eight times.

0046 C8           RET     Z               ; (5)  Harmless Nonsensical Timing.
                                ;      (condition never met)

0047 18 F8        JR      L0041           ; (12) back to WAIT-INT

;   Note. that a computer with less than 4K or RAM will have a collapsed
;   display file and the above mechanism deals with both types of display.
;
;   With a full display, the 32 characters in the line are treated as NOPS
;   and the Refresh register rises from $E0 to $FF and, at the next instruction
;   - HALT, the interrupt occurs.
;   With a collapsed display and an initial NEWLINE/HALT, it is the NOPs
;   generated by the HALT that cause the Refresh value to rise from $E0 to $FF,
;   triggering an Interrupt on the next transition.
;   This works happily for all display lines between these extremes and the
;   generation of the 32 character, 1 pixel high, line will always take 128
;   clock cycles.

; ---------------------------------
; THE 'INCREMENT CH-ADD' SUBROUTINE
; ---------------------------------
; This is the subroutine that increments the character address system variable
; and returns if it is not the cursor character. The ZX81 has an actual
; character at the cursor position rather than a pointer system variable
; as is the case with prior and subsequent ZX computers.

;; CH-ADD+1
0049 2A 16 40     LD      HL,($4016)      ; fetch character address to CH_ADD.

;; TEMP-PTR1
004C 23           INC     HL              ; address next immediate location.

;; TEMP-PTR2
004D 22 16 40     LD      ($4016),HL      ; update system variable CH_ADD.

0050 7E           LD      A,(HL)          ; fetch the character.
0051 FE 7F        CP      $7F             ; compare to cursor character.
0053 C0           RET     NZ              ; return if not the cursor.

0054 18 F6        JR      L004C           ; back for next character to TEMP-PTR1.

; --------------------
; THE 'ERROR-2' BRANCH
; --------------------
; This is a continuation of the error restart.
; If the error occurred in runtime then the error stack pointer will probably
; lead to an error report being printed unless it occurred during input.
; If the error occurred when checking syntax then the error stack pointer
; will be an editing routine and the position of the error will be shown
; when the lower screen is reprinted.

;; ERROR-2
0056 E1           POP     HL              ; pop the return address which points to the
                                ; DEFB, error code, after the RST 08.
0057 6E           LD      L,(HL)          ; load L with the error code. HL is not needed
                                ; anymore.

;; ERROR-3
0058 FD 75 00     LD      (IY+$00),L      ; place error code in system variable ERR_NR
005B ED 7B 02 40  LD      SP,($4002)      ; set the stack pointer from ERR_SP
005F CD 07 02     CALL    L0207           ; routine SLOW/FAST selects slow mode.
0062 C3 BC 14     JP      L14BC           ; exit to address on stack via routine SET-MIN.

; ---

        DEFB    $FF             ; unused.

; ------------------------------------
; THE 'NON MASKABLE INTERRUPT' ROUTINE
; ------------------------------------
;   Jim Westwood's technical dodge using Non-Maskable Interrupts solved the
;   flicker problem of the ZX80 and gave the ZX81 a multi-tasking SLOW mode
;   with a steady display.  Note that the AF' register is reserved for this
;   function and its interaction with the display routines.  When counting
;   TV lines, the NMI makes no use of the main registers.
;   The circuitry for the NMI generator is contained within the SCL (Sinclair
;   Computer Logic) chip.
;   ( It takes 32 clock cycles while incrementing towards zero ).

;; NMI
0066 08           EX      AF,AF'          ; (4) switch in the NMI's copy of the
                                ;     accumulator.
0067 3C           INC     A               ; (4) increment.
0068 FA 6D 00     JP      M,L006D         ; (10/10) jump, if minus, to NMI-RET as this is
                                ;     part of a test to see if the NMI
                                ;     generation is working or an intermediate
                                ;     value for the ascending negated blank
                                ;     line counter.

006B 28 02        JR      Z,L006F         ; (12) forward to NMI-CONT
                                ;      when line count has incremented to zero.

; Note. the synchronizing NMI when A increments from zero to one takes this
; 7 clock cycle route making 39 clock cycles in all.

;; NMI-RET
006D 08           EX      AF,AF'          ; (4)  switch out the incremented line counter
                                ;      or test result $80
006E C9           RET                     ; (10) return to User application for a while.

; ---

;   This branch is taken when the 55 (or 31) lines have been drawn.

;; NMI-CONT
006F 08           EX      AF,AF'          ; (4) restore the main accumulator.

0070 F5           PUSH    AF              ; (11) *             Save Main Registers
0071 C5           PUSH    BC              ; (11) **
0072 D5           PUSH    DE              ; (11) ***
0073 E5           PUSH    HL              ; (11) ****

;   the next set-up procedure is only really applicable when the top set of
;   blank lines have been generated.

0074 2A 0C 40     LD      HL,($400C)      ; (16) fetch start of Display File from D_FILE
                                ;      points to the HALT at beginning.
0077 CB FC        SET     7,H             ; (8) point to upper 32K 'echo display file'

0079 76           HALT                    ; (1) HALT synchronizes with NMI.
                                ; Used with special hardware connected to the
                                ; Z80 HALT and WAIT lines to take 1 clock cycle.

; ----------------------------------------------------------------------------
;   the NMI has been generated - start counting. The cathode ray is at the RH
;   side of the TV.
;   First the NMI servicing, similar to CALL            =  17 clock cycles.
;   Then the time taken by the NMI for zero-to-one path =  39 cycles
;   The HALT above                                      =  01 cycles.
;   The two instructions below                          =  19 cycles.
;   The code at L0281 up to and including the CALL      =  43 cycles.
;   The Called routine at L02B5                         =  24 cycles.
;   --------------------------------------                ---
;   Total Z80 instructions                              = 143 cycles.
;
;   Meanwhile in TV world,
;   Horizontal retrace                                  =  15 cycles.
;   Left blanking border 8 character positions          =  32 cycles
;   Generation of 75% scanline from the first NEWLINE   =  96 cycles
;   ---------------------------------------               ---
;                                                         143 cycles
;
;   Since at the time the first JP (HL) is encountered to execute the echo
;   display another 8 character positions have to be put out, then the
;   Refresh register need to hold $F8. Working back and counteracting
;   the fact that every instruction increments the Refresh register then
;   the value that is loaded into R needs to be $F5.      :-)
;
;
007A D3 FD        OUT     ($FD),A         ; (11) Stop the NMI generator.

007C DD E9        JP      (IX)            ; (8) forward to L0281 (after top) or L028F

; ****************
; ** KEY TABLES **
; ****************

; -------------------------------
; THE 'UNSHIFTED' CHARACTER CODES
; -------------------------------

;; K-UNSHIFT
007E    DEFB    $3F             ; Z
        DEFB    $3D             ; X
        DEFB    $28             ; C
        DEFB    $3B             ; V
        DEFB    $26             ; A
        DEFB    $38             ; S
        DEFB    $29             ; D
        DEFB    $2B             ; F
        DEFB    $2C             ; G
        DEFB    $36             ; Q
        DEFB    $3C             ; W
        DEFB    $2A             ; E
        DEFB    $37             ; R
        DEFB    $39             ; T
        DEFB    $1D             ; 1
        DEFB    $1E             ; 2
        DEFB    $1F             ; 3
        DEFB    $20             ; 4
        DEFB    $21             ; 5
        DEFB    $1C             ; 0
        DEFB    $25             ; 9
        DEFB    $24             ; 8
        DEFB    $23             ; 7
        DEFB    $22             ; 6
        DEFB    $35             ; P
        DEFB    $34             ; O
        DEFB    $2E             ; I
        DEFB    $3A             ; U
        DEFB    $3E             ; Y
        DEFB    $76             ; NEWLINE
        DEFB    $31             ; L
        DEFB    $30             ; K
        DEFB    $2F             ; J
        DEFB    $2D             ; H
        DEFB    $00             ; SPACE
        DEFB    $1B             ; .
        DEFB    $32             ; M
        DEFB    $33             ; N
        DEFB    $27             ; B

; -----------------------------
; THE 'SHIFTED' CHARACTER CODES
; -----------------------------


;; K-SHIFT
00A5    DEFB    $0E             ; :
        DEFB    $19             ; ;
        DEFB    $0F             ; ?
        DEFB    $18             ; /
        DEFB    $E3             ; STOP
        DEFB    $E1             ; LPRINT
        DEFB    $E4             ; SLOW
        DEFB    $E5             ; FAST
        DEFB    $E2             ; LLIST
        DEFB    $C0             ; ""
        DEFB    $D9             ; OR
        DEFB    $E0             ; STEP
        DEFB    $DB             ; <=
        DEFB    $DD             ; <>
        DEFB    $75             ; EDIT
        DEFB    $DA             ; AND
        DEFB    $DE             ; THEN
        DEFB    $DF             ; TO
        DEFB    $72             ; cursor-left
        DEFB    $77             ; RUBOUT
        DEFB    $74             ; GRAPHICS
        DEFB    $73             ; cursor-right
        DEFB    $70             ; cursor-up
        DEFB    $71             ; cursor-down
        DEFB    $0B             ; "
        DEFB    $11             ; )
        DEFB    $10             ; (
        DEFB    $0D             ; $
        DEFB    $DC             ; >=
        DEFB    $79             ; FUNCTION
        DEFB    $14             ; =
        DEFB    $15             ; +
        DEFB    $16             ; -
        DEFB    $D8             ; **
        DEFB    $0C             ;  £
        DEFB    $1A             ; ,
        DEFB    $12             ; >
        DEFB    $13             ; <
        DEFB    $17             ; *

; ------------------------------
; THE 'FUNCTION' CHARACTER CODES
; ------------------------------


;; K-FUNCT
00CC    DEFB    $CD             ; LN
        DEFB    $CE             ; EXP
        DEFB    $C1             ; AT
        DEFB    $78             ; KL
        DEFB    $CA             ; ASN
        DEFB    $CB             ; ACS
        DEFB    $CC             ; ATN
        DEFB    $D1             ; SGN
        DEFB    $D2             ; ABS
        DEFB    $C7             ; SIN
        DEFB    $C8             ; COS
        DEFB    $C9             ; TAN
        DEFB    $CF             ; INT
        DEFB    $40             ; RND
        DEFB    $78             ; KL
        DEFB    $78             ; KL
        DEFB    $78             ; KL
        DEFB    $78             ; KL
        DEFB    $78             ; KL
        DEFB    $78             ; KL
        DEFB    $78             ; KL
        DEFB    $78             ; KL
        DEFB    $78             ; KL
        DEFB    $78             ; KL
        DEFB    $C2             ; TAB
        DEFB    $D3             ; PEEK
        DEFB    $C4             ; CODE
        DEFB    $D6             ; CHR$
        DEFB    $D5             ; STR$
        DEFB    $78             ; KL
        DEFB    $D4             ; USR
        DEFB    $C6             ; LEN
        DEFB    $C5             ; VAL
        DEFB    $D0             ; SQR
        DEFB    $78             ; KL
        DEFB    $78             ; KL
        DEFB    $42             ; PI
        DEFB    $D7             ; NOT
        DEFB    $41             ; INKEY$

; -----------------------------
; THE 'GRAPHIC' CHARACTER CODES
; -----------------------------


;; K-GRAPH
00F3    DEFB    $08             ; graphic
        DEFB    $0A             ; graphic
        DEFB    $09             ; graphic
        DEFB    $8A             ; graphic
        DEFB    $89             ; graphic
        DEFB    $81             ; graphic
        DEFB    $82             ; graphic
        DEFB    $07             ; graphic
        DEFB    $84             ; graphic
        DEFB    $06             ; graphic
        DEFB    $01             ; graphic
        DEFB    $02             ; graphic
        DEFB    $87             ; graphic
        DEFB    $04             ; graphic
        DEFB    $05             ; graphic
        DEFB    $77             ; RUBOUT
        DEFB    $78             ; KL
        DEFB    $85             ; graphic
        DEFB    $03             ; graphic
        DEFB    $83             ; graphic
        DEFB    $8B             ; graphic
        DEFB    $91             ; inverse )
        DEFB    $90             ; inverse (
        DEFB    $8D             ; inverse $
        DEFB    $86             ; graphic
        DEFB    $78             ; KL
        DEFB    $92             ; inverse >
        DEFB    $95             ; inverse +
        DEFB    $96             ; inverse -
        DEFB    $88             ; graphic

; ------------------
; THE 'TOKEN' TABLES
; ------------------


;; TOKENS
0111    DEFB    $0F+$80                         ; '?'+$80
        DEFB    $0B,$0B+$80                     ; ""
        DEFB    $26,$39+$80                     ; AT
        DEFB    $39,$26,$27+$80                 ; TAB
        DEFB    $0F+$80                         ; '?'+$80
        DEFB    $28,$34,$29,$2A+$80             ; CODE
        DEFB    $3B,$26,$31+$80                 ; VAL
        DEFB    $31,$2A,$33+$80                 ; LEN
        DEFB    $38,$2E,$33+$80                 ; SIN
        DEFB    $28,$34,$38+$80                 ; COS
        DEFB    $39,$26,$33+$80                 ; TAN
        DEFB    $26,$38,$33+$80                 ; ASN
        DEFB    $26,$28,$38+$80                 ; ACS
        DEFB    $26,$39,$33+$80                 ; ATN
        DEFB    $31,$33+$80                     ; LN
        DEFB    $2A,$3D,$35+$80                 ; EXP
        DEFB    $2E,$33,$39+$80                 ; INT
        DEFB    $38,$36,$37+$80                 ; SQR
        DEFB    $38,$2C,$33+$80                 ; SGN
        DEFB    $26,$27,$38+$80                 ; ABS
        DEFB    $35,$2A,$2A,$30+$80             ; PEEK
        DEFB    $3A,$38,$37+$80                 ; USR
        DEFB    $38,$39,$37,$0D+$80             ; STR$
        DEFB    $28,$2D,$37,$0D+$80             ; CHR$
        DEFB    $33,$34,$39+$80                 ; NOT
        DEFB    $17,$17+$80                     ; **
        DEFB    $34,$37+$80                     ; OR
        DEFB    $26,$33,$29+$80                 ; AND
        DEFB    $13,$14+$80                     ; <=
        DEFB    $12,$14+$80                     ; >=
        DEFB    $13,$12+$80                     ; <>
        DEFB    $39,$2D,$2A,$33+$80             ; THEN
        DEFB    $39,$34+$80                     ; TO
        DEFB    $38,$39,$2A,$35+$80             ; STEP
        DEFB    $31,$35,$37,$2E,$33,$39+$80     ; LPRINT
        DEFB    $31,$31,$2E,$38,$39+$80         ; LLIST
        DEFB    $38,$39,$34,$35+$80             ; STOP
        DEFB    $38,$31,$34,$3C+$80             ; SLOW
        DEFB    $2B,$26,$38,$39+$80             ; FAST
        DEFB    $33,$2A,$3C+$80                 ; NEW
        DEFB    $38,$28,$37,$34,$31,$31+$80     ; SCROLL
        DEFB    $28,$34,$33,$39+$80             ; CONT
        DEFB    $29,$2E,$32+$80                 ; DIM
        DEFB    $37,$2A,$32+$80                 ; REM
        DEFB    $2B,$34,$37+$80                 ; FOR
        DEFB    $2C,$34,$39,$34+$80             ; GOTO
        DEFB    $2C,$34,$38,$3A,$27+$80         ; GOSUB
        DEFB    $2E,$33,$35,$3A,$39+$80         ; INPUT
        DEFB    $31,$34,$26,$29+$80             ; LOAD
        DEFB    $31,$2E,$38,$39+$80             ; LIST
        DEFB    $31,$2A,$39+$80                 ; LET
        DEFB    $35,$26,$3A,$38,$2A+$80         ; PAUSE
        DEFB    $33,$2A,$3D,$39+$80             ; NEXT
        DEFB    $35,$34,$30,$2A+$80             ; POKE
        DEFB    $35,$37,$2E,$33,$39+$80         ; PRINT
        DEFB    $35,$31,$34,$39+$80             ; PLOT
        DEFB    $37,$3A,$33+$80                 ; RUN
        DEFB    $38,$26,$3B,$2A+$80             ; SAVE
        DEFB    $37,$26,$33,$29+$80             ; RAND
        DEFB    $2E,$2B+$80                     ; IF
        DEFB    $28,$31,$38+$80                 ; CLS
        DEFB    $3A,$33,$35,$31,$34,$39+$80     ; UNPLOT
        DEFB    $28,$31,$2A,$26,$37+$80         ; CLEAR
        DEFB    $37,$2A,$39,$3A,$37,$33+$80     ; RETURN
        DEFB    $28,$34,$35,$3E+$80             ; COPY
        DEFB    $37,$33,$29+$80                 ; RND
        DEFB    $2E,$33,$30,$2A,$3E,$0D+$80     ; INKEY$
        DEFB    $35,$2E+$80                     ; PI


; ------------------------------
; THE 'LOAD-SAVE UPDATE' ROUTINE
; ------------------------------
;
;

;; LOAD/SAVE
01FC 23           INC     HL              ;
01FD EB           EX      DE,HL           ;
01FE 2A 14 40     LD      HL,($4014)      ; system variable edit line E_LINE.
0201 37           SCF                     ; set carry flag
0202 ED 52        SBC     HL,DE           ;
0204 EB           EX      DE,HL           ;
0205 D0           RET     NC              ; return if more bytes to load/save.

0206 E1           POP     HL              ; else drop return address

; ----------------------
; THE 'DISPLAY' ROUTINES
; ----------------------
;
;

;; SLOW/FAST
0207 21 3B 40     LD      HL,$403B        ; Address the system variable CDFLAG.
020A 7E           LD      A,(HL)          ; Load value to the accumulator.
020B 17           RLA                     ; rotate bit 6 to position 7.
020C AE           XOR     (HL)            ; exclusive or with original bit 7.
020D 17           RLA                     ; rotate result out to carry.
020E D0           RET     NC              ; return if both bits were the same.

;   Now test if this really is a ZX81 or a ZX80 running the upgraded ROM.
;   The standard ZX80 did not have an NMI generator.

020F 3E 7F        LD      A,$7F           ; Load accumulator with %011111111
0211 08           EX      AF,AF'          ; save in AF'

0212 06 11        LD      B,$11           ; A counter within which an NMI should occur
                                ; if this is a ZX81.
0214 D3 FE        OUT     ($FE),A         ; start the NMI generator.

;  Note that if this is a ZX81 then the NMI will increment AF'.

;; LOOP-11
0216 10 FE        DJNZ    L0216           ; self loop to give the NMI a chance to kick in.
                                ; = 16*13 clock cycles + 8 = 216 clock cycles.

0218 D3 FD        OUT     ($FD),A         ; Turn off the NMI generator.
021A 08           EX      AF,AF'          ; bring back the AF' value.
021B 17           RLA                     ; test bit 7.
021C 30 08        JR      NC,L0226        ; forward, if bit 7 is still reset, to NO-SLOW.

;   If the AF' was incremented then the NMI generator works and SLOW mode can
;   be set.

021E CB FE        SET     7,(HL)          ; Indicate SLOW mode - Compute and Display.

0220 F5           PUSH    AF              ; *             Save Main Registers
0221 C5           PUSH    BC              ; **
0222 D5           PUSH    DE              ; ***
0223 E5           PUSH    HL              ; ****

0224 18 03        JR      L0229           ; skip forward - to DISPLAY-1.

; ---

;; NO-SLOW
0226 CB B6        RES     6,(HL)          ; reset bit 6 of CDFLAG.
0228 C9           RET                     ; return.

; -----------------------
; THE 'MAIN DISPLAY' LOOP
; -----------------------
; This routine is executed once for every frame displayed.

;; DISPLAY-1
0229 2A 34 40     LD      HL,($4034)      ; fetch two-byte system variable FRAMES.
022C 2B           DEC     HL              ; decrement frames counter.

;; DISPLAY-P
022D 3E 7F        LD      A,$7F           ; prepare a mask
022F A4           AND     H               ; pick up bits 6-0 of H.
0230 B5           OR      L               ; and any bits of L.
0231 7C           LD      A,H             ; reload A with all bits of H for PAUSE test.

;   Note both branches must take the same time.

0232 20 03        JR      NZ,L0237        ; (12/7) forward if bits 14-0 are not zero
                                ; to ANOTHER

0234 17           RLA                     ; (4) test bit 15 of FRAMES.
0235 18 02        JR      L0239           ; (12) forward with result to OVER-NC

; ---

;; ANOTHER
0237 46           LD      B,(HL)          ; (7) Note. Harmless Nonsensical Timing weight.
0238 37           SCF                     ; (4) Set Carry Flag.

; Note. the branch to here takes either (12)(7)(4) cyles or (7)(4)(12) cycles.

;; OVER-NC
0239 67           LD      H,A             ; (4)  set H to zero
023A 22 34 40     LD      ($4034),HL      ; (16) update system variable FRAMES
023D D0           RET     NC              ; (11/5) return if FRAMES is in use by PAUSE
                                ; command.

;; DISPLAY-2
023E CD BB 02     CALL    L02BB           ; routine KEYBOARD gets the key row in H and
                                ; the column in L. Reading the ports also starts
                                ; the TV frame synchronization pulse. (VSYNC)

0241 ED 4B 25 40  LD      BC,($4025)      ; fetch the last key values read from LAST_K
0245 22 25 40     LD      ($4025),HL      ; update LAST_K with new values.

0248 78           LD      A,B             ; load A with previous column - will be $FF if
                                ; there was no key.
0249 C6 02        ADD     A,$02           ; adding two will set carry if no previous key.

024B ED 42        SBC     HL,BC           ; subtract with the carry the two key values.

; If the same key value has been returned twice then HL will be zero.

024D 3A 27 40     LD      A,($4027)       ; fetch system variable DEBOUNCE
0250 B4           OR      H               ; and OR with both bytes of the difference
0251 B5           OR      L               ; setting the zero flag for the upcoming branch.

0252 58           LD      E,B             ; transfer the column value to E
0253 06 0B        LD      B,$0B           ; and load B with eleven

0255 21 3B 40     LD      HL,$403B        ; address system variable CDFLAG
0258 CB 86        RES     0,(HL)          ; reset the rightmost bit of CDFLAG
025A 20 08        JR      NZ,L0264        ; skip forward if debounce/diff >0 to NO-KEY

025C CB 7E        BIT     7,(HL)          ; test compute and display bit of CDFLAG
025E CB C6        SET     0,(HL)          ; set the rightmost bit of CDFLAG.
0260 C8           RET     Z               ; return if bit 7 indicated fast mode.

0261 05           DEC     B               ; (4) decrement the counter.
0262 00           NOP                     ; (4) Timing - 4 clock cycles. ??
0263 37           SCF                     ; (4) Set Carry Flag

;; NO-KEY
0264 21 27 40     LD      HL,$4027        ; sv DEBOUNCE
0267 3F           CCF                     ; Complement Carry Flag
0268 CB 10        RL      B               ; rotate left B picking up carry
                                ;  C<-76543210<-C

;; LOOP-B
026A 10 FE        DJNZ    L026A           ; self-loop while B>0 to LOOP-B

026C 46           LD      B,(HL)          ; fetch value of DEBOUNCE to B
026D 7B           LD      A,E             ; transfer column value
026E FE FE        CP      $FE             ;
0270 9F           SBC     A,A             ;
0271 06 1F        LD      B,$1F           ;
0273 B6           OR      (HL)            ;
0274 A0           AND     B               ;
0275 1F           RRA                     ;
0276 77           LD      (HL),A          ;

0277 D3 FF        OUT     ($FF),A         ; end the TV frame synchronization pulse.

0279 2A 0C 40     LD      HL,($400C)      ; (12) set HL to the Display File from D_FILE
027C CB FC        SET     7,H             ; (8) set bit 15 to address the echo display.

027E CD 92 02     CALL    L0292           ; (17) routine DISPLAY-3 displays the top set
                                ; of blank lines.

; ---------------------
; THE 'VIDEO-1' ROUTINE
; ---------------------

;; R-IX-1
0281 ED 5F        LD      A,R             ; (9)  Harmless Nonsensical Timing or something
                                ;      very clever?
0283 01 01 19     LD      BC,$1901        ; (10) 25 lines, 1 scanline in first.
0286 3E F5        LD      A,$F5           ; (7)  This value will be loaded into R and
                                ; ensures that the cycle starts at the right
                                ; part of the display  - after 32nd character
                                ; position.

0288 CD B5 02     CALL    L02B5           ; (17) routine DISPLAY-5 completes the current
                                ; blank line and then generates the display of
                                ; the live picture using INT interrupts
                                ; The final interrupt returns to the next
                                ; address.

028B 2B           DEC     HL              ; point HL to the last NEWLINE/HALT.

028C CD 92 02     CALL    L0292           ; routine DISPLAY-3 displays the bottom set of
                                ; blank lines.

; ---

;; R-IX-2
028F C3 29 02     JP      L0229           ; JUMP back to DISPLAY-1

; ---------------------------------
; THE 'DISPLAY BLANK LINES' ROUTINE
; ---------------------------------
;   This subroutine is called twice (see above) to generate first the blank
;   lines at the top of the television display and then the blank lines at the
;   bottom of the display.

;; DISPLAY-3
0292 DD E1        POP     IX              ; pop the return address to IX register.
                                ; will be either L0281 or L028F - see above.

0294 FD 4E 28     LD      C,(IY+$28)      ; load C with value of system constant MARGIN.
0297 FD CB 3B 7E  BIT     7,(IY+$3B)      ; test CDFLAG for compute and display.
029B 28 0C        JR      Z,L02A9         ; forward, with FAST mode, to DISPLAY-4

029D 79           LD      A,C             ; move MARGIN to A  - 31d or 55d.
029E ED 44        NEG                     ; Negate
02A0 3C           INC     A               ;
02A1 08           EX      AF,AF'          ; place negative count of blank lines in A'

02A2 D3 FE        OUT     ($FE),A         ; enable the NMI generator.

02A4 E1           POP     HL              ; ****
02A5 D1           POP     DE              ; ***
02A6 C1           POP     BC              ; **
02A7 F1           POP     AF              ; *             Restore Main Registers

02A8 C9           RET                     ; return - end of interrupt.  Return is to
                                ; user's program - BASIC or machine code.
                                ; which will be interrupted by every NMI.

; ------------------------
; THE 'FAST MODE' ROUTINES
; ------------------------

;; DISPLAY-4
02A9 3E FC        LD      A,$FC           ; (7)  load A with first R delay value
02AB 06 01        LD      B,$01           ; (7)  one row only.

02AD CD B5 02     CALL    L02B5           ; (17) routine DISPLAY-5

02B0 2B           DEC     HL              ; (6)  point back to the HALT.
02B1 E3           EX      (SP),HL         ; (19) Harmless Nonsensical Timing if paired.
02B2 E3           EX      (SP),HL         ; (19) Harmless Nonsensical Timing.
02B3 DD E9        JP      (IX)            ; (8)  to L0281 or L028F

; --------------------------
; THE 'DISPLAY-5' SUBROUTINE
; --------------------------
;   This subroutine is called from SLOW mode and FAST mode to generate the
;   central TV picture. With SLOW mode the R register is incremented, with
;   each instruction, to $F7 by the time it completes.  With fast mode, the
;   final R value will be $FF and an interrupt will occur as soon as the
;   Program Counter reaches the HALT.  (24 clock cycles)

;; DISPLAY-5
02B5 ED 4F        LD      R,A             ; (9) Load R from A.    R = slow: $F5 fast: $FC
02B7 3E DD        LD      A,$DD           ; (7) load future R value.        $F6       $FD

02B9 FB           EI                      ; (4) Enable Interrupts           $F7       $FE

02BA E9           JP      (HL)            ; (4) jump to the echo display.   $F8       $FF

; ----------------------------------
; THE 'KEYBOARD SCANNING' SUBROUTINE
; ----------------------------------
; The keyboard is read during the vertical sync interval while no video is
; being displayed.  Reading a port with address bit 0 low i.e. $FE starts the
; vertical sync pulse.

;; KEYBOARD
02BB 21 FF FF     LD      HL,$FFFF        ; (16) prepare a buffer to take key.
02BE 01 FE FE     LD      BC,$FEFE        ; (20) set BC to port $FEFE. The B register,
                                ;      with its single reset bit also acts as
                                ;      an 8-counter.
02C1 ED 78        IN      A,(C)           ; (11) read the port - all 16 bits are put on
                                ;      the address bus.  Start VSYNC pulse.
02C3 F6 01        OR      $01             ; (7)  set the rightmost bit so as to ignore
                                ;      the SHIFT key.

;; EACH-LINE
02C5 F6 E0        OR      $E0             ; [7] OR %11100000
02C7 57           LD      D,A             ; [4] transfer to D.
02C8 2F           CPL                     ; [4] complement - only bits 4-0 meaningful now.
02C9 FE 01        CP      $01             ; [7] sets carry if A is zero.
02CB 9F           SBC     A,A             ; [4] $FF if $00 else zero.
02CC B0           OR      B               ; [7] $FF or port FE,FD,FB....
02CD A5           AND     L               ; [4] unless more than one key, L will still be
                                ;     $FF. if more than one key is pressed then A is
                                ;     now invalid.
02CE 6F           LD      L,A             ; [4] transfer to L.

; now consider the column identifier.

02CF 7C           LD      A,H             ; [4] will be $FF if no previous keys.
02D0 A2           AND     D               ; [4] 111xxxxx
02D1 67           LD      H,A             ; [4] transfer A to H

; since only one key may be pressed, H will, if valid, be one of
; 11111110, 11111101, 11111011, 11110111, 11101111
; reading from the outer column, say Q, to the inner column, say T.

02D2 CB 00        RLC     B               ; [8]  rotate the 8-counter/port address.
                                ;      sets carry if more to do.
02D4 ED 78        IN      A,(C)           ; [10] read another half-row.
                                ;      all five bits this time.

02D6 38 ED        JR      C,L02C5         ; [12](7) loop back, until done, to EACH-LINE

;   The last row read is SHIFT,Z,X,C,V  for the second time.

02D8 1F           RRA                     ; (4) test the shift key - carry will be reset
                                ;     if the key is pressed.
02D9 CB 14        RL      H               ; (8) rotate left H picking up the carry giving
                                ;     column values -
                                ;        $FD, $FB, $F7, $EF, $DF.
                                ;     or $FC, $FA, $F6, $EE, $DE if shifted.

;   We now have H identifying the column and L identifying the row in the
;   keyboard matrix.

;   This is a good time to test if this is an American or British machine.
;   The US machine has an extra diode that causes bit 6 of a byte read from
;   a port to be reset.

02DB 17           RLA                     ; (4) compensate for the shift test.
02DC 17           RLA                     ; (4) rotate bit 7 out.
02DD 17           RLA                     ; (4) test bit 6.

02DE 9F           SBC     A,A             ; (4)           $FF or $00 {USA}
02DF E6 18        AND     $18             ; (7)           $18 or $00
02E1 C6 1F        ADD     A,$1F           ; (7)           $37 or $1F

;   result is either 31 (USA) or 55 (UK) blank lines above and below the TV
;   picture.

02E3 32 28 40     LD      ($4028),A       ; (13) update system variable MARGIN

02E6 C9           RET                     ; (10) return

; ------------------------------
; THE 'SET FAST MODE' SUBROUTINE
; ------------------------------
;
;

;; SET-FAST
02E7 FD CB 3B 7E  BIT     7,(IY+$3B)      ; sv CDFLAG
02EB C8           RET     Z               ;

02EC 76           HALT                    ; Wait for Interrupt
02ED D3 FD        OUT     ($FD),A         ;
02EF FD CB 3B BE  RES     7,(IY+$3B)      ; sv CDFLAG
02F3 C9           RET                     ; return.


; --------------
; THE 'REPORT-F'
; --------------

;; REPORT-F
02F4 CF           RST     08H             ; ERROR-1
        DEFB    $0E             ; Error Report: No Program Name supplied.

; --------------------------
; THE 'SAVE COMMAND' ROUTINE
; --------------------------
;
;

;; SAVE
02F6 CD A8 03     CALL    L03A8           ; routine NAME
02F9 38 F9        JR      C,L02F4         ; back with null name to REPORT-F above.

02FB EB           EX      DE,HL           ;
02FC 11 CB 12     LD      DE,$12CB        ; five seconds timing value

;; HEADER
02FF CD 46 0F     CALL    L0F46           ; routine BREAK-1
0302 30 2E        JR      NC,L0332        ; to BREAK-2

;; DELAY-1
0304 10 FE        DJNZ    L0304           ; to DELAY-1

0306 1B           DEC     DE              ;
0307 7A           LD      A,D             ;
0308 B3           OR      E               ;
0309 20 F4        JR      NZ,L02FF        ; back for delay to HEADER

;; OUT-NAME
030B CD 1E 03     CALL    L031E           ; routine OUT-BYTE
030E CB 7E        BIT     7,(HL)          ; test for inverted bit.
0310 23           INC     HL              ; address next character of name.
0311 28 F8        JR      Z,L030B         ; back if not inverted to OUT-NAME

; now start saving the system variables onwards.

0313 21 09 40     LD      HL,$4009        ; set start of area to VERSN thereby
                                ; preserving RAMTOP etc.

;; OUT-PROG
0316 CD 1E 03     CALL    L031E           ; routine OUT-BYTE

0319 CD FC 01     CALL    L01FC           ; routine LOAD/SAVE                     >>
031C 18 F8        JR      L0316           ; loop back to OUT-PROG

; -------------------------
; THE 'OUT-BYTE' SUBROUTINE
; -------------------------
; This subroutine outputs a byte a bit at a time to a domestic tape recorder.

;; OUT-BYTE
031E 5E           LD      E,(HL)          ; fetch byte to be saved.
031F 37           SCF                     ; set carry flag - as a marker.

;; EACH-BIT
0320 CB 13        RL      E               ;  C < 76543210 < C
0322 C8           RET     Z               ; return when the marker bit has passed
                                ; right through.                        >>

0323 9F           SBC     A,A             ; $FF if set bit or $00 with no carry.
0324 E6 05        AND     $05             ; $05               $00
0326 C6 04        ADD     A,$04           ; $09               $04
0328 4F           LD      C,A             ; transfer timer to C. a set bit has a longer
                                ; pulse than a reset bit.

;; PULSES
0329 D3 FF        OUT     ($FF),A         ; pulse to cassette.
032B 06 23        LD      B,$23           ; set timing constant

;; DELAY-2
032D 10 FE        DJNZ    L032D           ; self-loop to DELAY-2

032F CD 46 0F     CALL    L0F46           ; routine BREAK-1 test for BREAK key.

;; BREAK-2
0332 30 72        JR      NC,L03A6        ; forward with break to REPORT-D

0334 06 1E        LD      B,$1E           ; set timing value.

;; DELAY-3
0336 10 FE        DJNZ    L0336           ; self-loop to DELAY-3

0338 0D           DEC     C               ; decrement counter
0339 20 EE        JR      NZ,L0329        ; loop back to PULSES

;; DELAY-4
033B A7           AND     A               ; clear carry for next bit test.
033C 10 FD        DJNZ    L033B           ; self loop to DELAY-4 (B is zero - 256)

033E 18 E0        JR      L0320           ; loop back to EACH-BIT

; --------------------------
; THE 'LOAD COMMAND' ROUTINE
; --------------------------
;
;

;; LOAD
0340 CD A8 03     CALL    L03A8           ; routine NAME

; DE points to start of name in RAM.

0343 CB 12        RL      D               ; pick up carry
0345 CB 0A        RRC     D               ; carry now in bit 7.

;; NEXT-PROG
0347 CD 4C 03     CALL    L034C           ; routine IN-BYTE
034A 18 FB        JR      L0347           ; loop to NEXT-PROG

; ------------------------
; THE 'IN-BYTE' SUBROUTINE
; ------------------------

;; IN-BYTE
034C 0E 01        LD      C,$01           ; prepare an eight counter 00000001.

;; NEXT-BIT
034E 06 00        LD      B,$00           ; set counter to 256

;; BREAK-3
0350 3E 7F        LD      A,$7F           ; read the keyboard row
0352 DB FE        IN      A,($FE)         ; with the SPACE key.

0354 D3 FF        OUT     ($FF),A         ; output signal to screen.

0356 1F           RRA                     ; test for SPACE pressed.
0357 30 49        JR      NC,L03A2        ; forward if so to BREAK-4

0359 17           RLA                     ; reverse above rotation
035A 17           RLA                     ; test tape bit.
035B 38 28        JR      C,L0385         ; forward if set to GET-BIT

035D 10 F1        DJNZ    L0350           ; loop back to BREAK-3

035F F1           POP     AF              ; drop the return address.
0360 BA           CP      D               ; ugh.

;; RESTART
0361 D2 E5 03     JP      NC,L03E5        ; jump forward to INITIAL if D is zero
                                ; to reset the system
                                ; if the tape signal has timed out for example
                                ; if the tape is stopped. Not just a simple
                                ; report as some system variables will have
                                ; been overwritten.

0364 62           LD      H,D             ; else transfer the start of name
0365 6B           LD      L,E             ; to the HL register

;; IN-NAME
0366 CD 4C 03     CALL    L034C           ; routine IN-BYTE is sort of recursion for name
                                ; part. received byte in C.
0369 CB 7A        BIT     7,D             ; is name the null string ?
036B 79           LD      A,C             ; transfer byte to A.
036C 20 03        JR      NZ,L0371        ; forward with null string to MATCHING

036E BE           CP      (HL)            ; else compare with string in memory.
036F 20 D6        JR      NZ,L0347        ; back with mis-match to NEXT-PROG
                                ; (seemingly out of subroutine but return
                                ; address has been dropped).


;; MATCHING
0371 23           INC     HL              ; address next character of name
0372 17           RLA                     ; test for inverted bit.
0373 30 F1        JR      NC,L0366        ; back if not to IN-NAME

; the name has been matched in full.
; proceed to load the data but first increment the high byte of E_LINE, which
; is one of the system variables to be loaded in. Since the low byte is loaded
; before the high byte, it is possible that, at the in-between stage, a false
; value could cause the load to end prematurely - see  LOAD/SAVE check.

0375 FD 34 15     INC     (IY+$15)        ; increment system variable E_LINE_hi.
0378 21 09 40     LD      HL,$4009        ; start loading at system variable VERSN.

;; IN-PROG
037B 50           LD      D,B             ; set D to zero as indicator.
037C CD 4C 03     CALL    L034C           ; routine IN-BYTE loads a byte
037F 71           LD      (HL),C          ; insert assembled byte in memory.
0380 CD FC 01     CALL    L01FC           ; routine LOAD/SAVE                     >>
0383 18 F6        JR      L037B           ; loop back to IN-PROG

; ---

; this branch assembles a full byte before exiting normally
; from the IN-BYTE subroutine.

;; GET-BIT
0385 D5           PUSH    DE              ; save the
0386 1E 94        LD      E,$94           ; timing value.

;; TRAILER
0388 06 1A        LD      B,$1A           ; counter to twenty six.

;; COUNTER
038A 1D           DEC     E               ; decrement the measuring timer.
038B DB FE        IN      A,($FE)         ; read the
038D 17           RLA                     ;
038E CB 7B        BIT     7,E             ;
0390 7B           LD      A,E             ;
0391 38 F5        JR      C,L0388         ; loop back with carry to TRAILER

0393 10 F5        DJNZ    L038A           ; to COUNTER

0395 D1           POP     DE              ;
0396 20 04        JR      NZ,L039C        ; to BIT-DONE

0398 FE 56        CP      $56             ;
039A 30 B2        JR      NC,L034E        ; to NEXT-BIT

;; BIT-DONE
039C 3F           CCF                     ; complement carry flag
039D CB 11        RL      C               ;
039F 30 AD        JR      NC,L034E        ; to NEXT-BIT

03A1 C9           RET                     ; return with full byte.

; ---

; if break is pressed while loading data then perform a reset.
; if break pressed while waiting for program on tape then OK to break.

;; BREAK-4
03A2 7A           LD      A,D             ; transfer indicator to A.
03A3 A7           AND     A               ; test for zero.
03A4 28 BB        JR      Z,L0361         ; back if so to RESTART


;; REPORT-D
03A6 CF           RST     08H             ; ERROR-1
        DEFB    $0C             ; Error Report: BREAK - CONT repeats

; -----------------------------
; THE 'PROGRAM NAME' SUBROUTINE
; -----------------------------
;
;

;; NAME
03A8 CD 55 0F     CALL    L0F55           ; routine SCANNING
03AB 3A 01 40     LD      A,($4001)       ; sv FLAGS
03AE 87           ADD     A,A             ;
03AF FA 9A 0D     JP      M,L0D9A         ; to REPORT-C

03B2 E1           POP     HL              ;
03B3 D0           RET     NC              ;

03B4 E5           PUSH    HL              ;
03B5 CD E7 02     CALL    L02E7           ; routine SET-FAST
03B8 CD F8 13     CALL    L13F8           ; routine STK-FETCH
03BB 62           LD      H,D             ;
03BC 6B           LD      L,E             ;
03BD 0D           DEC     C               ;
03BE F8           RET     M               ;

03BF 09           ADD     HL,BC           ;
03C0 CB FE        SET     7,(HL)          ;
03C2 C9           RET                     ;

; -------------------------
; THE 'NEW' COMMAND ROUTINE
; -------------------------
;
;

;; NEW
03C3 CD E7 02     CALL    L02E7           ; routine SET-FAST
03C6 ED 4B 04 40  LD      BC,($4004)      ; fetch value of system variable RAMTOP
03CA 0B           DEC     BC              ; point to last system byte.

; -----------------------
; THE 'RAM CHECK' ROUTINE
; -----------------------
;
;

;; RAM-CHECK
03CB 60           LD      H,B             ;
03CC 69           LD      L,C             ;
03CD 3E 3F        LD      A,$3F           ;

;; RAM-FILL
03CF 36 02        LD      (HL),$02        ;
03D1 2B           DEC     HL              ;
03D2 BC           CP      H               ;
03D3 20 FA        JR      NZ,L03CF        ; to RAM-FILL

;; RAM-READ
03D5 A7           AND     A               ;
03D6 ED 42        SBC     HL,BC           ;
03D8 09           ADD     HL,BC           ;
03D9 23           INC     HL              ;
03DA 30 06        JR      NC,L03E2        ; to SET-TOP

03DC 35           DEC     (HL)            ;
03DD 28 03        JR      Z,L03E2         ; to SET-TOP

03DF 35           DEC     (HL)            ;
03E0 28 F3        JR      Z,L03D5         ; to RAM-READ

;; SET-TOP
03E2 22 04 40     LD      ($4004),HL      ; set system variable RAMTOP to first byte
                                ; above the BASIC system area.

; ----------------------------
; THE 'INITIALIZATION' ROUTINE
; ----------------------------
;
;

;; INITIAL
03E5 2A 04 40     LD      HL,($4004)      ; fetch system variable RAMTOP.
03E8 2B           DEC     HL              ; point to last system byte.
03E9 36 3E        LD      (HL),$3E        ; make GO SUB end-marker $3E - too high for
                                ; high order byte of line number.
                                ; (was $3F on ZX80)
03EB 2B           DEC     HL              ; point to unimportant low-order byte.
03EC F9           LD      SP,HL           ; and initialize the stack-pointer to this
                                ; location.
03ED 2B           DEC     HL              ; point to first location on the machine stack
03EE 2B           DEC     HL              ; which will be filled by next CALL/PUSH.
03EF 22 02 40     LD      ($4002),HL      ; set the error stack pointer ERR_SP to
                                ; the base of the now empty machine stack.

; Now set the I register so that the video hardware knows where to find the
; character set. This ROM only uses the character set when printing to
; the ZX Printer. The TV picture is formed by the external video hardware.
; Consider also, that this 8K ROM can be retro-fitted to the ZX80 instead of
; its original 4K ROM so the video hardware could be on the ZX80.

03F2 3E 1E        LD      A,$1E           ; address for this ROM is $1E00.
03F4 ED 47        LD      I,A             ; set I register from A.
03F6 ED 56        IM      1               ; select Z80 Interrupt Mode 1.

03F8 FD 21 00 40  LD      IY,$4000        ; set IY to the start of RAM so that the
                                ; system variables can be indexed.
03FC FD 36 3B 40  LD      (IY+$3B),$40    ; set CDFLAG 0100 0000. Bit 6 indicates
                                ; Compute nad Display required.

0400 21 7D 40     LD      HL,$407D        ; The first location after System Variables -
                                ; 16509 decimal.
0403 22 0C 40     LD      ($400C),HL      ; set system variable D_FILE to this value.
0406 06 19        LD      B,$19           ; prepare minimal screen of 24 NEWLINEs
                                ; following an initial NEWLINE.

;; LINE
0408 36 76        LD      (HL),$76        ; insert NEWLINE (HALT instruction)
040A 23           INC     HL              ; point to next location.
040B 10 FB        DJNZ    L0408           ; loop back for all twenty five to LINE

040D 22 10 40     LD      ($4010),HL      ; set system variable VARS to next location

0410 CD 9A 14     CALL    L149A           ; routine CLEAR sets $80 end-marker and the
                                ; dynamic memory pointers E_LINE, STKBOT and
                                ; STKEND.

;; N/L-ONLY
0413 CD AD 14     CALL    L14AD           ; routine CURSOR-IN inserts the cursor and
                                ; end-marker in the Edit Line also setting
                                ; size of lower display to two lines.

0416 CD 07 02     CALL    L0207           ; routine SLOW/FAST selects COMPUTE and DISPLAY

; ---------------------------
; THE 'BASIC LISTING' SECTION
; ---------------------------
;
;

;; UPPER
0419 CD 2A 0A     CALL    L0A2A           ; routine CLS
041C 2A 0A 40     LD      HL,($400A)      ; sv E_PPC_lo
041F ED 5B 23 40  LD      DE,($4023)      ; sv S_TOP_lo
0423 A7           AND     A               ;
0424 ED 52        SBC     HL,DE           ;
0426 EB           EX      DE,HL           ;
0427 30 04        JR      NC,L042D        ; to ADDR-TOP

0429 19           ADD     HL,DE           ;
042A 22 23 40     LD      ($4023),HL      ; sv S_TOP_lo

;; ADDR-TOP
042D CD D8 09     CALL    L09D8           ; routine LINE-ADDR
0430 28 01        JR      Z,L0433         ; to LIST-TOP

0432 EB           EX      DE,HL           ;

;; LIST-TOP
0433 CD 3E 07     CALL    L073E           ; routine LIST-PROG
0436 FD 35 1E     DEC     (IY+$1E)        ; sv BERG
0439 20 37        JR      NZ,L0472        ; to LOWER

043B 2A 0A 40     LD      HL,($400A)      ; sv E_PPC_lo
043E CD D8 09     CALL    L09D8           ; routine LINE-ADDR
0441 2A 16 40     LD      HL,($4016)      ; sv CH_ADD_lo
0444 37           SCF                     ; Set Carry Flag
0445 ED 52        SBC     HL,DE           ;
0447 21 23 40     LD      HL,$4023        ; sv S_TOP_lo
044A 30 0B        JR      NC,L0457        ; to INC-LINE

044C EB           EX      DE,HL           ;
044D 7E           LD      A,(HL)          ;
044E 23           INC     HL              ;
044F ED A0        LDI                     ;
0451 12           LD      (DE),A          ;
0452 18 C5        JR       L0419          ; to UPPER

; ---

;; DOWN-KEY
0454    LD      HL,$400A        ; sv E_PPC_lo

;; INC-LINE
0457 5E           LD      E,(HL)          ;
0458 23           INC     HL              ;
0459 56           LD      D,(HL)          ;
045A E5           PUSH    HL              ;
045B EB           EX      DE,HL           ;
045C 23           INC     HL              ;
045D CD D8 09     CALL    L09D8           ; routine LINE-ADDR
0460 CD BB 05     CALL    L05BB           ; routine LINE-NO
0463 E1           POP     HL              ;

;; KEY-INPUT
0464 FD CB 2D 6E  BIT     5,(IY+$2D)      ; sv FLAGX
0468 20 08        JR      NZ,L0472        ; forward to LOWER

046A 72           LD      (HL),D          ;
046B 2B           DEC     HL              ;
046C 73           LD      (HL),E          ;
046D 18 AA        JR      L0419           ; to UPPER

; ----------------------------
; THE 'EDIT LINE COPY' SECTION
; ----------------------------
; This routine sets the edit line to just the cursor when
; 1) There is not enough memory to edit a BASIC line.
; 2) The edit key is used during input.
; The entry point LOWER


;; EDIT-INP
046F    CALL    L14AD           ; routine CURSOR-IN sets cursor only edit line.

; ->

;; LOWER
0472 2A 14 40     LD      HL,($4014)      ; fetch edit line start from E_LINE.

;; EACH-CHAR
0475 7E           LD      A,(HL)          ; fetch a character from edit line.
0476 FE 7E        CP      $7E             ; compare to the number marker.
0478 20 08        JR      NZ,L0482        ; forward if not to END-LINE

047A 01 06 00     LD      BC,$0006        ; else six invisible bytes to be removed.
047D CD 60 0A     CALL    L0A60           ; routine RECLAIM-2
0480 18 F3        JR      L0475           ; back to EACH-CHAR

; ---

;; END-LINE
0482 FE 76        CP      $76             ;
0484 23           INC     HL              ;
0485 20 EE        JR      NZ,L0475        ; to EACH-CHAR

;; EDIT-LINE
0487 CD 37 05     CALL    L0537           ; routine CURSOR sets cursor K or L.

;; EDIT-ROOM
048A CD 1F 0A     CALL    L0A1F           ; routine LINE-ENDS
048D 2A 14 40     LD      HL,($4014)      ; sv E_LINE_lo
0490 FD 36 00 FF  LD      (IY+$00),$FF    ; sv ERR_NR
0494 CD 66 07     CALL    L0766           ; routine COPY-LINE
0497 FD CB 00 7E  BIT     7,(IY+$00)      ; sv ERR_NR
049B 20 24        JR      NZ,L04C1        ; to DISPLAY-6

049D 3A 22 40     LD      A,($4022)       ; sv DF_SZ
04A0 FE 18        CP      $18             ;
04A2 30 1D        JR      NC,L04C1        ; to DISPLAY-6

04A4 3C           INC     A               ;
04A5 32 22 40     LD      ($4022),A       ; sv DF_SZ
04A8 47           LD      B,A             ;
04A9 0E 01        LD      C,$01           ;
04AB CD 18 09     CALL    L0918           ; routine LOC-ADDR
04AE 54           LD      D,H             ;
04AF 5D           LD      E,L             ;
04B0 7E           LD      A,(HL)          ;

;; FREE-LINE
04B1 2B           DEC     HL              ;
04B2 BE           CP      (HL)            ;
04B3 20 FC        JR      NZ,L04B1        ; to FREE-LINE

04B5 23           INC     HL              ;
04B6 EB           EX      DE,HL           ;
04B7 3A 05 40     LD      A,($4005)       ; sv RAMTOP_hi
04BA FE 4D        CP      $4D             ;
04BC DC 5D 0A     CALL    C,L0A5D         ; routine RECLAIM-1
04BF 18 C9        JR      L048A           ; to EDIT-ROOM

; --------------------------
; THE 'WAIT FOR KEY' SECTION
; --------------------------
;
;

;; DISPLAY-6
04C1 21 00 00     LD      HL,$0000        ;
04C4 22 18 40     LD      ($4018),HL      ; sv X_PTR_lo

04C7 21 3B 40     LD      HL,$403B        ; system variable CDFLAG
04CA CB 7E        BIT     7,(HL)          ;

04CC CC 29 02     CALL    Z,L0229         ; routine DISPLAY-1

;; SLOW-DISP
04CF CB 46        BIT     0,(HL)          ;
04D1 28 FC        JR      Z,L04CF         ; to SLOW-DISP

04D3 ED 4B 25 40  LD      BC,($4025)      ; sv LAST_K
04D7 CD 4B 0F     CALL    L0F4B           ; routine DEBOUNCE
04DA CD BD 07     CALL    L07BD           ; routine DECODE

04DD 30 93        JR      NC,L0472        ; back to LOWER

; -------------------------------
; THE 'KEYBOARD DECODING' SECTION
; -------------------------------
;   The decoded key value is in E and HL points to the position in the
;   key table. D contains zero.

;; K-DECODE
04DF 3A 06 40     LD      A,($4006)       ; Fetch value of system variable MODE
04E2 3D           DEC     A               ; test the three values together

04E3 FA 08 05     JP      M,L0508         ; forward, if was zero, to FETCH-2

04E6 20 0F        JR      NZ,L04F7        ; forward, if was 2, to FETCH-1

;   The original value was one and is now zero.

04E8 32 06 40     LD      ($4006),A       ; update the system variable MODE

04EB 1D           DEC     E               ; reduce E to range $00 - $7F
04EC 7B           LD      A,E             ; place in A
04ED D6 27        SUB     $27             ; subtract 39 setting carry if range 00 - 38
04EF 38 01        JR      C,L04F2         ; forward, if so, to FUNC-BASE

04F1 5F           LD      E,A             ; else set E to reduced value

;; FUNC-BASE
04F2 21 CC 00     LD      HL,L00CC        ; address of K-FUNCT table for function keys.
04F5 18 0E        JR      L0505           ; forward to TABLE-ADD

; ---

;; FETCH-1
04F7 7E           LD      A,(HL)          ;
04F8 FE 76        CP      $76             ;
04FA 28 2F        JR      Z,L052B         ; to K/L-KEY

04FC FE 40        CP      $40             ;
04FE CB FF        SET     7,A             ;
0500 38 19        JR      C,L051B         ; to ENTER

0502 21 C7 00     LD      HL,$00C7        ; (expr reqd)

;; TABLE-ADD
0505 19           ADD     HL,DE           ;
0506 18 0D        JR      L0515           ; to FETCH-3

; ---

;; FETCH-2
0508 7E           LD      A,(HL)          ;
0509 FD CB 01 56  BIT     2,(IY+$01)      ; sv FLAGS  - K or L mode ?
050D 20 07        JR      NZ,L0516        ; to TEST-CURS

050F C6 C0        ADD     A,$C0           ;
0511 FE E6        CP      $E6             ;
0513 30 01        JR      NC,L0516        ; to TEST-CURS

;; FETCH-3
0515 7E           LD      A,(HL)          ;

;; TEST-CURS
0516 FE F0        CP      $F0             ;
0518 EA 2D 05     JP      PE,L052D        ; to KEY-SORT

;; ENTER
051B 5F           LD      E,A             ;
051C CD 37 05     CALL    L0537           ; routine CURSOR

051F 7B           LD      A,E             ;
0520 CD 26 05     CALL    L0526           ; routine ADD-CHAR

;; BACK-NEXT
0523 C3 72 04     JP      L0472           ; back to LOWER

; ------------------------------
; THE 'ADD CHARACTER' SUBROUTINE
; ------------------------------
;
;

;; ADD-CHAR
0526 CD 9B 09     CALL    L099B           ; routine ONE-SPACE
0529 12           LD      (DE),A          ;
052A C9           RET                     ;

; -------------------------
; THE 'CURSOR KEYS' ROUTINE
; -------------------------
;
;

;; K/L-KEY
052B 3E 78        LD      A,$78           ;

;; KEY-SORT
052D 5F           LD      E,A             ;
052E 21 82 04     LD      HL,$0482        ; base address of ED-KEYS (exp reqd)
0531 19           ADD     HL,DE           ;
0532 19           ADD     HL,DE           ;
0533 4E           LD      C,(HL)          ;
0534 23           INC     HL              ;
0535 46           LD      B,(HL)          ;
0536 C5           PUSH    BC              ;

;; CURSOR
0537 2A 14 40     LD      HL,($4014)      ; sv E_LINE_lo
053A FD CB 2D 6E  BIT     5,(IY+$2D)      ; sv FLAGX
053E 20 16        JR      NZ,L0556        ; to L-MODE

;; K-MODE
0540 FD CB 01 96  RES     2,(IY+$01)      ; sv FLAGS  - Signal use K mode

;; TEST-CHAR
0544 7E           LD      A,(HL)          ;
0545 FE 7F        CP      $7F             ;
0547 C8           RET     Z               ; return

0548 23           INC     HL              ;
0549 CD B4 07     CALL    L07B4           ; routine NUMBER
054C 28 F6        JR      Z,L0544         ; to TEST-CHAR

054E FE 26        CP      $26             ;
0550 38 F2        JR      C,L0544         ; to TEST-CHAR

0552 FE DE        CP      $DE             ;
0554 28 EA        JR      Z,L0540         ; to K-MODE

;; L-MODE
0556 FD CB 01 D6  SET     2,(IY+$01)      ; sv FLAGS  - Signal use L mode
055A 18 E8        JR      L0544           ; to TEST-CHAR

; --------------------------
; THE 'CLEAR-ONE' SUBROUTINE
; --------------------------
;
;

;; CLEAR-ONE
055C 01 01 00     LD      BC,$0001        ;
055F C3 60 0A     JP      L0A60           ; to RECLAIM-2



; ------------------------
; THE 'EDITING KEYS' TABLE
; ------------------------
;
;

;; ED-KEYS
0562    DEFW    L059F           ; Address: $059F; Address: UP-KEY
        DEFW    L0454           ; Address: $0454; Address: DOWN-KEY
        DEFW    L0576           ; Address: $0576; Address: LEFT-KEY
        DEFW    L057F           ; Address: $057F; Address: RIGHT-KEY
        DEFW    L05AF           ; Address: $05AF; Address: FUNCTION
        DEFW    L05C4           ; Address: $05C4; Address: EDIT-KEY
        DEFW    L060C           ; Address: $060C; Address: N/L-KEY
        DEFW    L058B           ; Address: $058B; Address: RUBOUT
        DEFW    L05AF           ; Address: $05AF; Address: FUNCTION
        DEFW    L05AF           ; Address: $05AF; Address: FUNCTION


; -------------------------
; THE 'CURSOR LEFT' ROUTINE
; -------------------------
;
;

;; LEFT-KEY
0576 CD 93 05     CALL    L0593           ; routine LEFT-EDGE
0579 7E           LD      A,(HL)          ;
057A 36 7F        LD      (HL),$7F        ;
057C 23           INC     HL              ;
057D 18 09        JR      L0588           ; to GET-CODE

; --------------------------
; THE 'CURSOR RIGHT' ROUTINE
; --------------------------
;
;

;; RIGHT-KEY
057F 23           INC     HL              ;
0580 7E           LD      A,(HL)          ;
0581 FE 76        CP      $76             ;
0583 28 18        JR      Z,L059D         ; to ENDED-2

0585 36 7F        LD      (HL),$7F        ;
0587 2B           DEC     HL              ;

;; GET-CODE
0588 77           LD      (HL),A          ;

;; ENDED-1
0589 18 98        JR      L0523           ; to BACK-NEXT

; --------------------
; THE 'RUBOUT' ROUTINE
; --------------------
;
;

;; RUBOUT
058B CD 93 05     CALL    L0593           ; routine LEFT-EDGE
058E CD 5C 05     CALL    L055C           ; routine CLEAR-ONE
0591 18 F6        JR      L0589           ; to ENDED-1

; ------------------------
; THE 'ED-EDGE' SUBROUTINE
; ------------------------
;
;

;; LEFT-EDGE
0593 2B           DEC     HL              ;
0594 ED 5B 14 40  LD      DE,($4014)      ; sv E_LINE_lo
0598 1A           LD      A,(DE)          ;
0599 FE 7F        CP      $7F             ;
059B C0           RET     NZ              ;

059C D1           POP     DE              ;

;; ENDED-2
059D 18 EA        JR      L0589           ; to ENDED-1

; -----------------------
; THE 'CURSOR UP' ROUTINE
; -----------------------
;
;

;; UP-KEY
059F 2A 0A 40     LD      HL,($400A)      ; sv E_PPC_lo
05A2 CD D8 09     CALL    L09D8           ; routine LINE-ADDR
05A5 EB           EX      DE,HL           ;
05A6 CD BB 05     CALL    L05BB           ; routine LINE-NO
05A9 21 0B 40     LD      HL,$400B        ; point to system variable E_PPC_hi
05AC C3 64 04     JP      L0464           ; jump back to KEY-INPUT

; --------------------------
; THE 'FUNCTION KEY' ROUTINE
; --------------------------
;
;

;; FUNCTION
05AF 7B           LD      A,E             ;
05B0 E6 07        AND     $07             ;
05B2 32 06 40     LD      ($4006),A       ; sv MODE
05B5 18 E6        JR      L059D           ; back to ENDED-2

; ------------------------------------
; THE 'COLLECT LINE NUMBER' SUBROUTINE
; ------------------------------------
;
;

;; ZERO-DE
05B7 EB           EX      DE,HL           ;
05B8 11 C2 04     LD      DE,L04C1 + 1    ; $04C2 - a location addressing two zeros.

; ->

;; LINE-NO
05BB 7E           LD      A,(HL)          ;
05BC E6 C0        AND     $C0             ;
05BE 20 F7        JR      NZ,L05B7        ; to ZERO-DE

05C0 56           LD      D,(HL)          ;
05C1 23           INC     HL              ;
05C2 5E           LD      E,(HL)          ;
05C3 C9           RET                     ;

; ----------------------
; THE 'EDIT KEY' ROUTINE
; ----------------------
;
;

;; EDIT-KEY
05C4 CD 1F 0A     CALL    L0A1F           ; routine LINE-ENDS clears lower display.

05C7 21 6F 04     LD      HL,L046F        ; Address: EDIT-INP
05CA E5           PUSH    HL              ; ** is pushed as an error looping address.

05CB FD CB 2D 6E  BIT     5,(IY+$2D)      ; test FLAGX
05CF C0           RET     NZ              ; indirect jump if in input mode
                                ; to L046F, EDIT-INP (begin again).

;

05D0 2A 14 40     LD      HL,($4014)      ; fetch E_LINE
05D3 22 0E 40     LD      ($400E),HL      ; and use to update the screen cursor DF_CC

; so now RST $10 will print the line numbers to the edit line instead of screen.
; first make sure that no newline/out of screen can occur while sprinting the
; line numbers to the edit line.

05D6 21 21 18     LD      HL,$1821        ; prepare line 0, column 0.
05D9 22 39 40     LD      ($4039),HL      ; update S_POSN with these dummy values.

05DC 2A 0A 40     LD      HL,($400A)      ; fetch current line from E_PPC may be a
                                ; non-existent line e.g. last line deleted.
05DF CD D8 09     CALL    L09D8           ; routine LINE-ADDR gets address or that of
                                ; the following line.
05E2 CD BB 05     CALL    L05BB           ; routine LINE-NO gets line number if any in DE
                                ; leaving HL pointing at second low byte.

05E5 7A           LD      A,D             ; test the line number for zero.
05E6 B3           OR      E               ;
05E7 C8           RET     Z               ; return if no line number - no program to edit.

05E8 2B           DEC     HL              ; point to high byte.
05E9 CD A5 0A     CALL    L0AA5           ; routine OUT-NO writes number to edit line.

05EC 23           INC     HL              ; point to length bytes.
05ED 4E           LD      C,(HL)          ; low byte to C.
05EE 23           INC     HL              ;
05EF 46           LD      B,(HL)          ; high byte to B.

05F0 23           INC     HL              ; point to first character in line.
05F1 ED 5B 0E 40  LD      DE,($400E)      ; fetch display file cursor DF_CC

05F5 3E 7F        LD      A,$7F           ; prepare the cursor character.
05F7 12           LD      (DE),A          ; and insert in edit line.
05F8 13           INC     DE              ; increment intended destination.

05F9 E5           PUSH    HL              ; * save start of BASIC.

05FA 21 1D 00     LD      HL,$001D        ; set an overhead of 29 bytes.
05FD 19           ADD     HL,DE           ; add in the address of cursor.
05FE 09           ADD     HL,BC           ; add the length of the line.
05FF ED 72        SBC     HL,SP           ; subtract the stack pointer.

0601 E1           POP     HL              ; * restore pointer to start of BASIC.

0602 D0           RET     NC              ; return if not enough room to L046F EDIT-INP.
                                ; the edit key appears not to work.

0603 ED B0        LDIR                    ; else copy bytes from program to edit line.
                                ; Note. hidden floating point forms are also
                                ; copied to edit line.

0605 EB           EX      DE,HL           ; transfer free location pointer to HL

0606 D1           POP     DE              ; ** remove address EDIT-INP from stack.

0607 CD A6 14     CALL    L14A6           ; routine SET-STK-B sets STKEND from HL.

060A 18 91        JR      L059D           ; back to ENDED-2 and after 3 more jumps
                                ; to L0472, LOWER.
                                ; Note. The LOWER routine removes the hidden
                                ; floating-point numbers from the edit line.

; -------------------------
; THE 'NEWLINE KEY' ROUTINE
; -------------------------
;
;

;; N/L-KEY
060C CD 1F 0A     CALL    L0A1F           ; routine LINE-ENDS

060F 21 72 04     LD      HL,L0472        ; prepare address: LOWER

0612 FD CB 2D 6E  BIT     5,(IY+$2D)      ; sv FLAGX
0616 20 11        JR      NZ,L0629        ; to NOW-SCAN

0618 2A 14 40     LD      HL,($4014)      ; sv E_LINE_lo
061B 7E           LD      A,(HL)          ;
061C FE FF        CP      $FF             ;
061E 28 06        JR      Z,L0626         ; to STK-UPPER

0620 CD E2 08     CALL    L08E2           ; routine CLEAR-PRB
0623 CD 2A 0A     CALL    L0A2A           ; routine CLS

;; STK-UPPER
0626 21 19 04     LD      HL,L0419        ; Address: UPPER

;; NOW-SCAN
0629 E5           PUSH    HL              ; push routine address (LOWER or UPPER).
062A CD BA 0C     CALL    L0CBA           ; routine LINE-SCAN
062D E1           POP     HL              ;
062E CD 37 05     CALL    L0537           ; routine CURSOR
0631 CD 5C 05     CALL    L055C           ; routine CLEAR-ONE
0634 CD 73 0A     CALL    L0A73           ; routine E-LINE-NO
0637 20 15        JR      NZ,L064E        ; to N/L-INP

0639 78           LD      A,B             ;
063A B1           OR      C               ;
063B C2 E0 06     JP      NZ,L06E0        ; to N/L-LINE

063E 0B           DEC     BC              ;
063F 0B           DEC     BC              ;
0640 ED 43 07 40  LD      ($4007),BC      ; sv PPC_lo
0644 FD 36 22 02  LD      (IY+$22),$02    ; sv DF_SZ
0648 ED 5B 0C 40  LD      DE,($400C)      ; sv D_FILE_lo

064C 18 13        JR      L0661           ; forward to TEST-NULL

; ---

;; N/L-INP
064E FE 76        CP      $76             ;
0650 28 12        JR      Z,L0664         ; to N/L-NULL

0652 ED 4B 30 40  LD      BC,($4030)      ; sv T_ADDR_lo
0656 CD 18 09     CALL    L0918           ; routine LOC-ADDR
0659 ED 5B 29 40  LD      DE,($4029)      ; sv NXTLIN_lo
065D FD 36 22 02  LD      (IY+$22),$02    ; sv DF_SZ

;; TEST-NULL
0661 DF           RST     18H             ; GET-CHAR
0662 FE 76        CP      $76             ;

;; N/L-NULL
0664 CA 13 04     JP      Z,L0413         ; to N/L-ONLY

0667 FD 36 01 80  LD      (IY+$01),$80    ; sv FLAGS
066B EB           EX      DE,HL           ;

;; NEXT-LINE
066C 22 29 40     LD      ($4029),HL      ; sv NXTLIN_lo
066F EB           EX      DE,HL           ;
0670 CD 4D 00     CALL    L004D           ; routine TEMP-PTR-2
0673 CD C1 0C     CALL    L0CC1           ; routine LINE-RUN
0676 FD CB 01 8E  RES     1,(IY+$01)      ; sv FLAGS  - Signal printer not in use
067A 3E C0        LD      A,$C0           ;
067C FD 77 19     LD      (IY+$19),A      ; sv X_PTR_lo
067F CD A3 14     CALL    L14A3           ; routine X-TEMP
0682 FD CB 2D AE  RES     5,(IY+$2D)      ; sv FLAGX
0686 FD CB 00 7E  BIT     7,(IY+$00)      ; sv ERR_NR
068A 28 22        JR      Z,L06AE         ; to STOP-LINE

068C 2A 29 40     LD      HL,($4029)      ; sv NXTLIN_lo
068F A6           AND     (HL)            ;
0690 20 1C        JR       NZ,L06AE       ; to STOP-LINE

0692 56           LD      D,(HL)          ;
0693 23           INC     HL              ;
0694 5E           LD      E,(HL)          ;
0695 ED 53 07 40  LD      ($4007),DE      ; sv PPC_lo
0699 23           INC     HL              ;
069A 5E           LD      E,(HL)          ;
069B 23           INC     HL              ;
069C 56           LD      D,(HL)          ;
069D 23           INC     HL              ;
069E EB           EX      DE,HL           ;
069F 19           ADD     HL,DE           ;
06A0 CD 46 0F     CALL    L0F46           ; routine BREAK-1
06A3 38 C7        JR      C,L066C         ; to NEXT-LINE

06A5 21 00 40     LD      HL,$4000        ; sv ERR_NR
06A8 CB 7E        BIT     7,(HL)          ;
06AA 28 02        JR      Z,L06AE         ; to STOP-LINE

06AC 36 0C        LD      (HL),$0C        ;

;; STOP-LINE
06AE FD CB 38 7E  BIT     7,(IY+$38)      ; sv PR_CC
06B2 CC 71 08     CALL    Z,L0871         ; routine COPY-BUFF
06B5 01 21 01     LD      BC,$0121        ;
06B8 CD 18 09     CALL    L0918           ; routine LOC-ADDR
06BB 3A 00 40     LD      A,($4000)       ; sv ERR_NR
06BE ED 4B 07 40  LD      BC,($4007)      ; sv PPC_lo
06C2 3C           INC     A               ;
06C3 28 0C        JR      Z,L06D1         ; to REPORT

06C5 FE 09        CP      $09             ;
06C7 20 01        JR      NZ,L06CA        ; to CONTINUE

06C9 03           INC     BC              ;

;; CONTINUE
06CA ED 43 2B 40  LD      ($402B),BC      ; sv OLDPPC_lo
06CE 20 01        JR      NZ,L06D1        ; to REPORT

06D0 0B           DEC     BC              ;

;; REPORT
06D1 CD EB 07     CALL    L07EB           ; routine OUT-CODE
06D4 3E 18        LD      A,$18           ;

06D6 D7           RST     10H             ; PRINT-A
06D7 CD 98 0A     CALL    L0A98           ; routine OUT-NUM
06DA CD AD 14     CALL    L14AD           ; routine CURSOR-IN
06DD C3 C1 04     JP      L04C1           ; to DISPLAY-6

; ---

;; N/L-LINE
06E0 ED 43 0A 40  LD      ($400A),BC      ; sv E_PPC_lo
06E4 2A 16 40     LD      HL,($4016)      ; sv CH_ADD_lo
06E7 EB           EX      DE,HL           ;
06E8 21 13 04     LD      HL,L0413        ; Address: N/L-ONLY
06EB E5           PUSH    HL              ;
06EC 2A 1A 40     LD      HL,($401A)      ; sv STKBOT_lo
06EF ED 52        SBC     HL,DE           ;
06F1 E5           PUSH    HL              ;
06F2 C5           PUSH    BC              ;
06F3 CD E7 02     CALL    L02E7           ; routine SET-FAST
06F6 CD 2A 0A     CALL    L0A2A           ; routine CLS
06F9 E1           POP     HL              ;
06FA CD D8 09     CALL    L09D8           ; routine LINE-ADDR
06FD 20 06        JR      NZ,L0705        ; to COPY-OVER

06FF CD F2 09     CALL    L09F2           ; routine NEXT-ONE
0702 CD 60 0A     CALL    L0A60           ; routine RECLAIM-2

;; COPY-OVER
0705 C1           POP     BC              ;
0706 79           LD      A,C             ;
0707 3D           DEC     A               ;
0708 B0           OR      B               ;
0709 C8           RET     Z               ;

070A C5           PUSH    BC              ;
070B 03           INC     BC              ;
070C 03           INC     BC              ;
070D 03           INC     BC              ;
070E 03           INC     BC              ;
070F 2B           DEC     HL              ;
0710 CD 9E 09     CALL    L099E           ; routine MAKE-ROOM
0713 CD 07 02     CALL    L0207           ; routine SLOW/FAST
0716 C1           POP     BC              ;
0717 C5           PUSH    BC              ;
0718 13           INC     DE              ;
0719 2A 1A 40     LD      HL,($401A)      ; sv STKBOT_lo
071C 2B           DEC     HL              ;
071D ED B8        LDDR                    ; copy bytes
071F 2A 0A 40     LD      HL,($400A)      ; sv E_PPC_lo
0722 EB           EX      DE,HL           ;
0723 C1           POP     BC              ;
0724 70           LD      (HL),B          ;
0725 2B           DEC     HL              ;
0726 71           LD      (HL),C          ;
0727 2B           DEC     HL              ;
0728 73           LD      (HL),E          ;
0729 2B           DEC     HL              ;
072A 72           LD      (HL),D          ;

072B C9           RET                     ; return.

; ---------------------------------------
; THE 'LIST' AND 'LLIST' COMMAND ROUTINES
; ---------------------------------------
;
;

;; LLIST
072C FD CB 01 CE  SET     1,(IY+$01)      ; sv FLAGS  - signal printer in use

;; LIST
0730 CD A7 0E     CALL    L0EA7           ; routine FIND-INT

0733 78           LD      A,B             ; fetch high byte of user-supplied line number.
0734 E6 3F        AND     $3F             ; and crudely limit to range 1-16383.

0736 67           LD      H,A             ;
0737 69           LD      L,C             ;
0738 22 0A 40     LD      ($400A),HL      ; sv E_PPC_lo
073B CD D8 09     CALL    L09D8           ; routine LINE-ADDR

;; LIST-PROG
073E 1E 00        LD      E,$00           ;

;; UNTIL-END
0740 CD 45 07     CALL    L0745           ; routine OUT-LINE lists one line of BASIC
                                ; making an early return when the screen is
                                ; full or the end of program is reached.    >>
0743 18 FB        JR      L0740           ; loop back to UNTIL-END

; -----------------------------------
; THE 'PRINT A BASIC LINE' SUBROUTINE
; -----------------------------------
;
;

;; OUT-LINE
0745 ED 4B 0A 40  LD      BC,($400A)      ; sv E_PPC_lo
0749 CD EA 09     CALL    L09EA           ; routine CP-LINES
074C 16 92        LD      D,$92           ;
074E 28 05        JR      Z,L0755         ; to TEST-END

0750 11 00 00     LD      DE,$0000        ;
0753 CB 13        RL      E               ;

;; TEST-END
0755 FD 73 1E     LD      (IY+$1E),E      ; sv BERG
0758 7E           LD      A,(HL)          ;
0759 FE 40        CP      $40             ;
075B C1           POP     BC              ;
075C D0           RET     NC              ;

075D C5           PUSH    BC              ;
075E CD A5 0A     CALL    L0AA5           ; routine OUT-NO
0761 23           INC     HL              ;
0762 7A           LD      A,D             ;

0763 D7           RST     10H             ; PRINT-A
0764 23           INC     HL              ;
0765 23           INC     HL              ;

;; COPY-LINE
0766 22 16 40     LD      ($4016),HL      ; sv CH_ADD_lo
0769 FD CB 01 C6  SET     0,(IY+$01)      ; sv FLAGS  - Suppress leading space

;; MORE-LINE
076D ED 4B 18 40  LD      BC,($4018)      ; sv X_PTR_lo
0771 2A 16 40     LD      HL,($4016)      ; sv CH_ADD_lo
0774 A7           AND      A              ;
0775 ED 42        SBC     HL,BC           ;
0777 20 03        JR      NZ,L077C        ; to TEST-NUM

0779 3E B8        LD      A,$B8           ;

077B D7           RST     10H             ; PRINT-A

;; TEST-NUM
077C 2A 16 40     LD      HL,($4016)      ; sv CH_ADD_lo
077F 7E           LD      A,(HL)          ;
0780 23           INC     HL              ;
0781 CD B4 07     CALL    L07B4           ; routine NUMBER
0784 22 16 40     LD      ($4016),HL      ; sv CH_ADD_lo
0787 28 E4        JR      Z,L076D         ; to MORE-LINE

0789 FE 7F        CP      $7F             ;
078B 28 10        JR      Z,L079D         ; to OUT-CURS

078D FE 76        CP      $76             ;
078F 28 5D        JR      Z,L07EE         ; to OUT-CH

0791 CB 77        BIT     6,A             ;
0793 28 05        JR      Z,L079A         ; to NOT-TOKEN

0795 CD 4B 09     CALL    L094B           ; routine TOKENS
0798 18 D3        JR      L076D           ; to MORE-LINE

; ---


;; NOT-TOKEN
079A D7           RST     10H             ; PRINT-A
079B 18 D0        JR      L076D           ; to MORE-LINE

; ---

;; OUT-CURS
079D 3A 06 40     LD      A,($4006)       ; Fetch value of system variable MODE
07A0 06 AB        LD      B,$AB           ; Prepare an inverse [F] for function cursor.

07A2 A7           AND     A               ; Test for zero -
07A3 20 05        JR      NZ,L07AA        ; forward if not to FLAGS-2

07A5 3A 01 40     LD      A,($4001)       ; Fetch system variable FLAGS.
07A8 06 B0        LD      B,$B0           ; Prepare an inverse [K] for keyword cursor.

;; FLAGS-2
07AA 1F           RRA                     ; 00000?00 -> 000000?0
07AB 1F           RRA                     ; 000000?0 -> 0000000?
07AC E6 01        AND     $01             ; 0000000?    0000000x

07AE 80           ADD     A,B             ; Possibly [F] -> [G]  or  [K] -> [L]

07AF CD F5 07     CALL    L07F5           ; routine PRINT-SP prints character
07B2 18 B9        JR      L076D           ; back to MORE-LINE

; -----------------------
; THE 'NUMBER' SUBROUTINE
; -----------------------
;
;

;; NUMBER
07B4 FE 7E        CP      $7E             ;
07B6 C0           RET     NZ              ;

07B7 23           INC     HL              ;
07B8 23           INC     HL              ;
07B9 23           INC     HL              ;
07BA 23           INC     HL              ;
07BB 23           INC     HL              ;
07BC C9           RET                     ;

; --------------------------------
; THE 'KEYBOARD DECODE' SUBROUTINE
; --------------------------------
;
;

;; DECODE
07BD 16 00        LD      D,$00           ;
07BF CB 28        SRA     B               ;
07C1 9F           SBC     A,A             ;
07C2 F6 26        OR      $26             ;
07C4 2E 05        LD      L,$05           ;
07C6 95           SUB     L               ;

;; KEY-LINE
07C7 85           ADD     A,L             ;
07C8 37           SCF                     ; Set Carry Flag
07C9 CB 19        RR      C               ;
07CB 38 FA        JR      C,L07C7         ; to KEY-LINE

07CD 0C           INC     C               ;
07CE C0           RET      NZ             ;

07CF 48           LD      C,B             ;
07D0 2D           DEC     L               ;
07D1 2E 01        LD      L,$01           ;
07D3 20 F2        JR      NZ,L07C7        ; to KEY-LINE

07D5 21 7D 00     LD      HL,$007D        ; (expr reqd)
07D8 5F           LD      E,A             ;
07D9 19           ADD     HL,DE           ;
07DA 37           SCF                     ; Set Carry Flag
07DB C9           RET                     ;

; -------------------------
; THE 'PRINTING' SUBROUTINE
; -------------------------
;
;

;; LEAD-SP
07DC 7B           LD      A,E             ;
07DD A7           AND     A               ;
07DE F8           RET     M               ;

07DF 18 10        JR      L07F1           ; to PRINT-CH

; ---

;; OUT-DIGIT
07E1 AF           XOR     A               ;

;; DIGIT-INC
07E2 09           ADD     HL,BC           ;
07E3 3C           INC     A               ;
07E4 38 FC        JR      C,L07E2         ; to DIGIT-INC

07E6 ED 42        SBC     HL,BC           ;
07E8 3D           DEC     A               ;
07E9 28 F1        JR      Z,L07DC         ; to LEAD-SP

;; OUT-CODE
07EB 1E 1C        LD      E,$1C           ;
07ED 83           ADD     A,E             ;

;; OUT-CH
07EE A7           AND     A               ;
07EF 28 04        JR      Z,L07F5         ; to PRINT-SP

;; PRINT-CH
07F1 FD CB 01 86  RES     0,(IY+$01)      ; update FLAGS - signal leading space permitted

;; PRINT-SP
07F5 D9           EXX                     ;
07F6 E5           PUSH    HL              ;
07F7 FD CB 01 4E  BIT     1,(IY+$01)      ; test FLAGS - is printer in use ?
07FB 20 05        JR      NZ,L0802        ; to LPRINT-A

07FD CD 08 08     CALL    L0808           ; routine ENTER-CH
0800 18 03        JR      L0805           ; to PRINT-EXX

; ---

;; LPRINT-A
0802 CD 51 08     CALL    L0851           ; routine LPRINT-CH

;; PRINT-EXX
0805 E1           POP     HL              ;
0806 D9           EXX                     ;
0807 C9           RET                     ;

; ---

;; ENTER-CH
0808 57           LD      D,A             ;
0809 ED 4B 39 40  LD      BC,($4039)      ; sv S_POSN_x
080D 79           LD      A,C             ;
080E FE 21        CP      $21             ;
0810 28 1A        JR      Z,L082C         ; to TEST-LOW

;; TEST-N/L
0812 3E 76        LD      A,$76           ;
0814 BA           CP      D               ;
0815 28 30        JR      Z,L0847         ; to WRITE-N/L

0817 2A 0E 40     LD      HL,($400E)      ; sv DF_CC_lo
081A BE           CP      (HL)            ;
081B 7A           LD      A,D             ;
081C 20 20        JR      NZ,L083E        ; to WRITE-CH

081E 0D           DEC     C               ;
081F 20 19        JR      NZ,L083A        ; to EXPAND-1

0821 23           INC     HL              ;
0822 22 0E 40     LD       ($400E),HL     ; sv DF_CC_lo
0825 0E 21        LD      C,$21           ;
0827 05           DEC     B               ;
0828 ED 43 39 40  LD      ($4039),BC      ; sv S_POSN_x

;; TEST-LOW
082C 78           LD      A,B             ;
082D FD BE 22     CP      (IY+$22)        ; sv DF_SZ
0830 28 03        JR      Z,L0835         ; to REPORT-5

0832 A7           AND     A               ;
0833 20 DD        JR      NZ,L0812        ; to TEST-N/L

;; REPORT-5
0835 2E 04        LD      L,$04           ; 'No more room on screen'
0837 C3 58 00     JP      L0058           ; to ERROR-3

; ---

;; EXPAND-1
083A CD 9B 09     CALL    L099B           ; routine ONE-SPACE
083D EB           EX      DE,HL           ;

;; WRITE-CH
083E 77           LD      (HL),A          ;
083F 23           INC     HL              ;
0840 22 0E 40     LD      ($400E),HL      ; sv DF_CC_lo
0843 FD 35 39     DEC     (IY+$39)        ; sv S_POSN_x
0846 C9           RET                     ;

; ---

;; WRITE-N/L
0847 0E 21        LD      C,$21           ;
0849 05           DEC     B               ;
084A FD CB 01 C6  SET     0,(IY+$01)      ; sv FLAGS  - Suppress leading space
084E C3 18 09     JP      L0918           ; to LOC-ADDR

; --------------------------
; THE 'LPRINT-CH' SUBROUTINE
; --------------------------
; This routine sends a character to the ZX-Printer placing the code for the
; character in the Printer Buffer.
; Note. PR-CC contains the low byte of the buffer address. The high order byte
; is always constant.


;; LPRINT-CH
0851 FE 76        CP      $76             ; compare to NEWLINE.
0853 28 1C        JR      Z,L0871         ; forward if so to COPY-BUFF

0855 4F           LD      C,A             ; take a copy of the character in C.
0856 3A 38 40     LD      A,($4038)       ; fetch print location from PR_CC
0859 E6 7F        AND     $7F             ; ignore bit 7 to form true position.
085B FE 5C        CP      $5C             ; compare to 33rd location

085D 6F           LD      L,A             ; form low-order byte.
085E 26 40        LD      H,$40           ; the high-order byte is fixed.

0860 CC 71 08     CALL    Z,L0871         ; routine COPY-BUFF to send full buffer to
                                ; the printer if first 32 bytes full.
                                ; (this will reset HL to start.)

0863 71           LD      (HL),C          ; place character at location.
0864 2C           INC     L               ; increment - will not cross a 256 boundary.
0865 FD 75 38     LD      (IY+$38),L      ; update system variable PR_CC
                                ; automatically resetting bit 7 to show that
                                ; the buffer is not empty.
0868 C9           RET                     ; return.

; --------------------------
; THE 'COPY' COMMAND ROUTINE
; --------------------------
; The full character-mapped screen is copied to the ZX-Printer.
; All twenty-four text/graphic lines are printed.

;; COPY
0869    LD      D,$16           ; prepare to copy twenty four text lines.
        LD      HL,($400C)      ; set HL to start of display file from D_FILE.
        INC     HL              ;
        JR      L0876           ; forward to COPY*D

; ---

; A single character-mapped printer buffer is copied to the ZX-Printer.

;; COPY-BUFF
0871 16 01        LD      D,$01           ; prepare to copy a single text line.
0873 21 3C 40     LD      HL,$403C        ; set HL to start of printer buffer PRBUFF.

; both paths converge here.

;; COPY*D
0876 CD E7 02     CALL    L02E7           ; routine SET-FAST

0879 C5           PUSH    BC              ; *** preserve BC throughout.
                                ; a pending character may be present
                                ; in C from LPRINT-CH

;; COPY-LOOP
087A E5           PUSH    HL              ; save first character of line pointer. (*)
087B AF           XOR     A               ; clear accumulator.
087C 5F           LD      E,A             ; set pixel line count, range 0-7, to zero.

; this inner loop deals with each horizontal pixel line.

;; COPY-TIME
087D D3 FB        OUT     ($FB),A         ; bit 2 reset starts the printer motor
                                ; with an inactive stylus - bit 7 reset.
087F E1           POP     HL              ; pick up first character of line pointer (*)
                                ; on inner loop.

;; COPY-BRK
0880 CD 46 0F     CALL    L0F46           ; routine BREAK-1
0883 38 05        JR      C,L088A         ; forward with no keypress to COPY-CONT

; else A will hold 11111111 0

0885 1F           RRA                     ; 0111 1111
0886 D3 FB        OUT     ($FB),A         ; stop ZX printer motor, de-activate stylus.

;; REPORT-D2
0888 CF           RST     08H             ; ERROR-1
        DEFB    $0C             ; Error Report: BREAK - CONT repeats

; ---

;; COPY-CONT
088A DB FB        IN      A,($FB)         ; read from printer port.
088C 87           ADD     A,A             ; test bit 6 and 7
088D FA DE 08     JP      M,L08DE         ; jump forward with no printer to COPY-END

0890 30 EE        JR      NC,L0880        ; back if stylus not in position to COPY-BRK

0892 E5           PUSH    HL              ; save first character of line pointer (*)
0893 D5           PUSH    DE              ; ** preserve character line and pixel line.

0894 7A           LD      A,D             ; text line count to A?
0895 FE 02        CP      $02             ; sets carry if last line.
0897 9F           SBC     A,A             ; now $FF if last line else zero.

; now cleverly prepare a printer control mask setting bit 2 (later moved to 1)
; of D to slow printer for the last two pixel lines ( E = 6 and 7)

0898 A3           AND     E               ; and with pixel line offset 0-7
0899 07           RLCA                    ; shift to left.
089A A3           AND     E               ; and again.
089B 57           LD      D,A             ; store control mask in D.

;; COPY-NEXT
089C 4E           LD      C,(HL)          ; load character from screen or buffer.
089D 79           LD      A,C             ; save a copy in C for later inverse test.
089E 23           INC     HL              ; update pointer for next time.
089F FE 76        CP      $76             ; is character a NEWLINE ?
08A1 28 24        JR      Z,L08C7         ; forward, if so, to COPY-N/L

08A3 E5           PUSH    HL              ; * else preserve the character pointer.

08A4 CB 27        SLA     A               ; (?) multiply by two
08A6 87           ADD     A,A             ; multiply by four
08A7 87           ADD     A,A             ; multiply by eight

08A8 26 0F        LD      H,$0F           ; load H with half the address of character set.
08AA CB 14        RL      H               ; now $1E or $1F (with carry)
08AC 83           ADD     A,E             ; add byte offset 0-7
08AD 6F           LD      L,A             ; now HL addresses character source byte

08AE CB 11        RL      C               ; test character, setting carry if inverse.
08B0 9F           SBC     A,A             ; accumulator now $00 if normal, $FF if inverse.

08B1 AE           XOR     (HL)            ; combine with bit pattern at end or ROM.
08B2 4F           LD      C,A             ; transfer the byte to C.
08B3 06 08        LD      B,$08           ; count eight bits to output.

;; COPY-BITS
08B5 7A           LD      A,D             ; fetch speed control mask from D.
08B6 CB 01        RLC     C               ; rotate a bit from output byte to carry.
08B8 1F           RRA                     ; pick up in bit 7, speed bit to bit 1
08B9 67           LD      H,A             ; store aligned mask in H register.

;; COPY-WAIT
08BA DB FB        IN      A,($FB)         ; read the printer port
08BC 1F           RRA                     ; test for alignment signal from encoder.
08BD 30 FB        JR      NC,L08BA        ; loop if not present to COPY-WAIT

08BF 7C           LD      A,H             ; control byte to A.
08C0 D3 FB        OUT     ($FB),A         ; and output to printer port.
08C2 10 F1        DJNZ    L08B5           ; loop for all eight bits to COPY-BITS

08C4 E1           POP     HL              ; * restore character pointer.
08C5 18 D5        JR      L089C           ; back for adjacent character line to COPY-NEXT

; ---

; A NEWLINE has been encountered either following a text line or as the
; first character of the screen or printer line.

;; COPY-N/L
08C7 DB FB        IN      A,($FB)         ; read printer port.
08C9 1F           RRA                     ; wait for encoder signal.
08CA 30 FB        JR      NC,L08C7        ; loop back if not to COPY-N/L

08CC 7A           LD      A,D             ; transfer speed mask to A.
08CD 0F           RRCA                    ; rotate speed bit to bit 1.
                                ; bit 7, stylus control is reset.
08CE D3 FB        OUT     ($FB),A         ; set the printer speed.

08D0 D1           POP     DE              ; ** restore character line and pixel line.
08D1 1C           INC     E               ; increment pixel line 0-7.
08D2 CB 5B        BIT     3,E             ; test if value eight reached.
08D4 28 A7        JR      Z,L087D         ; back if not to COPY-TIME

; eight pixel lines, a text line have been completed.

08D6 C1           POP     BC              ; lose the now redundant first character
                                ; pointer
08D7 15           DEC     D               ; decrease text line count.
08D8 20 A0        JR      NZ,L087A        ; back if not zero to COPY-LOOP

08DA 3E 04        LD      A,$04           ; stop the already slowed printer motor.
08DC D3 FB        OUT     ($FB),A         ; output to printer port.

;; COPY-END
08DE CD 07 02     CALL    L0207           ; routine SLOW/FAST
08E1 C1           POP     BC              ; *** restore preserved BC.

; -------------------------------------
; THE 'CLEAR PRINTER BUFFER' SUBROUTINE
; -------------------------------------
; This subroutine sets 32 bytes of the printer buffer to zero (space) and
; the 33rd character is set to a NEWLINE.
; This occurs after the printer buffer is sent to the printer but in addition
; after the 24 lines of the screen are sent to the printer.
; Note. This is a logic error as the last operation does not involve the
; buffer at all. Logically one should be able to use
; 10 LPRINT "HELLO ";
; 20 COPY
; 30 LPRINT ; "WORLD"
; and expect to see the entire greeting emerge from the printer.
; Surprisingly this logic error was never discovered and although one can argue
; if the above is a bug, the repetition of this error on the Spectrum was most
; definitely a bug.
; Since the printer buffer is fixed at the end of the system variables, and
; the print position is in the range $3C - $5C, then bit 7 of the system
; variable is set to show the buffer is empty and automatically reset when
; the variable is updated with any print position - neat.

;; CLEAR-PRB
08E2 21 5C 40     LD      HL,$405C        ; address fixed end of PRBUFF
08E5 36 76        LD      (HL),$76        ; place a newline at last position.
08E7 06 20        LD      B,$20           ; prepare to blank 32 preceding characters.

;; PRB-BYTES
08E9 2B           DEC     HL              ; decrement address - could be DEC L.
08EA 36 00        LD      (HL),$00        ; place a zero byte.
08EC 10 FB        DJNZ    L08E9           ; loop for all thirty-two to PRB-BYTES

08EE 7D           LD      A,L             ; fetch character print position.
08EF CB FF        SET     7,A             ; signal the printer buffer is clear.
08F1 32 38 40     LD      ($4038),A       ; update one-byte system variable PR_CC
08F4 C9           RET                     ; return.

; -------------------------
; THE 'PRINT AT' SUBROUTINE
; -------------------------
;
;

;; PRINT-AT
08F5 3E 17        LD      A,$17           ;
08F7 90           SUB     B               ;
08F8 38 0B        JR      C,L0905         ; to WRONG-VAL

;; TEST-VAL
08FA FD BE 22     CP      (IY+$22)        ; sv DF_SZ
08FD DA 35 08     JP      C,L0835         ; to REPORT-5

0900 3C           INC     A               ;
0901 47           LD      B,A             ;
0902 3E 1F        LD      A,$1F           ;
0904 91           SUB     C               ;

;; WRONG-VAL
0905 DA AD 0E     JP      C,L0EAD         ; to REPORT-B

0908 C6 02        ADD     A,$02           ;
090A 4F           LD      C,A             ;

;; SET-FIELD
090B FD CB 01 4E  BIT     1,(IY+$01)      ; sv FLAGS  - Is printer in use
090F 28 07        JR      Z,L0918         ; to LOC-ADDR

0911 3E 5D        LD      A,$5D           ;
0913 91           SUB     C               ;
0914 32 38 40     LD      ($4038),A       ; sv PR_CC
0917 C9           RET                     ;

; ----------------------------
; THE 'LOCATE ADDRESS' ROUTINE
; ----------------------------
;
;

;; LOC-ADDR
0918 ED 43 39 40  LD      ($4039),BC      ; sv S_POSN_x
091C 2A 10 40     LD      HL,($4010)      ; sv VARS_lo
091F 51           LD      D,C             ;
0920 3E 22        LD      A,$22           ;
0922 91           SUB     C               ;
0923 4F           LD      C,A             ;
0924 3E 76        LD      A,$76           ;
0926 04           INC     B               ;

;; LOOK-BACK
0927 2B           DEC     HL              ;
0928 BE           CP      (HL)            ;
0929 20 FC        JR      NZ,L0927        ; to LOOK-BACK

092B 10 FA        DJNZ    L0927           ; to LOOK-BACK

092D 23           INC     HL              ;
092E ED B1        CPIR                    ;
0930 2B           DEC     HL              ;
0931 22 0E 40     LD      ($400E),HL      ; sv DF_CC_lo
0934 37           SCF                     ; Set Carry Flag
0935 E0           RET     PO              ;

0936 15           DEC     D               ;
0937 C8           RET     Z               ;

0938 C5           PUSH    BC              ;
0939 CD 9E 09     CALL    L099E           ; routine MAKE-ROOM
093C C1           POP     BC              ;
093D 41           LD      B,C             ;
093E 62           LD      H,D             ;
093F 6B           LD       L,E            ;

;; EXPAND-2
0940 36 00        LD      (HL),$00        ;
0942 2B           DEC     HL              ;
0943 10 FB        DJNZ    L0940           ; to EXPAND-2

0945 EB           EX      DE,HL           ;
0946 23           INC     HL              ;
0947 22 0E 40     LD      ($400E),HL      ; sv DF_CC_lo
094A C9           RET                     ;

; ------------------------------
; THE 'EXPAND TOKENS' SUBROUTINE
; ------------------------------
;
;

;; TOKENS
094B F5           PUSH    AF              ;
094C CD 75 09     CALL    L0975           ; routine TOKEN-ADD
094F 30 08        JR      NC,L0959        ; to ALL-CHARS

0951 FD CB 01 46  BIT     0,(IY+$01)      ; sv FLAGS  - Leading space if set
0955 20 02        JR      NZ,L0959        ; to ALL-CHARS

0957 AF           XOR     A               ;

0958 D7           RST     10H             ; PRINT-A

;; ALL-CHARS
0959 0A           LD      A,(BC)          ;
095A E6 3F        AND     $3F             ;

095C D7           RST     10H             ; PRINT-A
095D 0A           LD      A,(BC)          ;
095E 03           INC     BC              ;
095F 87           ADD     A,A             ;
0960 30 F7        JR      NC,L0959        ; to ALL-CHARS

0962 C1           POP     BC              ;
0963 CB 78        BIT     7,B             ;
0965 C8           RET     Z               ;

0966 FE 1A        CP      $1A             ;
0968 28 03        JR      Z,L096D         ; to TRAIL-SP

096A FE 38        CP      $38             ;
096C D8           RET     C               ;

;; TRAIL-SP
096D AF           XOR     A               ;
096E FD CB 01 C6  SET     0,(IY+$01)      ; sv FLAGS  - Suppress leading space
0972 C3 F5 07     JP      L07F5           ; to PRINT-SP

; ---

;; TOKEN-ADD
0975 E5           PUSH    HL              ;
0976 21 11 01     LD      HL,L0111        ; Address of TOKENS
0979 CB 7F        BIT     7,A             ;
097B 28 02        JR      Z,L097F         ; to TEST-HIGH

097D E6 3F        AND     $3F             ;

;; TEST-HIGH
097F FE 43        CP      $43             ;
0981 30 10        JR      NC,L0993        ; to FOUND

0983 47           LD      B,A             ;
0984 04           INC     B               ;

;; WORDS
0985 CB 7E        BIT     7,(HL)          ;
0987 23           INC     HL              ;
0988 28 FB        JR      Z,L0985         ; to WORDS

098A 10 F9        DJNZ    L0985           ; to WORDS

098C CB 77        BIT     6,A             ;
098E 20 02        JR      NZ,L0992        ; to COMP-FLAG

0990 FE 18        CP      $18             ;

;; COMP-FLAG
0992 3F           CCF                     ; Complement Carry Flag

;; FOUND
0993 44           LD      B,H             ;
0994 4D           LD       C,L            ;
0995 E1           POP     HL              ;
0996 D0           RET     NC              ;

0997 0A           LD      A,(BC)          ;
0998 C6 E4        ADD     A,$E4           ;
099A C9           RET                     ;

; --------------------------
; THE 'ONE SPACE' SUBROUTINE
; --------------------------
;
;

;; ONE-SPACE
099B 01 01 00     LD      BC,$0001        ;

; --------------------------
; THE 'MAKE ROOM' SUBROUTINE
; --------------------------
;
;

;; MAKE-ROOM
099E E5           PUSH    HL              ;
099F CD C5 0E     CALL    L0EC5           ; routine TEST-ROOM
09A2 E1           POP     HL              ;
09A3 CD AD 09     CALL    L09AD           ; routine POINTERS
09A6 2A 1C 40     LD      HL,($401C)      ; sv STKEND_lo
09A9 EB           EX      DE,HL           ;
09AA ED B8        LDDR                    ; Copy Bytes
09AC C9           RET                     ;

; -------------------------
; THE 'POINTERS' SUBROUTINE
; -------------------------
;
;

;; POINTERS
09AD F5           PUSH    AF              ;
09AE E5           PUSH    HL              ;
09AF 21 0C 40     LD      HL,$400C        ; sv D_FILE_lo
09B2 3E 09        LD      A,$09           ;

;; NEXT-PTR
09B4 5E           LD      E,(HL)          ;
09B5 23           INC     HL              ;
09B6 56           LD      D,(HL)          ;
09B7 E3           EX      (SP),HL         ;
09B8 A7           AND     A               ;
09B9 ED 52        SBC     HL,DE           ;
09BB 19           ADD     HL,DE           ;
09BC E3           EX      (SP),HL         ;
09BD 30 09        JR      NC,L09C8        ; to PTR-DONE

09BF D5           PUSH    DE              ;
09C0 EB           EX      DE,HL           ;
09C1 09           ADD     HL,BC           ;
09C2 EB           EX      DE,HL           ;
09C3 72           LD      (HL),D          ;
09C4 2B           DEC     HL              ;
09C5 73           LD      (HL),E          ;
09C6 23           INC     HL              ;
09C7 D1           POP     DE              ;

;; PTR-DONE
09C8 23           INC     HL              ;
09C9 3D           DEC     A               ;
09CA 20 E8        JR      NZ,L09B4        ; to NEXT-PTR

09CC EB           EX      DE,HL           ;
09CD D1           POP     DE              ;
09CE F1           POP     AF              ;
09CF A7           AND     A               ;
09D0 ED 52        SBC     HL,DE           ;
09D2 44           LD      B,H             ;
09D3 4D           LD      C,L             ;
09D4 03           INC     BC              ;
09D5 19           ADD     HL,DE           ;
09D6 EB           EX      DE,HL           ;
09D7 C9           RET                     ;

; -----------------------------
; THE 'LINE ADDRESS' SUBROUTINE
; -----------------------------
;
;

;; LINE-ADDR
09D8 E5           PUSH    HL              ;
09D9 21 7D 40     LD      HL,$407D        ;
09DC 54           LD      D,H             ;
09DD 5D           LD      E,L             ;

;; NEXT-TEST
09DE C1           POP     BC              ;
09DF CD EA 09     CALL    L09EA           ; routine CP-LINES
09E2 D0           RET     NC              ;

09E3 C5           PUSH    BC              ;
09E4 CD F2 09     CALL     L09F2          ; routine NEXT-ONE
09E7 EB           EX      DE,HL           ;
09E8 18 F4        JR      L09DE           ; to NEXT-TEST

; -------------------------------------
; THE 'COMPARE LINE NUMBERS' SUBROUTINE
; -------------------------------------
;
;

;; CP-LINES
09EA 7E           LD      A,(HL)          ;
09EB B8           CP      B               ;
09EC C0           RET     NZ              ;

09ED 23           INC     HL              ;
09EE 7E           LD      A,(HL)          ;
09EF 2B           DEC     HL              ;
09F0 B9           CP      C               ;
09F1 C9           RET                     ;

; --------------------------------------
; THE 'NEXT LINE OR VARIABLE' SUBROUTINE
; --------------------------------------
;
;

;; NEXT-ONE
09F2 E5           PUSH    HL              ;
09F3 7E           LD      A,(HL)          ;
09F4 FE 40        CP      $40             ;
09F6 38 17        JR      C,L0A0F         ; to LINES

09F8 CB 6F        BIT     5,A             ;
09FA 28 14        JR      Z,L0A10         ; forward to NEXT-O-4

09FC 87           ADD     A,A             ;
09FD FA 01 0A     JP      M,L0A01         ; to NEXT+FIVE

0A00 3F           CCF                     ; Complement Carry Flag

;; NEXT+FIVE
0A01 01 05 00     LD      BC,$0005        ;
0A04 30 02        JR      NC,L0A08        ; to NEXT-LETT

0A06 0E 11        LD      C,$11           ;

;; NEXT-LETT
0A08 17           RLA                     ;
0A09 23           INC     HL              ;
0A0A 7E           LD      A,(HL)          ;
0A0B 30 FB        JR      NC,L0A08        ; to NEXT-LETT

0A0D 18 06        JR      L0A15           ; to NEXT-ADD

; ---

;; LINES
0A0F 23           INC     HL              ;

;; NEXT-O-4
0A10 23           INC     HL              ;
0A11 4E           LD      C,(HL)          ;
0A12 23           INC     HL              ;
0A13 46           LD      B,(HL)          ;
0A14 23           INC     HL              ;

;; NEXT-ADD
0A15 09           ADD     HL,BC           ;
0A16 D1           POP     DE              ;

; ---------------------------
; THE 'DIFFERENCE' SUBROUTINE
; ---------------------------
;
;

;; DIFFER
0A17 A7           AND     A               ;
0A18 ED 52        SBC     HL,DE           ;
0A1A 44           LD      B,H             ;
0A1B 4D           LD      C,L             ;
0A1C 19           ADD     HL,DE           ;
0A1D EB           EX      DE,HL           ;
0A1E C9           RET                     ;

; --------------------------
; THE 'LINE-ENDS' SUBROUTINE
; --------------------------
;
;

;; LINE-ENDS
0A1F FD 46 22     LD      B,(IY+$22)      ; sv DF_SZ
0A22 C5           PUSH    BC              ;
0A23 CD 2C 0A     CALL    L0A2C           ; routine B-LINES
0A26 C1           POP     BC              ;
0A27 05           DEC     B               ;
0A28 18 02        JR      L0A2C           ; to B-LINES

; -------------------------
; THE 'CLS' COMMAND ROUTINE
; -------------------------
;
;

;; CLS
0A2A 06 18        LD      B,$18           ;

;; B-LINES
0A2C FD CB 01 8E  RES     1,(IY+$01)      ; sv FLAGS  - Signal printer not in use
0A30 0E 21        LD      C,$21           ;
0A32 C5           PUSH    BC              ;
0A33 CD 18 09     CALL    L0918           ; routine LOC-ADDR
0A36 C1           POP     BC              ;
0A37 3A 05 40     LD      A,($4005)       ; sv RAMTOP_hi
0A3A FE 4D        CP      $4D             ;
0A3C 38 14        JR      C,L0A52         ; to COLLAPSED

0A3E FD CB 3A FE  SET     7,(IY+$3A)      ; sv S_POSN_y

;; CLEAR-LOC
0A42 AF           XOR     A               ; prepare a space
0A43 CD F5 07     CALL    L07F5           ; routine PRINT-SP prints a space
0A46 2A 39 40     LD      HL,($4039)      ; sv S_POSN_x
0A49 7D           LD      A,L             ;
0A4A B4           OR      H               ;
0A4B E6 7E        AND     $7E             ;
0A4D 20 F3        JR      NZ,L0A42        ; to CLEAR-LOC

0A4F C3 18 09     JP      L0918           ; to LOC-ADDR

; ---

;; COLLAPSED
0A52 54           LD      D,H             ;
0A53 5D           LD      E,L             ;
0A54 2B           DEC     HL              ;
0A55 48           LD      C,B             ;
0A56 06 00        LD      B,$00           ;
0A58 ED B0        LDIR                    ; Copy Bytes
0A5A 2A 10 40     LD      HL,($4010)      ; sv VARS_lo

; ----------------------------
; THE 'RECLAIMING' SUBROUTINES
; ----------------------------
;
;

;; RECLAIM-1
0A5D CD 17 0A     CALL    L0A17           ; routine DIFFER

;; RECLAIM-2
0A60 C5           PUSH    BC              ;
0A61 78           LD      A,B             ;
0A62 2F           CPL                     ;
0A63 47           LD      B,A             ;
0A64 79           LD      A,C             ;
0A65 2F           CPL                     ;
0A66 4F           LD      C,A             ;
0A67 03           INC     BC              ;
0A68 CD AD 09     CALL    L09AD           ; routine POINTERS
0A6B EB           EX      DE,HL           ;
0A6C E1           POP     HL              ;
0A6D 19           ADD     HL,DE           ;
0A6E D5           PUSH    DE              ;
0A6F ED B0        LDIR                    ; Copy Bytes
0A71 E1           POP     HL              ;
0A72 C9           RET                     ;

; ------------------------------
; THE 'E-LINE NUMBER' SUBROUTINE
; ------------------------------
;
;

;; E-LINE-NO
0A73 2A 14 40     LD      HL,($4014)      ; sv E_LINE_lo
0A76 CD 4D 00     CALL    L004D           ; routine TEMP-PTR-2

0A79 DF           RST     18H             ; GET-CHAR
0A7A FD CB 2D 6E  BIT     5,(IY+$2D)      ; sv FLAGX
0A7E C0           RET     NZ              ;

0A7F 21 5D 40     LD      HL,$405D        ; sv MEM-0-1st
0A82 22 1C 40     LD      ($401C),HL      ; sv STKEND_lo
0A85 CD 48 15     CALL    L1548           ; routine INT-TO-FP
0A88 CD 8A 15     CALL    L158A           ; routine FP-TO-BC
0A8B 38 04        JR      C,L0A91         ; to NO-NUMBER

0A8D 21 F0 D8     LD      HL,$D8F0        ; value '-10000'
0A90 09           ADD     HL,BC           ;

;; NO-NUMBER
0A91 DA 9A 0D     JP      C,L0D9A         ; to REPORT-C

0A94 BF           CP      A               ;
0A95 C3 BC 14     JP      L14BC           ; routine SET-MIN

; -------------------------------------------------
; THE 'REPORT AND LINE NUMBER' PRINTING SUBROUTINES
; -------------------------------------------------
;
;

;; OUT-NUM
0A98 D5           PUSH    DE              ;
0A99 E5           PUSH    HL              ;
0A9A AF           XOR     A               ;
0A9B CB 78        BIT     7,B             ;
0A9D 20 20        JR      NZ,L0ABF        ; to UNITS

0A9F 60           LD       H,B            ;
0AA0 69           LD      L,C             ;
0AA1 1E FF        LD      E,$FF           ;
0AA3 18 08        JR      L0AAD           ; to THOUSAND

; ---

;; OUT-NO
0AA5 D5           PUSH    DE              ;
0AA6 56           LD      D,(HL)          ;
0AA7 23           INC     HL              ;
0AA8 5E           LD      E,(HL)          ;
0AA9 E5           PUSH    HL              ;
0AAA EB           EX      DE,HL           ;
0AAB 1E 00        LD      E,$00           ; set E to leading space.

;; THOUSAND
0AAD 01 18 FC     LD      BC,$FC18        ;
0AB0 CD E1 07     CALL    L07E1           ; routine OUT-DIGIT
0AB3 01 9C FF     LD      BC,$FF9C        ;
0AB6 CD E1 07     CALL    L07E1           ; routine OUT-DIGIT
0AB9 0E F6        LD      C,$F6           ;
0ABB CD E1 07     CALL    L07E1           ; routine OUT-DIGIT
0ABE 7D           LD      A,L             ;

;; UNITS
0ABF CD EB 07     CALL    L07EB           ; routine OUT-CODE
0AC2 E1           POP     HL              ;
0AC3 D1           POP     DE              ;
0AC4 C9           RET                     ;

; --------------------------
; THE 'UNSTACK-Z' SUBROUTINE
; --------------------------
; This subroutine is used to return early from a routine when checking syntax.
; On the ZX81 the same routines that execute commands also check the syntax
; on line entry. This enables precise placement of the error marker in a line
; that fails syntax.
; The sequence CALL SYNTAX-Z ; RET Z can be replaced by a call to this routine
; although it has not replaced every occurrence of the above two instructions.
; Even on the ZX-80 this routine was not fully utilized.

;; UNSTACK-Z
0AC5 CD A6 0D     CALL    L0DA6           ; routine SYNTAX-Z resets the ZERO flag if
                                ; checking syntax.
0AC8 E1           POP     HL              ; drop the return address.
0AC9 C8           RET     Z               ; return to previous calling routine if
                                ; checking syntax.

0ACA E9           JP      (HL)            ; else jump to the continuation address in
                                ; the calling routine as RET would have done.

; ----------------------------
; THE 'LPRINT' COMMAND ROUTINE
; ----------------------------
;
;

;; LPRINT
0ACB FD CB 01 CE  SET     1,(IY+$01)      ; sv FLAGS  - Signal printer in use

; ---------------------------
; THE 'PRINT' COMMAND ROUTINE
; ---------------------------
;
;

;; PRINT
0ACF 7E           LD      A,(HL)          ;
0AD0 FE 76        CP      $76             ;
0AD2 CA 84 0B     JP      Z,L0B84         ; to PRINT-END

;; PRINT-1
0AD5 D6 1A        SUB     $1A             ;
0AD7 CE 00        ADC     A,$00           ;
0AD9 28 69        JR      Z,L0B44         ; to SPACING

0ADB FE A7        CP      $A7             ;
0ADD 20 1B        JR      NZ,L0AFA        ; to NOT-AT


0ADF E7           RST     20H             ; NEXT-CHAR
0AE0 CD 92 0D     CALL    L0D92           ; routine CLASS-6
0AE3 FE 1A        CP      $1A             ;
0AE5 C2 9A 0D     JP      NZ,L0D9A        ; to REPORT-C


0AE8 E7           RST     20H             ; NEXT-CHAR
0AE9 CD 92 0D     CALL    L0D92           ; routine CLASS-6
0AEC CD 4E 0B     CALL    L0B4E           ; routine SYNTAX-ON

0AEF EF           RST     28H             ;; FP-CALC
        DEFB    $01             ;;exchange
        DEFB    $34             ;;end-calc

0AF2 CD F5 0B     CALL    L0BF5           ; routine STK-TO-BC
0AF5 CD F5 08     CALL    L08F5           ; routine PRINT-AT
0AF8 18 3D        JR      L0B37           ; to PRINT-ON

; ---

;; NOT-AT
0AFA FE A8        CP      $A8             ;
0AFC 20 33        JR      NZ,L0B31        ; to NOT-TAB


0AFE E7           RST     20H             ; NEXT-CHAR
0AFF CD 92 0D     CALL    L0D92           ; routine CLASS-6
0B02 CD 4E 0B     CALL    L0B4E           ; routine SYNTAX-ON
0B05 CD 02 0C     CALL    L0C02           ; routine STK-TO-A
0B08 C2 AD 0E     JP      NZ,L0EAD        ; to REPORT-B

0B0B E6 1F        AND     $1F             ;
0B0D 4F           LD      C,A             ;
0B0E FD CB 01 4E  BIT     1,(IY+$01)      ; sv FLAGS  - Is printer in use
0B12 28 0A        JR      Z,L0B1E         ; to TAB-TEST

0B14 FD 96 38     SUB     (IY+$38)        ; sv PR_CC
0B17 CB FF        SET     7,A             ;
0B19 C6 3C        ADD     A,$3C           ;
0B1B D4 71 08     CALL    NC,L0871        ; routine COPY-BUFF

;; TAB-TEST
0B1E FD 86 39     ADD     A,(IY+$39)      ; sv S_POSN_x
0B21 FE 21        CP      $21             ;
0B23 3A 3A 40     LD      A,($403A)       ; sv S_POSN_y
0B26 DE 01        SBC     A,$01           ;
0B28 CD FA 08     CALL    L08FA           ; routine TEST-VAL
0B2B FD CB 01 C6  SET     0,(IY+$01)      ; sv FLAGS  - Suppress leading space
0B2F 18 06        JR      L0B37           ; to PRINT-ON

; ---

;; NOT-TAB
0B31 CD 55 0F     CALL    L0F55           ; routine SCANNING
0B34 CD 55 0B     CALL    L0B55           ; routine PRINT-STK

;; PRINT-ON
0B37 DF           RST     18H             ; GET-CHAR
0B38 D6 1A        SUB     $1A             ;
0B3A CE 00        ADC     A,$00           ;
0B3C 28 06        JR      Z,L0B44         ; to SPACING

0B3E CD 1D 0D     CALL    L0D1D           ; routine CHECK-END
0B41 C3 84 0B     JP      L0B84           ;;; to PRINT-END

; ---

;; SPACING
0B44 D4 8B 0B     CALL    NC,L0B8B        ; routine FIELD

0B47 E7           RST     20H             ; NEXT-CHAR
0B48 FE 76        CP      $76             ;
0B4A C8           RET     Z               ;

0B4B C3 D5 0A     JP      L0AD5           ;;; to PRINT-1

; ---

;; SYNTAX-ON
0B4E CD A6 0D     CALL    L0DA6           ; routine SYNTAX-Z
0B51 C0           RET     NZ              ;

0B52 E1           POP     HL              ;
0B53 18 E2        JR      L0B37           ; to PRINT-ON

; ---

;; PRINT-STK
0B55 CD C5 0A     CALL    L0AC5           ; routine UNSTACK-Z
0B58 FD CB 01 76  BIT     6,(IY+$01)      ; sv FLAGS  - Numeric or string result?
0B5C CC F8 13     CALL    Z,L13F8         ; routine STK-FETCH
0B5F 28 0A        JR      Z,L0B6B         ; to PR-STR-4

0B61 C3 DB 15     JP      L15DB           ; jump forward to PRINT-FP

; ---

;; PR-STR-1
0B64 3E 0B        LD      A,$0B           ;

;; PR-STR-2
0B66 D7           RST     10H             ; PRINT-A

;; PR-STR-3
0B67 ED 5B 18 40  LD      DE,($4018)      ; sv X_PTR_lo

;; PR-STR-4
0B6B 78           LD      A,B             ;
0B6C B1           OR      C               ;
0B6D 0B           DEC     BC              ;
0B6E C8           RET     Z               ;

0B6F 1A           LD      A,(DE)          ;
0B70 13           INC     DE              ;
0B71 ED 53 18 40  LD      ($4018),DE      ; sv X_PTR_lo
0B75 CB 77        BIT      6,A            ;
0B77 28 ED        JR      Z,L0B66         ; to PR-STR-2

0B79 FE C0        CP      $C0             ;
0B7B 28 E7        JR      Z,L0B64         ; to PR-STR-1

0B7D C5           PUSH    BC              ;
0B7E CD 4B 09     CALL    L094B           ; routine TOKENS
0B81 C1           POP     BC              ;
0B82 18 E3        JR      L0B67           ; to PR-STR-3

; ---

;; PRINT-END
0B84 CD C5 0A     CALL    L0AC5           ; routine UNSTACK-Z
0B87 3E 76        LD      A,$76           ;

0B89 D7           RST     10H             ; PRINT-A
0B8A C9           RET                     ;

; ---

;; FIELD
0B8B CD C5 0A     CALL    L0AC5           ; routine UNSTACK-Z
0B8E FD CB 01 C6  SET     0,(IY+$01)      ; sv FLAGS  - Suppress leading space
0B92 AF           XOR     A               ;

0B93 D7           RST     10H             ; PRINT-A
0B94 ED 4B 39 40  LD      BC,($4039)      ; sv S_POSN_x
0B98 79           LD      A,C             ;
0B99 FD CB 01 4E  BIT     1,(IY+$01)      ; sv FLAGS  - Is printer in use
0B9D 28 05        JR      Z,L0BA4         ; to CENTRE

0B9F 3E 5D        LD      A,$5D           ;
0BA1 FD 96 38     SUB     (IY+$38)        ; sv PR_CC

;; CENTRE
0BA4 0E 11        LD      C,$11           ;
0BA6 B9           CP      C               ;
0BA7 30 02        JR      NC,L0BAB        ; to RIGHT

0BA9 0E 01        LD      C,$01           ;

;; RIGHT
0BAB CD 0B 09     CALL    L090B           ; routine SET-FIELD
0BAE C9           RET                     ;

; --------------------------------------
; THE 'PLOT AND UNPLOT' COMMAND ROUTINES
; --------------------------------------
;
;

;; PLOT/UNP
0BAF CD F5 0B     CALL    L0BF5           ; routine STK-TO-BC
0BB2 ED 43 36 40  LD      ($4036),BC      ; sv COORDS_x
0BB6 3E 2B        LD      A,$2B           ;
0BB8 90           SUB     B               ;
0BB9 DA AD 0E     JP      C,L0EAD         ; to REPORT-B

0BBC 47           LD      B,A             ;
0BBD 3E 01        LD      A,$01           ;
0BBF CB 28        SRA     B               ;
0BC1 30 02        JR      NC,L0BC5        ; to COLUMNS

0BC3 3E 04        LD      A,$04           ;

;; COLUMNS
0BC5 CB 29        SRA     C               ;
0BC7 30 01        JR      NC,L0BCA        ; to FIND-ADDR

0BC9 07           RLCA                    ;

;; FIND-ADDR
0BCA F5           PUSH    AF              ;
0BCB CD F5 08     CALL    L08F5           ; routine PRINT-AT
0BCE 7E           LD      A,(HL)          ;
0BCF 07           RLCA                    ;
0BD0 FE 10        CP      $10             ;
0BD2 30 06        JR      NC,L0BDA        ; to TABLE-PTR

0BD4 0F           RRCA                    ;
0BD5 30 02        JR      NC,L0BD9        ; to SQ-SAVED

0BD7 EE 8F        XOR     $8F             ;

;; SQ-SAVED
0BD9 47           LD      B,A             ;

;; TABLE-PTR
0BDA 11 9E 0C     LD      DE,L0C9E        ; Address: P-UNPLOT
0BDD 3A 30 40     LD      A,($4030)       ; sv T_ADDR_lo
0BE0 93           SUB     E               ;
0BE1 FA E9 0B     JP      M,L0BE9         ; to PLOT

0BE4 F1           POP     AF              ;
0BE5 2F           CPL                     ;
0BE6 A0           AND     B               ;
0BE7 18 02        JR      L0BEB           ; to UNPLOT

; ---

;; PLOT
0BE9 F1           POP     AF              ;
0BEA B0           OR      B               ;

;; UNPLOT
0BEB FE 08        CP      $08             ;
0BED 38 02        JR      C,L0BF1         ; to PLOT-END

0BEF EE 8F        XOR     $8F             ;

;; PLOT-END
0BF1 D9           EXX                     ;

0BF2 D7           RST     10H             ; PRINT-A
0BF3 D9           EXX                     ;
0BF4 C9           RET                     ;

; ----------------------------
; THE 'STACK-TO-BC' SUBROUTINE
; ----------------------------
;
;

;; STK-TO-BC
0BF5 CD 02 0C     CALL    L0C02           ; routine STK-TO-A
0BF8 47           LD      B,A             ;
0BF9 C5           PUSH    BC              ;
0BFA CD 02 0C     CALL    L0C02           ; routine STK-TO-A
0BFD 59           LD      E,C             ;
0BFE C1           POP     BC              ;
0BFF 51           LD      D,C             ;
0C00 4F           LD      C,A             ;
0C01 C9           RET                     ;

; ---------------------------
; THE 'STACK-TO-A' SUBROUTINE
; ---------------------------
;
;

;; STK-TO-A
0C02 CD CD 15     CALL    L15CD           ; routine FP-TO-A
0C05 DA AD 0E     JP      C,L0EAD         ; to REPORT-B

0C08 0E 01        LD      C,$01           ;
0C0A C8           RET     Z               ;

0C0B 0E FF        LD      C,$FF           ;
0C0D C9           RET                     ;

; -----------------------
; THE 'SCROLL' SUBROUTINE
; -----------------------
;
;

;; SCROLL
0C0E FD 46 22     LD      B,(IY+$22)      ; sv DF_SZ
0C11 0E 21        LD      C,$21           ;
0C13 CD 18 09     CALL    L0918           ; routine LOC-ADDR
0C16 CD 9B 09     CALL    L099B           ; routine ONE-SPACE
0C19 7E           LD      A,(HL)          ;
0C1A 12           LD      (DE),A          ;
0C1B FD 34 3A     INC     (IY+$3A)        ; sv S_POSN_y
0C1E 2A 0C 40     LD      HL,($400C)      ; sv D_FILE_lo
0C21 23           INC     HL              ;
0C22 54           LD      D,H             ;
0C23 5D           LD      E,L             ;
0C24 ED B1        CPIR                    ;
0C26 C3 5D 0A     JP      L0A5D           ; to RECLAIM-1

; -------------------
; THE 'SYNTAX' TABLES
; -------------------

; i) The Offset table

;; offset-t
0C29    DEFB    L0CB4 - $       ; 8B offset to; Address: P-LPRINT
        DEFB    L0CB7 - $       ; 8D offset to; Address: P-LLIST
        DEFB    L0C58 - $       ; 2D offset to; Address: P-STOP
        DEFB    L0CAB - $       ; 7F offset to; Address: P-SLOW
        DEFB    L0CAE - $       ; 81 offset to; Address: P-FAST
        DEFB    L0C77 - $       ; 49 offset to; Address: P-NEW
        DEFB    L0CA4 - $       ; 75 offset to; Address: P-SCROLL
        DEFB    L0C8F - $       ; 5F offset to; Address: P-CONT
        DEFB    L0C71 - $       ; 40 offset to; Address: P-DIM
        DEFB    L0C74 - $       ; 42 offset to; Address: P-REM
        DEFB    L0C5E - $       ; 2B offset to; Address: P-FOR
        DEFB    L0C4B - $       ; 17 offset to; Address: P-GOTO
        DEFB    L0C54 - $       ; 1F offset to; Address: P-GOSUB
        DEFB    L0C6D - $       ; 37 offset to; Address: P-INPUT
        DEFB    L0C89 - $       ; 52 offset to; Address: P-LOAD
        DEFB    L0C7D - $       ; 45 offset to; Address: P-LIST
        DEFB    L0C48 - $       ; 0F offset to; Address: P-LET
        DEFB    L0CA7 - $       ; 6D offset to; Address: P-PAUSE
        DEFB    L0C66 - $       ; 2B offset to; Address: P-NEXT
        DEFB    L0C80 - $       ; 44 offset to; Address: P-POKE
        DEFB    L0C6A - $       ; 2D offset to; Address: P-PRINT
        DEFB    L0C98 - $       ; 5A offset to; Address: P-PLOT
        DEFB    L0C7A - $       ; 3B offset to; Address: P-RUN
        DEFB    L0C8C - $       ; 4C offset to; Address: P-SAVE
        DEFB    L0C86 - $       ; 45 offset to; Address: P-RAND
        DEFB    L0C4F - $       ; 0D offset to; Address: P-IF
        DEFB    L0C95 - $       ; 52 offset to; Address: P-CLS
        DEFB    L0C9E - $       ; 5A offset to; Address: P-UNPLOT
        DEFB    L0C92 - $       ; 4D offset to; Address: P-CLEAR
        DEFB    L0C5B - $       ; 15 offset to; Address: P-RETURN
        DEFB    L0CB1 - $       ; 6A offset to; Address: P-COPY

; ii) The parameter table.


;; P-LET
0C48    DEFB    $01             ; Class-01 - A variable is required.
        DEFB    $14             ; Separator:  '='
        DEFB    $02             ; Class-02 - An expression, numeric or string,
                                ; must follow.

;; P-GOTO
0C4B    DEFB    $06             ; Class-06 - A numeric expression must follow.
        DEFB    $00             ; Class-00 - No further operands.
        DEFW    L0E81           ; Address: $0E81; Address: GOTO

;; P-IF
0C4F    DEFB    $06             ; Class-06 - A numeric expression must follow.
        DEFB    $DE             ; Separator:  'THEN'
        DEFB    $05             ; Class-05 - Variable syntax checked entirely
                                ; by routine.
        DEFW    L0DAB           ; Address: $0DAB; Address: IF

;; P-GOSUB
0C54    DEFB    $06             ; Class-06 - A numeric expression must follow.
        DEFB    $00             ; Class-00 - No further operands.
        DEFW    L0EB5           ; Address: $0EB5; Address: GOSUB

;; P-STOP
0C58    DEFB    $00             ; Class-00 - No further operands.
        DEFW    L0CDC           ; Address: $0CDC; Address: STOP

;; P-RETURN
0C5B    DEFB    $00             ; Class-00 - No further operands.
        DEFW    L0ED8           ; Address: $0ED8; Address: RETURN

;; P-FOR
0C5E    DEFB    $04             ; Class-04 - A single character variable must
                                ; follow.
        DEFB    $14             ; Separator:  '='
        DEFB    $06             ; Class-06 - A numeric expression must follow.
        DEFB    $DF             ; Separator:  'TO'
        DEFB    $06             ; Class-06 - A numeric expression must follow.
        DEFB    $05             ; Class-05 - Variable syntax checked entirely
                                ; by routine.
        DEFW    L0DB9           ; Address: $0DB9; Address: FOR

;; P-NEXT
0C66    DEFB    $04             ; Class-04 - A single character variable must
                                ; follow.
        DEFB    $00             ; Class-00 - No further operands.
        DEFW    L0E2E           ; Address: $0E2E; Address: NEXT

;; P-PRINT
0C6A    DEFB    $05             ; Class-05 - Variable syntax checked entirely
                                ; by routine.
        DEFW    L0ACF           ; Address: $0ACF; Address: PRINT

;; P-INPUT
0C6D    DEFB    $01             ; Class-01 - A variable is required.
        DEFB    $00             ; Class-00 - No further operands.
        DEFW    L0EE9           ; Address: $0EE9; Address: INPUT

;; P-DIM
0C71    DEFB    $05             ; Class-05 - Variable syntax checked entirely
                                ; by routine.
        DEFW    L1409           ; Address: $1409; Address: DIM

;; P-REM
0C74    DEFB    $05             ; Class-05 - Variable syntax checked entirely
                                ; by routine.
        DEFW    L0D6A           ; Address: $0D6A; Address: REM

;; P-NEW
0C77    DEFB    $00             ; Class-00 - No further operands.
        DEFW    L03C3           ; Address: $03C3; Address: NEW

;; P-RUN
0C7A    DEFB    $03             ; Class-03 - A numeric expression may follow
                                ; else default to zero.
        DEFW    L0EAF           ; Address: $0EAF; Address: RUN

;; P-LIST
0C7D    DEFB    $03             ; Class-03 - A numeric expression may follow
                                ; else default to zero.
        DEFW    L0730           ; Address: $0730; Address: LIST

;; P-POKE
0C80    DEFB    $06             ; Class-06 - A numeric expression must follow.
        DEFB    $1A             ; Separator:  ','
        DEFB    $06             ; Class-06 - A numeric expression must follow.
        DEFB    $00             ; Class-00 - No further operands.
        DEFW    L0E92           ; Address: $0E92; Address: POKE

;; P-RAND
0C86    DEFB    $03             ; Class-03 - A numeric expression may follow
                                ; else default to zero.
        DEFW    L0E6C           ; Address: $0E6C; Address: RAND

;; P-LOAD
0C89    DEFB    $05             ; Class-05 - Variable syntax checked entirely
                                ; by routine.
        DEFW    L0340           ; Address: $0340; Address: LOAD

;; P-SAVE
0C8C    DEFB    $05             ; Class-05 - Variable syntax checked entirely
                                ; by routine.
        DEFW    L02F6           ; Address: $02F6; Address: SAVE

;; P-CONT
0C8F    DEFB    $00             ; Class-00 - No further operands.
        DEFW    L0E7C           ; Address: $0E7C; Address: CONT

;; P-CLEAR
0C92    DEFB    $00             ; Class-00 - No further operands.
        DEFW    L149A           ; Address: $149A; Address: CLEAR

;; P-CLS
0C95    DEFB    $00             ; Class-00 - No further operands.
        DEFW    L0A2A           ; Address: $0A2A; Address: CLS

;; P-PLOT
0C98    DEFB    $06             ; Class-06 - A numeric expression must follow.
        DEFB    $1A             ; Separator:  ','
        DEFB    $06             ; Class-06 - A numeric expression must follow.
        DEFB    $00             ; Class-00 - No further operands.
        DEFW    L0BAF           ; Address: $0BAF; Address: PLOT/UNP

;; P-UNPLOT
0C9E    DEFB    $06             ; Class-06 - A numeric expression must follow.
        DEFB    $1A             ; Separator:  ','
        DEFB    $06             ; Class-06 - A numeric expression must follow.
        DEFB    $00             ; Class-00 - No further operands.
        DEFW    L0BAF           ; Address: $0BAF; Address: PLOT/UNP

;; P-SCROLL
0CA4    DEFB    $00             ; Class-00 - No further operands.
        DEFW    L0C0E           ; Address: $0C0E; Address: SCROLL

;; P-PAUSE
0CA7    DEFB    $06             ; Class-06 - A numeric expression must follow.
        DEFB    $00             ; Class-00 - No further operands.
        DEFW    L0F32           ; Address: $0F32; Address: PAUSE

;; P-SLOW
0CAB    DEFB    $00             ; Class-00 - No further operands.
        DEFW    L0F2B           ; Address: $0F2B; Address: SLOW

;; P-FAST
0CAE    DEFB    $00             ; Class-00 - No further operands.
        DEFW    L0F23           ; Address: $0F23; Address: FAST

;; P-COPY
0CB1    DEFB    $00             ; Class-00 - No further operands.
        DEFW    L0869           ; Address: $0869; Address: COPY

;; P-LPRINT
0CB4    DEFB    $05             ; Class-05 - Variable syntax checked entirely
                                ; by routine.
        DEFW    L0ACB           ; Address: $0ACB; Address: LPRINT

;; P-LLIST
0CB7    DEFB    $03             ; Class-03 - A numeric expression may follow
                                ; else default to zero.
        DEFW    L072C           ; Address: $072C; Address: LLIST


; ---------------------------
; THE 'LINE SCANNING' ROUTINE
; ---------------------------
;
;

;; LINE-SCAN
0CBA FD 36 01 01  LD      (IY+$01),$01    ; sv FLAGS
0CBE CD 73 0A     CALL    L0A73           ; routine E-LINE-NO

;; LINE-RUN
0CC1 CD BC 14     CALL    L14BC           ; routine SET-MIN
0CC4 21 00 40     LD      HL,$4000        ; sv ERR_NR
0CC7 36 FF        LD      (HL),$FF        ;
0CC9 21 2D 40     LD      HL,$402D        ; sv FLAGX
0CCC CB 6E        BIT     5,(HL)          ;
0CCE 28 0E        JR      Z,L0CDE         ; to LINE-NULL

0CD0 FE E3        CP      $E3             ; 'STOP' ?
0CD2 7E           LD      A,(HL)          ;
0CD3 C2 6F 0D     JP      NZ,L0D6F        ; to INPUT-REP

0CD6 CD A6 0D     CALL    L0DA6           ; routine SYNTAX-Z
0CD9 C8           RET     Z               ;


0CDA CF           RST     08H             ; ERROR-1
        DEFB    $0C             ; Error Report: BREAK - CONT repeats


; --------------------------
; THE 'STOP' COMMAND ROUTINE
; --------------------------
;
;

;; STOP
0CDC CF           RST     08H             ; ERROR-1
        DEFB    $08             ; Error Report: STOP statement

; ---

; the interpretation of a line continues with a check for just spaces
; followed by a carriage return.
; The IF command also branches here with a true value to execute the
; statement after the THEN but the statement can be null so
; 10 IF 1 = 1 THEN
; passes syntax (on all ZX computers).

;; LINE-NULL
0CDE DF           RST     18H             ; GET-CHAR
0CDF 06 00        LD      B,$00           ; prepare to index - early.
0CE1 FE 76        CP      $76             ; compare to NEWLINE.
0CE3 C8           RET     Z               ; return if so.

0CE4 4F           LD      C,A             ; transfer character to C.

0CE5 E7           RST     20H             ; NEXT-CHAR advances.
0CE6 79           LD      A,C             ; character to A
0CE7 D6 E1        SUB     $E1             ; subtract 'LPRINT' - lowest command.
0CE9 38 3B        JR      C,L0D26         ; forward if less to REPORT-C2

0CEB 4F           LD      C,A             ; reduced token to C
0CEC 21 29 0C     LD      HL,L0C29        ; set HL to address of offset table.
0CEF 09           ADD     HL,BC           ; index into offset table.
0CF0 4E           LD      C,(HL)          ; fetch offset
0CF1 09           ADD     HL,BC           ; index into parameter table.
0CF2 18 03        JR      L0CF7           ; to GET-PARAM

; ---

;; SCAN-LOOP
0CF4    LD      HL,($4030)      ; sv T_ADDR_lo

; -> Entry Point to Scanning Loop

;; GET-PARAM
0CF7 7E           LD      A,(HL)          ;
0CF8 23           INC     HL              ;
0CF9 22 30 40     LD      ($4030),HL      ; sv T_ADDR_lo

0CFC 01 F4 0C     LD      BC,L0CF4        ; Address: SCAN-LOOP
0CFF C5           PUSH    BC              ; is pushed on machine stack.

0D00 4F           LD      C,A             ;
0D01 FE 0B        CP      $0B             ;
0D03 30 0B        JR      NC,L0D10        ; to SEPARATOR

0D05 21 16 0D     LD      HL,L0D16        ; class-tbl - the address of the class table.
0D08 06 00        LD      B,$00           ;
0D0A 09           ADD     HL,BC           ;
0D0B 4E           LD      C,(HL)          ;
0D0C 09           ADD     HL,BC           ;
0D0D E5           PUSH    HL              ;

0D0E DF           RST     18H             ; GET-CHAR
0D0F C9           RET                     ; indirect jump to class routine and
                                ; by subsequent RET to SCAN-LOOP.

; -----------------------
; THE 'SEPARATOR' ROUTINE
; -----------------------

;; SEPARATOR
0D10 DF           RST     18H             ; GET-CHAR
0D11 B9           CP      C               ;
0D12 20 12        JR      NZ,L0D26        ; to REPORT-C2
                                ; 'Nonsense in BASIC'

0D14 E7           RST     20H             ; NEXT-CHAR
0D15 C9           RET                     ; return


; -------------------------
; THE 'COMMAND CLASS' TABLE
; -------------------------
;

;; class-tbl
0D16    DEFB    L0D2D - $       ; 17 offset to; Address: CLASS-0
        DEFB    L0D3C - $       ; 25 offset to; Address: CLASS-1
        DEFB    L0D6B - $       ; 53 offset to; Address: CLASS-2
        DEFB    L0D28 - $       ; 0F offset to; Address: CLASS-3
        DEFB    L0D85 - $       ; 6B offset to; Address: CLASS-4
        DEFB    L0D2E - $       ; 13 offset to; Address: CLASS-5
        DEFB    L0D92 - $       ; 76 offset to; Address: CLASS-6


; --------------------------
; THE 'CHECK END' SUBROUTINE
; --------------------------
; Check for end of statement and that no spurious characters occur after
; a correctly parsed statement. Since only one statement is allowed on each
; line, the only character that may follow a statement is a NEWLINE.
;

;; CHECK-END
0D1D CD A6 0D     CALL    L0DA6           ; routine SYNTAX-Z
0D20 C0           RET     NZ              ; return in runtime.

0D21 C1           POP     BC              ; else drop return address.

;; CHECK-2
0D22 7E           LD      A,(HL)          ; fetch character.
0D23 FE 76        CP      $76             ; compare to NEWLINE.
0D25 C8           RET     Z               ; return if so.

;; REPORT-C2
0D26 18 72        JR      L0D9A           ; to REPORT-C
                                ; 'Nonsense in BASIC'

; --------------------------
; COMMAND CLASSES 03, 00, 05
; --------------------------
;
;

;; CLASS-3
0D28 FE 76        CP      $76             ;
0D2A CD 9C 0D     CALL    L0D9C           ; routine NO-TO-STK

;; CLASS-0
0D2D BF           CP      A               ;

;; CLASS-5
0D2E C1           POP     BC              ;
0D2F CC 1D 0D     CALL    Z,L0D1D         ; routine CHECK-END
0D32 EB           EX      DE,HL           ;
0D33 2A 30 40     LD      HL,($4030)      ; sv T_ADDR_lo
0D36 4E           LD      C,(HL)          ;
0D37 23           INC     HL              ;
0D38 46           LD      B,(HL)          ;
0D39 EB           EX      DE,HL           ;

;; CLASS-END
0D3A C5           PUSH    BC              ;
0D3B C9           RET                     ;

; ------------------------------
; COMMAND CLASSES 01, 02, 04, 06
; ------------------------------
;
;

;; CLASS-1
0D3C CD 1C 11     CALL    L111C           ; routine LOOK-VARS

;; CLASS-4-2
0D3F FD 36 2D 00  LD      (IY+$2D),$00    ; sv FLAGX
0D43 30 08        JR      NC,L0D4D        ; to SET-STK

0D45 FD CB 2D CE  SET     1,(IY+$2D)      ; sv FLAGX
0D49 20 18        JR      NZ,L0D63        ; to SET-STRLN


;; REPORT-2
0D4B CF           RST     08H             ; ERROR-1
        DEFB    $01             ; Error Report: Variable not found

; ---

;; SET-STK
0D4D CC A7 11     CALL    Z,L11A7         ; routine STK-VAR
0D4F 11 FD CB     BIT     6,(IY+$01)      ; sv FLAGS  - Numeric or string result?
0D50 FD CB 01 76  JR      NZ,L0D63        ; to SET-STRLN

0D52 01 76 20     XOR     A               ;
0D54 20 0D        CALL    L0DA6           ; routine SYNTAX-Z
0D55 0D           CALL    NZ,L13F8        ; routine STK-FETCH
0D56 AF           LD      HL,$402D        ; sv FLAGX
0D57 CD A6 0D     OR      (HL)            ;
0D5A C4 F8 13     LD      (HL),A          ;
0D5D 21 2D 40     EX      DE,HL           ;

;; SET-STRLN
0D63 ED 43 2E 40  LD      ($402E),BC      ; sv STRLEN_lo
0D67 22 12 40     LD      ($4012),HL      ; sv DEST-lo

; THE 'REM' COMMAND ROUTINE

;; REM
0D6A C9           RET                     ;

; ---

;; CLASS-2
0D6B C1           POP     BC              ;
0D6C 3A 01 40     LD      A,($4001)       ; sv FLAGS

;; INPUT-REP
0D6F F5           PUSH    AF              ;
0D70 CD 55 0F     CALL    L0F55           ; routine SCANNING
0D73 F1           POP     AF              ;
0D74 01 21 13     LD      BC,L1321        ; Address: LET
0D77 FD 56 01     LD      D,(IY+$01)      ; sv FLAGS
0D7A AA           XOR     D               ;
0D7B E6 40        AND     $40             ;
0D7D 20 1B        JR      NZ,L0D9A        ; to REPORT-C

0D7F CB 7A        BIT     7,D             ;
0D81 20 B7        JR      NZ,L0D3A        ; to CLASS-END

0D83 18 9D        JR      L0D22           ; to CHECK-2

; ---

;; CLASS-4
0D85 CD 1C 11     CALL    L111C           ; routine LOOK-VARS
0D88 F5           PUSH    AF              ;
0D89 79           LD      A,C             ;
0D8A F6 9F        OR      $9F             ;
0D8C 3C           INC     A               ;
0D8D 20 0B        JR       NZ,L0D9A       ; to REPORT-C

0D8F F1           POP     AF              ;
0D90 18 AD        JR      L0D3F           ; to CLASS-4-2

; ---

;; CLASS-6
0D92 CD 55 0F     CALL    L0F55           ; routine SCANNING
0D95 FD CB 01 76  BIT     6,(IY+$01)      ; sv FLAGS  - Numeric or string result?
0D99 C0           RET     NZ              ;


;; REPORT-C
0D9A CF           RST     08H             ; ERROR-1
        DEFB    $0B             ; Error Report: Nonsense in BASIC

; --------------------------------
; THE 'NUMBER TO STACK' SUBROUTINE
; --------------------------------
;
;

;; NO-TO-STK
0D9C 20 F4        JR      NZ,L0D92        ; back to CLASS-6 with a non-zero number.

0D9E CD A6 0D     CALL    L0DA6           ; routine SYNTAX-Z
0DA1 C8           RET     Z               ; return if checking syntax.

; in runtime a zero default is placed on the calculator stack.

0DA2 EF           RST     28H             ;; FP-CALC
        DEFB    $A0             ;;stk-zero
        DEFB    $34             ;;end-calc

0DA5 C9           RET                     ; return.

; -------------------------
; THE 'SYNTAX-Z' SUBROUTINE
; -------------------------
; This routine returns with zero flag set if checking syntax.
; Calling this routine uses three instruction bytes compared to four if the
; bit test is implemented inline.

;; SYNTAX-Z
0DA6 FD CB 01 7E  BIT     7,(IY+$01)      ; test FLAGS  - checking syntax only?
0DAA C9           RET                     ; return.

; ------------------------
; THE 'IF' COMMAND ROUTINE
; ------------------------
; In runtime, the class routines have evaluated the test expression and
; the result, true or false, is on the stack.

;; IF
0DAB CD A6 0D     CALL    L0DA6           ; routine SYNTAX-Z
0DAE 28 06        JR      Z,L0DB6         ; forward if checking syntax to IF-END

; else delete the Boolean value on the calculator stack.

0DB0 EF           RST     28H             ;; FP-CALC
        DEFB    $02             ;;delete
        DEFB    $34             ;;end-calc

; register DE points to exponent of floating point value.

0DB3 1A           LD      A,(DE)          ; fetch exponent.
0DB4 A7           AND     A               ; test for zero - FALSE.
0DB5 C8           RET     Z               ; return if so.

;; IF-END
0DB6 C3 DE 0C     JP      L0CDE           ; jump back to LINE-NULL

; -------------------------
; THE 'FOR' COMMAND ROUTINE
; -------------------------
;
;

;; FOR
0DB9 FE E0        CP      $E0             ; is current character 'STEP' ?
0DBB 20 09        JR      NZ,L0DC6        ; forward if not to F-USE-ONE


0DBD E7           RST     20H             ; NEXT-CHAR
0DBE CD 92 0D     CALL    L0D92           ; routine CLASS-6 stacks the number
0DC1 CD 1D 0D     CALL    L0D1D           ; routine CHECK-END
0DC4 18 06        JR      L0DCC           ; forward to F-REORDER

; ---

;; F-USE-ONE
0DC6 CD 1D 0D     CALL    L0D1D           ; routine CHECK-END

0DC9 EF           RST     28H             ;; FP-CALC
        DEFB    $A1             ;;stk-one
        DEFB    $34             ;;end-calc



;; F-REORDER
0DCC EF           RST     28H             ;; FP-CALC      v, l, s.
        DEFB    $C0             ;;st-mem-0      v, l, s.
        DEFB    $02             ;;delete        v, l.
        DEFB    $01             ;;exchange      l, v.
        DEFB    $E0             ;;get-mem-0     l, v, s.
        DEFB    $01             ;;exchange      l, s, v.
        DEFB    $34             ;;end-calc      l, s, v.

0DD3 CD 21 13     CALL    L1321           ; routine LET

0DD6 22 1F 40     LD      ($401F),HL      ; set MEM to address variable.
0DD9 2B           DEC     HL              ; point to letter.
0DDA 7E           LD      A,(HL)          ;
0DDB CB FE        SET     7,(HL)          ;
0DDD 01 06 00     LD      BC,$0006        ;
0DE0 09           ADD     HL,BC           ;
0DE1 07           RLCA                    ;
0DE2 38 06        JR      C,L0DEA         ; to F-LMT-STP

0DE4 CB 21        SLA     C               ;
0DE6 CD 9E 09     CALL    L099E           ; routine MAKE-ROOM
0DE9 23           INC     HL              ;

;; F-LMT-STP
0DEA E5           PUSH    HL              ;

0DEB EF           RST     28H             ;; FP-CALC
        DEFB    $02             ;;delete
        DEFB    $02             ;;delete
        DEFB    $34             ;;end-calc

0DEF E1           POP     HL              ;
0DF0 EB           EX      DE,HL           ;

0DF1 0E 0A        LD      C,$0A           ; ten bytes to be moved.
0DF3 ED B0        LDIR                    ; copy bytes

0DF5 2A 07 40     LD      HL,($4007)      ; set HL to system variable PPC current line.
0DF8 EB           EX      DE,HL           ; transfer to DE, variable pointer to HL.
0DF9 13           INC     DE              ; loop start will be this line + 1 at least.
0DFA 73           LD      (HL),E          ;
0DFB 23           INC     HL              ;
0DFC 72           LD      (HL),D          ;
0DFD CD 5A 0E     CALL    L0E5A           ; routine NEXT-LOOP considers an initial pass.
0E00 D0           RET     NC              ; return if possible.

; else program continues from point following matching NEXT.

0E01 FD CB 08 7E  BIT     7,(IY+$08)      ; test PPC_hi
0E05 C0           RET     NZ              ; return if over 32767 ???

0E06 FD 46 2E     LD      B,(IY+$2E)      ; fetch variable name from STRLEN_lo
0E09 CB B0        RES     6,B             ; make a true letter.
0E0B 2A 29 40     LD      HL,($4029)      ; set HL from NXTLIN

; now enter a loop to look for matching next.

;; NXTLIN-NO
0E0E 7E           LD      A,(HL)          ; fetch high byte of line number.
0E0F E6 C0        AND     $C0             ; mask off low bits $3F
0E11 20 17        JR      NZ,L0E2A        ; forward at end of program to FOR-END

0E13 C5           PUSH    BC              ; save letter
0E14 CD F2 09     CALL    L09F2           ; routine NEXT-ONE finds next line.
0E17 C1           POP     BC              ; restore letter

0E18 23           INC     HL              ; step past low byte
0E19 23           INC     HL              ; past the
0E1A 23           INC     HL              ; line length.
0E1B CD 4C 00     CALL    L004C           ; routine TEMP-PTR1 sets CH_ADD

0E1E DF           RST     18H             ; GET-CHAR
0E1F FE F3        CP      $F3             ; compare to 'NEXT'.
0E21 EB           EX      DE,HL           ; next line to HL.
0E22 20 EA        JR      NZ,L0E0E        ; back with no match to NXTLIN-NO

;

0E24 EB           EX      DE,HL           ; restore pointer.

0E25 E7           RST     20H             ; NEXT-CHAR advances and gets letter in A.
0E26 EB           EX      DE,HL           ; save pointer
0E27 B8           CP      B               ; compare to variable name.
0E28 20 E4        JR      NZ,L0E0E        ; back with mismatch to NXTLIN-NO

;; FOR-END
0E2A 22 29 40     LD      ($4029),HL      ; update system variable NXTLIN
0E2D C9           RET                     ; return.

; --------------------------
; THE 'NEXT' COMMAND ROUTINE
; --------------------------
;
;

;; NEXT
0E2E FD CB 2D 4E  BIT     1,(IY+$2D)      ; sv FLAGX
0E32 C2 4B 0D     JP      NZ,L0D4B        ; to REPORT-2

0E35 2A 12 40     LD      HL,($4012)      ; DEST
0E38 CB 7E        BIT     7,(HL)          ;
0E3A 28 1C        JR      Z,L0E58         ; to REPORT-1

0E3C 23           INC     HL              ;
0E3D 22 1F 40     LD      ($401F),HL      ; sv MEM_lo

0E40 EF           RST     28H             ;; FP-CALC
        DEFB    $E0             ;;get-mem-0
        DEFB    $E2             ;;get-mem-2
        DEFB    $0F             ;;addition
        DEFB    $C0             ;;st-mem-0
        DEFB    $02             ;;delete
        DEFB    $34             ;;end-calc

0E47 CD 5A 0E     CALL    L0E5A           ; routine NEXT-LOOP
0E4A D8           RET     C               ;

0E4B 2A 1F 40     LD      HL,($401F)      ; sv MEM_lo
0E4E 11 0F 00     LD      DE,$000F        ;
0E51 19           ADD     HL,DE           ;
0E52 5E           LD      E,(HL)          ;
0E53 23           INC     HL              ;
0E54 56           LD      D,(HL)          ;
0E55 EB           EX      DE,HL           ;
0E56 18 2E        JR      L0E86           ; to GOTO-2

; ---


;; REPORT-1
0E58 CF           RST     08H             ; ERROR-1
        DEFB    $00             ; Error Report: NEXT without FOR


; --------------------------
; THE 'NEXT-LOOP' SUBROUTINE
; --------------------------
;
;

;; NEXT-LOOP
0E5A EF           RST     28H             ;; FP-CALC
        DEFB    $E1             ;;get-mem-1
        DEFB    $E0             ;;get-mem-0
        DEFB    $E2             ;;get-mem-2
        DEFB    $32             ;;less-0
        DEFB    $00             ;;jump-true
        DEFB    $02             ;;to L0E62, LMT-V-VAL

        DEFB    $01             ;;exchange

;; LMT-V-VAL
0E62    DEFB    $03             ;;subtract
        DEFB    $33             ;;greater-0
        DEFB    $00             ;;jump-true
        DEFB    $04             ;;to L0E69, IMPOSS

        DEFB    $34             ;;end-calc

0E67 A7           AND     A               ; clear carry flag
0E68 C9           RET                     ; return.

; ---


;; IMPOSS
0E69    DEFB    $34             ;;end-calc

0E6A 37           SCF                     ; set carry flag
0E6B C9           RET                     ; return.

; --------------------------
; THE 'RAND' COMMAND ROUTINE
; --------------------------
; The keyword was 'RANDOMISE' on the ZX80, is 'RAND' here on the ZX81 and
; becomes 'RANDOMIZE' on the ZX Spectrum.
; In all invocations the procedure is the same - to set the SEED system variable
; with a supplied integer value or to use a time-based value if no number, or
; zero, is supplied.

;; RAND
0E6C CD A7 0E     CALL    L0EA7           ; routine FIND-INT
0E6F 78           LD      A,B             ; test value
0E70 B1           OR      C               ; for zero
0E71 20 04        JR      NZ,L0E77        ; forward if not zero to SET-SEED

0E73 ED 4B 34 40  LD      BC,($4034)      ; fetch value of FRAMES system variable.

;; SET-SEED
0E77 ED 43 32 40  LD       ($4032),BC     ; update the SEED system variable.
0E7B C9           RET                     ; return.

; --------------------------
; THE 'CONT' COMMAND ROUTINE
; --------------------------
; Another abbreviated command. ROM space was really tight.
; CONTINUE at the line number that was set when break was pressed.
; Sometimes the current line, sometimes the next line.

;; CONT
0E7C 2A 2B 40     LD      HL,($402B)      ; set HL from system variable OLDPPC
0E7F 18 05        JR      L0E86           ; forward to GOTO-2

; --------------------------
; THE 'GOTO' COMMAND ROUTINE
; --------------------------
; This token also suffered from the shortage of room and there is no space
; getween GO and TO as there is on the ZX80 and ZX Spectrum. The same also
; applies to the GOSUB keyword.

;; GOTO
0E81 CD A7 0E     CALL    L0EA7           ; routine FIND-INT
0E84 60           LD      H,B             ;
0E85 69           LD      L,C             ;

;; GOTO-2
0E86 7C           LD      A,H             ;
0E87 FE F0        CP      $F0             ;
0E89 30 22        JR      NC,L0EAD        ; to REPORT-B

0E8B CD D8 09     CALL    L09D8           ; routine LINE-ADDR
0E8E 22 29 40     LD      ($4029),HL      ; sv NXTLIN_lo
0E91 C9           RET                     ;

; --------------------------
; THE 'POKE' COMMAND ROUTINE
; --------------------------
;
;

;; POKE
0E92 CD CD 15     CALL    L15CD           ; routine FP-TO-A
0E95 38 16        JR      C,L0EAD         ; forward, with overflow, to REPORT-B

0E97 28 02        JR      Z,L0E9B         ; forward, if positive, to POKE-SAVE

0E99 ED 44        NEG                     ; negate

;; POKE-SAVE
0E9B F5           PUSH    AF              ; preserve value.
0E9C CD A7 0E     CALL    L0EA7           ; routine FIND-INT gets address in BC
                                ; invoking the error routine with overflow
                                ; or a negative number.
0E9F F1           POP     AF              ; restore value.

; Note. the next two instructions are legacy code from the ZX80 and
; inappropriate here.

0EA0 FD CB 00 7E  BIT     7,(IY+$00)      ; test ERR_NR - is it still $FF ?
0EA4 C8           RET     Z               ; return with error.

0EA5 02           LD      (BC),A          ; update the address contents.
0EA6 C9           RET                     ; return.

; -----------------------------
; THE 'FIND INTEGER' SUBROUTINE
; -----------------------------
;
;

;; FIND-INT
0EA7 CD 8A 15     CALL    L158A           ; routine FP-TO-BC
0EAA 38 01        JR      C,L0EAD         ; forward with overflow to REPORT-B

0EAC C8           RET     Z               ; return if positive (0-65535).


;; REPORT-B
0EAD CF           RST     08H             ; ERROR-1
        DEFB    $0A             ; Error Report: Integer out of range

; -------------------------
; THE 'RUN' COMMAND ROUTINE
; -------------------------
;
;

;; RUN
0EAF CD 81 0E     CALL    L0E81           ; routine GOTO
0EB2 C3 9A 14     JP      L149A           ; to CLEAR

; ---------------------------
; THE 'GOSUB' COMMAND ROUTINE
; ---------------------------
;
;

;; GOSUB
0EB5 2A 07 40     LD      HL,($4007)      ; sv PPC_lo
0EB8 23           INC     HL              ;
0EB9 E3           EX      (SP),HL         ;
0EBA E5           PUSH    HL              ;
0EBB ED 73 02 40  LD      ($4002),SP      ; set the error stack pointer - ERR_SP
0EBF CD 81 0E     CALL    L0E81           ; routine GOTO
0EC2 01 06 00     LD      BC,$0006        ;

; --------------------------
; THE 'TEST ROOM' SUBROUTINE
; --------------------------
;
;

;; TEST-ROOM
0EC5 2A 1C 40     LD      HL,($401C)      ; sv STKEND_lo
0EC8 09           ADD     HL,BC           ;
0EC9 38 08        JR      C,L0ED3         ; to REPORT-4

0ECB EB           EX      DE,HL           ;
0ECC 21 24 00     LD      HL,$0024        ;
0ECF 19           ADD     HL,DE           ;
0ED0 ED 72        SBC     HL,SP           ;
0ED2 D8           RET     C               ;

;; REPORT-4
0ED3 2E 03        LD      L,$03           ;
0ED5 C3 58 00     JP      L0058           ; to ERROR-3

; ----------------------------
; THE 'RETURN' COMMAND ROUTINE
; ----------------------------
;
;

;; RETURN
0ED8 E1           POP     HL              ;
0ED9 E3           EX      (SP),HL         ;
0EDA 7C           LD      A,H             ;
0EDB FE 3E        CP      $3E             ;
0EDD 28 06        JR      Z,L0EE5         ; to REPORT-7

0EDF ED 73 02 40  LD      ($4002),SP      ; sv ERR_SP_lo
0EE3 18 A1        JR      L0E86           ; back to GOTO-2

; ---

;; REPORT-7
0EE5 E3           EX      (SP),HL         ;
0EE6 E5           PUSH    HL              ;

0EE7 CF           RST     08H             ; ERROR-1
        DEFB    $06             ; Error Report: RETURN without GOSUB

; ---------------------------
; THE 'INPUT' COMMAND ROUTINE
; ---------------------------
;
;

;; INPUT
0EE9 FD CB 08 7E  BIT     7,(IY+$08)      ; sv PPC_hi
0EEA CB 08        JR      NZ,L0F21        ; to REPORT-8

0EEC 7E           CALL    L14A3           ; routine X-TEMP
0EED 20 32        LD      HL,$402D        ; sv FLAGX
0EEF CD A3 14     SET     5,(HL)          ;
0EF2 21 2D 40     RES     6,(HL)          ;
0EF5 CB EE        LD      A,($4001)       ; sv FLAGS
0EF7 CB B6        AND     $40             ;
0EF9 3A 01 40     LD      BC,$0002        ;
0EFC E6 40        JR      NZ,L0F05        ; to PROMPT

0EFE 01 02 00     LD      C,$04           ;

;; PROMPT
0F05 B6           OR      (HL)            ;
0F06 77           LD      (HL),A          ;

0F07 F7           RST     30H             ; BC-SPACES
0F08 36 76        LD      (HL),$76        ;
0F0A 79           LD      A,C             ;
0F0B 0F           RRCA                    ;
0F0C 0F           RRCA                    ;
0F0D 38 05        JR      C,L0F14         ; to ENTER-CUR

0F0F 3E 0B        LD      A,$0B           ;
0F11 12           LD      (DE),A          ;
0F12 2B           DEC     HL              ;
0F13 77           LD      (HL),A          ;

;; ENTER-CUR
0F14 2B           DEC     HL              ;
0F15 36 7F        LD      (HL),$7F        ;
0F17 2A 39 40     LD      HL,($4039)      ; sv S_POSN_x
0F1A 22 30 40     LD      ($4030),HL      ; sv T_ADDR_lo
0F1D E1           POP     HL              ;
0F1E C3 72 04     JP      L0472           ; to LOWER

; ---

;; REPORT-8
0F21 CF           RST     08H             ; ERROR-1
        DEFB    $07             ; Error Report: End of file

; ---------------------------
; THE 'PAUSE' COMMAND ROUTINE
; ---------------------------
;
;

;; FAST
0F23 CD E7 02     CALL    L02E7           ; routine SET-FAST
0F26 FD CB 3B B6  RES     6,(IY+$3B)      ; sv CDFLAG
0F2A C9           RET                     ; return.

; --------------------------
; THE 'SLOW' COMMAND ROUTINE
; --------------------------
;
;

;; SLOW
0F2B FD CB 3B F6  SET     6,(IY+$3B)      ; sv CDFLAG
0F2F C3 07 02     JP      L0207           ; to SLOW/FAST

; ---------------------------
; THE 'PAUSE' COMMAND ROUTINE
; ---------------------------

;; PAUSE
0F32 CD A7 0E     CALL    L0EA7           ; routine FIND-INT
0F35 CD E7 02     CALL    L02E7           ; routine SET-FAST
0F38 60           LD      H,B             ;
0F39 69           LD      L,C             ;
0F3A CD 2D 02     CALL    L022D           ; routine DISPLAY-P

0F3D FD 36 35 FF  LD      (IY+$35),$FF    ; sv FRAMES_hi

0F41 CD 07 02     CALL    L0207           ; routine SLOW/FAST
0F44 18 05        JR      L0F4B           ; routine DEBOUNCE

; ----------------------
; THE 'BREAK' SUBROUTINE
; ----------------------
;
;

;; BREAK-1
0F46 3E 7F        LD      A,$7F           ; read port $7FFE - keys B,N,M,.,SPACE.
0F48 DB FE        IN      A,($FE)         ;
0F4A 1F           RRA                     ; carry will be set if space not pressed.

; -------------------------
; THE 'DEBOUNCE' SUBROUTINE
; -------------------------
;
;

;; DEBOUNCE
0F4B FD CB 3B 86  RES     0,(IY+$3B)      ; update system variable CDFLAG
0F4F 3E FF        LD      A,$FF           ;
0F51 32 27 40     LD      ($4027),A       ; update system variable DEBOUNCE
0F54 C9           RET                     ; return.


; -------------------------
; THE 'SCANNING' SUBROUTINE
; -------------------------
; This recursive routine is where the ZX81 gets its power. Provided there is
; enough memory it can evaluate an expression of unlimited complexity.
; Note. there is no unary plus so, as on the ZX80, PRINT +1 gives a syntax error.
; PRINT +1 works on the Spectrum but so too does PRINT + "STRING".

;; SCANNING
0F55 DF           RST     18H             ; GET-CHAR
0F56 06 00        LD      B,$00           ; set B register to zero.
0F58 C5           PUSH    BC              ; stack zero as a priority end-marker.

;; S-LOOP-1
0F59 FE 40        CP      $40             ; compare to the 'RND' character
0F5B 20 2F        JR      NZ,L0F8C        ; forward, if not, to S-TEST-PI

; ------------------
; THE 'RND' FUNCTION
; ------------------

0F5D CD A6 0D     CALL    L0DA6           ; routine SYNTAX-Z
0F60 28 28        JR      Z,L0F8A         ; forward if checking syntax to S-JPI-END

0F62 ED 4B 32 40  LD      BC,($4032)      ; sv SEED_lo
0F66 CD 20 15     CALL    L1520           ; routine STACK-BC

0F69 EF           RST     28H             ;; FP-CALC
        DEFB    $A1             ;;stk-one
        DEFB    $0F             ;;addition
        DEFB    $30             ;;stk-data
        DEFB    $37             ;;Exponent: $87, Bytes: 1
        DEFB    $16             ;;(+00,+00,+00)
        DEFB    $04             ;;multiply
        DEFB    $30             ;;stk-data
        DEFB    $80             ;;Bytes: 3
        DEFB    $41             ;;Exponent $91
        DEFB    $00,$00,$80     ;;(+00)
        DEFB    $2E             ;;n-mod-m
        DEFB    $02             ;;delete
        DEFB    $A1             ;;stk-one
        DEFB    $03             ;;subtract
        DEFB    $2D             ;;duplicate
        DEFB    $34             ;;end-calc

0F7C CD 8A 15     CALL    L158A           ; routine FP-TO-BC
0F7F ED 43 32 40  LD      ($4032),BC      ; update the SEED system variable.
0F83 7E           LD      A,(HL)          ; HL addresses the exponent of the last value.
0F84 A7           AND     A               ; test for zero
0F85 28 03        JR      Z,L0F8A         ; forward, if so, to S-JPI-END

0F87 D6 10        SUB     $10             ; else reduce exponent by sixteen
0F89 77           LD      (HL),A          ; thus dividing by 65536 for last value.

;; S-JPI-END
0F8A 18 0D        JR      L0F99           ; forward to S-PI-END

; ---

;; S-TEST-PI
0F8C FE 42        CP      $42             ; the 'PI' character
0F8E 20 0D        JR      NZ,L0F9D        ; forward, if not, to S-TST-INK

; -------------------
; THE 'PI' EVALUATION
; -------------------

0F90 CD A6 0D     CALL    L0DA6           ; routine SYNTAX-Z
0F93 28 04        JR      Z,L0F99         ; forward if checking syntax to S-PI-END


0F95 EF           RST     28H             ;; FP-CALC
        DEFB    $A3             ;;stk-pi/2
        DEFB    $34             ;;end-calc

0F98 34           INC     (HL)            ; double the exponent giving PI on the stack.

;; S-PI-END
0F99 E7           RST     20H             ; NEXT-CHAR advances character pointer.

0F9A C3 83 10     JP      L1083           ; jump forward to S-NUMERIC to set the flag
                                ; to signal numeric result before advancing.

; ---

;; S-TST-INK
0F9D FE 41        CP      $41             ; compare to character 'INKEY$'
0F9F 20 11        JR      NZ,L0FB2        ; forward, if not, to S-ALPHANUM

; -----------------------
; THE 'INKEY$' EVALUATION
; -----------------------

0FA1 CD BB 02     CALL    L02BB           ; routine KEYBOARD
0FA4 44           LD      B,H             ;
0FA5 4D           LD      C,L             ;
0FA6 51           LD      D,C             ;
0FA7 14           INC     D               ;
0FA8 C4 BD 07     CALL    NZ,L07BD        ; routine DECODE
0FAB 7A           LD      A,D             ;
0FAC 8A           ADC     A,D             ;
0FAD 42           LD      B,D             ;
0FAE 4F           LD      C,A             ;
0FAF EB           EX      DE,HL           ;
0FB0 18 3B        JR      L0FED           ; forward to S-STRING

; ---

;; S-ALPHANUM
0FB2 CD D2 14     CALL    L14D2           ; routine ALPHANUM
0FB5 38 6E        JR      C,L1025         ; forward, if alphanumeric to S-LTR-DGT

0FB7 FE 1B        CP      $1B             ; is character a '.' ?
0FB9 CA 47 10     JP      Z,L1047         ; jump forward if so to S-DECIMAL

0FBC 01 D8 09     LD      BC,$09D8        ; prepare priority 09, operation 'subtract'
0FBF FE 16        CP      $16             ; is character unary minus '-' ?
0FC1 28 5D        JR      Z,L1020         ; forward, if so, to S-PUSH-PO

0FC3 FE 10        CP      $10             ; is character a '(' ?
0FC5 20 0F        JR      NZ,L0FD6        ; forward if not to S-QUOTE

0FC7 CD 49 00     CALL    L0049           ; routine CH-ADD+1 advances character pointer.

0FCA CD 55 0F     CALL    L0F55           ; recursively call routine SCANNING to
                                ; evaluate the sub-expression.

0FCD FE 11        CP      $11             ; is subsequent character a ')' ?
0FCF 20 2E        JR      NZ,L0FFF        ; forward if not to S-RPT-C


0FD1 CD 49 00     CALL    L0049           ; routine CH-ADD+1  advances.
0FD4 18 22        JR      L0FF8           ; relative jump to S-JP-CONT3 and then S-CONT3

; ---

; consider a quoted string e.g. PRINT "Hooray!"
; Note. quotes are not allowed within a string.

;; S-QUOTE
0FD6 FE 0B        CP      $0B             ; is character a quote (") ?
0FD8 20 28        JR      NZ,L1002        ; forward, if not, to S-FUNCTION

0FDA CD 49 00     CALL    L0049           ; routine CH-ADD+1 advances
0FDD E5           PUSH    HL              ; * save start of string.
0FDE 18 03        JR      L0FE3           ; forward to S-QUOTE-S

; ---


;; S-Q-AGAIN
0FE0 CD 49 00     CALL    L0049           ; routine CH-ADD+1

;; S-QUOTE-S
0FE3 FE 0B        CP      $0B             ; is character a '"' ?
0FE5 20 14        JR      NZ,L0FFB        ; forward if not to S-Q-NL

0FE7 D1           POP     DE              ; * retrieve start of string
0FE8 A7           AND     A               ; prepare to subtract.
0FE9 ED 52        SBC     HL,DE           ; subtract start from current position.
0FEB 44           LD      B,H             ; transfer this length
0FEC 4D           LD      C,L             ; to the BC register pair.

;; S-STRING
0FED 21 01 40     LD      HL,$4001        ; address system variable FLAGS
0FF0 CB B6        RES     6,(HL)          ; signal string result
0FF2 CB 7E        BIT     7,(HL)          ; test if checking syntax.

0FF4 C4 C3 12     CALL    NZ,L12C3        ; in run-time routine STK-STO-$ stacks the
                                ; string descriptor - start DE, length BC.

0FF7 E7           RST     20H             ; NEXT-CHAR advances pointer.

;; S-J-CONT-3
0FF8 C3 88 10     JP      L1088           ; jump to S-CONT-3

; ---

; A string with no terminating quote has to be considered.

;; S-Q-NL
0FFB FE 76        CP      $76             ; compare to NEWLINE
0FFD 20 E1        JR      NZ,L0FE0        ; loop back if not to S-Q-AGAIN

;; S-RPT-C
0FFF C3 9A 0D     JP      L0D9A           ; to REPORT-C

; ---

;; S-FUNCTION
1002 D6 C4        SUB     $C4             ; subtract 'CODE' reducing codes
                                ; CODE thru '<>' to range $00 - $XX
1004 38 F9        JR      C,L0FFF         ; back, if less, to S-RPT-C

; test for NOT the last function in character set.

1006 01 EC 04     LD      BC,$04EC        ; prepare priority $04, operation 'not'
1009 FE 13        CP      $13             ; compare to 'NOT'  ( - CODE)
100B 28 13        JR      Z,L1020         ; forward, if so, to S-PUSH-PO

100D 30 F0        JR      NC,L0FFF        ; back with anything higher to S-RPT-C

; else is a function 'CODE' thru 'CHR$'

100F 06 10        LD      B,$10           ; priority sixteen binds all functions to
                                ; arguments removing the need for brackets.

1011 C6 D9        ADD     A,$D9           ; add $D9 to give range $D9 thru $EB
                                ; bit 6 is set to show numeric argument.
                                ; bit 7 is set to show numeric result.

; now adjust these default argument/result indicators.

1013 4F           LD      C,A             ; save code in C

1014 FE DC        CP      $DC             ; separate 'CODE', 'VAL', 'LEN'
1016 30 02        JR      NC,L101A        ; skip forward if string operand to S-NO-TO-$

1018 CB B1        RES     6,C             ; signal string operand.

;; S-NO-TO-$
101A FE EA        CP      $EA             ; isolate top of range 'STR$' and 'CHR$'
101C 38 02        JR      C,L1020         ; skip forward with others to S-PUSH-PO

101E CB B9        RES     7,C             ; signal string result.

;; S-PUSH-PO
1020 C5           PUSH    BC              ; push the priority/operation

1021 E7           RST     20H             ; NEXT-CHAR
1022 C3 59 0F     JP      L0F59           ; jump back to S-LOOP-1

; ---

;; S-LTR-DGT
1025 FE 26        CP      $26             ; compare to 'A'.
1027 38 1E        JR      C,L1047         ; forward if less to S-DECIMAL

1029 CD 1C 11     CALL    L111C           ; routine LOOK-VARS
102C DA 4B 0D     JP      C,L0D4B         ; back if not found to REPORT-2
                                ; a variable is always 'found' when checking
                                ; syntax.

102F CC A7 11     CALL    Z,L11A7         ; routine STK-VAR stacks string parameters or
                                ; returns cell location if numeric.

1032 3A 01 40     LD      A,($4001)       ; fetch FLAGS
1035 FE C0        CP      $C0             ; compare to numeric result/numeric operand
1037 38 4E        JR      C,L1087         ; forward if not numeric to S-CONT-2

1039 23           INC     HL              ; address numeric contents of variable.
103A ED 5B 1C 40  LD      DE,($401C)      ; set destination to STKEND
103E CD F6 19     CALL    L19F6           ; routine MOVE-FP stacks the five bytes
1041 EB           EX      DE,HL           ; transfer new free location from DE to HL.
1042 22 1C 40     LD      ($401C),HL      ; update STKEND system variable.
1045 18 40        JR      L1087           ; forward to S-CONT-2

; ---

; The Scanning Decimal routine is invoked when a decimal point or digit is
; found in the expression.
; When checking syntax, then the 'hidden floating point' form is placed
; after the number in the BASIC line.
; In run-time, the digits are skipped and the floating point number is picked
; up.

;; S-DECIMAL
1047 CD A6 0D     CALL    L0DA6           ; routine SYNTAX-Z
104A 20 23        JR      NZ,L106F        ; forward in run-time to S-STK-DEC

104C CD D9 14     CALL    L14D9           ; routine DEC-TO-FP

104F DF           RST     18H             ; GET-CHAR advances HL past digits
1050 01 06 00     LD      BC,$0006        ; six locations are required.
1053 CD 9E 09     CALL    L099E           ; routine MAKE-ROOM
1056 23           INC     HL              ; point to first new location
1057 36 7E        LD      (HL),$7E        ; insert the number marker 126 decimal.
1059 23           INC     HL              ; increment
105A EB           EX      DE,HL           ; transfer destination to DE.
105B 2A 1C 40     LD      HL,($401C)      ; set HL from STKEND which points to the
                                ; first location after the 'last value'
105E 0E 05        LD      C,$05           ; five bytes to move.
1060 A7           AND     A               ; clear carry.
1061 ED 42        SBC     HL,BC           ; subtract five pointing to 'last value'.
1063 22 1C 40     LD      ($401C),HL      ; update STKEND thereby 'deleting the value.

1066 ED B0        LDIR                    ; copy the five value bytes.

1068 EB           EX      DE,HL           ; basic pointer to HL which may be white-space
                                ; following the number.
1069 2B           DEC     HL              ; now points to last of five bytes.
106A CD 4C 00     CALL    L004C           ; routine TEMP-PTR1 advances the character
                                ; address skipping any white-space.
106D 18 14        JR      L1083           ; forward to S-NUMERIC
                                ; to signal a numeric result.

; ---

; In run-time the branch is here when a digit or point is encountered.

;; S-STK-DEC
106F E7           RST     20H             ; NEXT-CHAR
1070 FE 7E        CP      $7E             ; compare to 'number marker'
1072 20 FB        JR      NZ,L106F        ; loop back until found to S-STK-DEC
                                ; skipping all the digits.

1074 23           INC     HL              ; point to first of five hidden bytes.
1075 ED 5B 1C 40  LD      DE,($401C)      ; set destination from STKEND system variable
1079 CD F6 19     CALL    L19F6           ; routine MOVE-FP stacks the number.
107C ED 53 1C 40  LD      ($401C),DE      ; update system variable STKEND.
1080 22 16 40     LD      ($4016),HL      ; update system variable CH_ADD.

;; S-NUMERIC
1083 FD CB 01 F6  SET     6,(IY+$01)      ; update FLAGS  - Signal numeric result

;; S-CONT-2
1087 DF           RST     18H             ; GET-CHAR

;; S-CONT-3
1088 FE 10        CP      $10             ; compare to opening bracket '('
108A 20 0C        JR      NZ,L1098        ; forward if not to S-OPERTR

108C FD CB 01 76  BIT     6,(IY+$01)      ; test FLAGS  - Numeric or string result?
1090 20 2A        JR      NZ,L10BC        ; forward if numeric to S-LOOP

; else is a string

1092 CD 63 12     CALL    L1263           ; routine SLICING

1095 E7           RST     20H             ; NEXT-CHAR
1096 18 F0        JR      L1088           ; back to S-CONT-3

; ---

; the character is now manipulated to form an equivalent in the table of
; calculator literals. This is quite cumbersome and in the ZX Spectrum a
; simple look-up table was introduced at this point.

;; S-OPERTR
1098 01 C3 00     LD      BC,$00C3        ; prepare operator 'subtract' as default.
                                ; also set B to zero for later indexing.

109B FE 12        CP      $12             ; is character '>' ?
109D 38 1D        JR      C,L10BC         ; forward if less to S-LOOP as
                                ; we have reached end of meaningful expression

109F D6 16        SUB     $16             ; is character '-' ?
10A1 30 04        JR      NC,L10A7        ; forward with - * / and '**' '<>' to SUBMLTDIV

10A3 C6 0D        ADD     A,$0D           ; increase others by thirteen
                                ; $09 '>' thru $0C '+'
10A5 18 0E        JR      L10B5           ; forward to GET-PRIO

; ---

;; SUBMLTDIV
10A7 FE 03        CP      $03             ; isolate $00 '-', $01 '*', $02 '/'
10A9 38 0A        JR      C,L10B5         ; forward if so to GET-PRIO

; else possibly originally $D8 '**' thru $DD '<>' already reduced by $16

10AB D6 C2        SUB     $C2             ; giving range $00 to $05
10AD 38 0D        JR      C,L10BC         ; forward if less to S-LOOP

10AF FE 06        CP      $06             ; test the upper limit for nonsense also
10B1 30 09        JR      NC,L10BC        ; forward if so to S-LOOP

10B3 C6 03        ADD     A,$03           ; increase by 3 to give combined operators of

                                ; $00 '-'
                                ; $01 '*'
                                ; $02 '/'

                                ; $03 '**'
                                ; $04 'OR'
                                ; $05 'AND'
                                ; $06 '<='
                                ; $07 '>='
                                ; $08 '<>'

                                ; $09 '>'
                                ; $0A '<'
                                ; $0B '='
                                ; $0C '+'

;; GET-PRIO
10B5 81           ADD     A,C             ; add to default operation 'sub' ($C3)
10B6 4F           LD      C,A             ; and place in operator byte - C.

10B7 21 4C 10     LD      HL,L110F - $C3  ; theoretical base of the priorities table.
10BA 09           ADD     HL,BC           ; add C ( B is zero)
10BB 46           LD      B,(HL)          ; pick up the priority in B

;; S-LOOP
10BC D1           POP     DE              ; restore previous
10BD 7A           LD      A,D             ; load A with priority.
10BE B8           CP      B               ; is present priority higher
10BF 38 2C        JR      C,L10ED         ; forward if so to S-TIGHTER

10C1 A7           AND     A               ; are both priorities zero
10C2 CA 18 00     JP      Z,L0018         ; exit if zero via GET-CHAR

10C5 C5           PUSH    BC              ; stack present values
10C6 D5           PUSH    DE              ; stack last values
10C7 CD A6 0D     CALL    L0DA6           ; routine SYNTAX-Z
10CA 28 09        JR      Z,L10D5         ; forward is checking syntax to S-SYNTEST

10CC 7B           LD      A,E             ; fetch last operation
10CD E6 3F        AND     $3F             ; mask off the indicator bits to give true
                                ; calculator literal.
10CF 47           LD      B,A             ; place in the B register for BREG

; perform the single operation

10D0 EF           RST     28H             ;; FP-CALC
        DEFB    $37             ;;fp-calc-2
        DEFB    $34             ;;end-calc

10D3 18 09        JR      L10DE           ; forward to S-RUNTEST

; ---

;; S-SYNTEST
10D5 7B           LD      A,E             ; transfer masked operator to A
10D6 FD AE 01     XOR     (IY+$01)        ; XOR with FLAGS like results will reset bit 6
10D9 E6 40        AND     $40             ; test bit 6

;; S-RPORT-C
10DB C2 9A 0D     JP      NZ,L0D9A        ; back to REPORT-C if results do not agree.

; ---

; in run-time impose bit 7 of the operator onto bit 6 of the FLAGS

;; S-RUNTEST
10DE D1           POP     DE              ; restore last operation.
10DF 21 01 40     LD      HL,$4001        ; address system variable FLAGS
10E2 CB F6        SET     6,(HL)          ; presume a numeric result
10E4 CB 7B        BIT     7,E             ; test expected result in operation
10E6 20 02        JR      NZ,L10EA        ; forward if numeric to S-LOOPEND

10E8 CB B6        RES     6,(HL)          ; reset to signal string result

;; S-LOOPEND
10EA C1           POP     BC              ; restore present values
10EB 18 CF        JR      L10BC           ; back to S-LOOP

; ---

;; S-TIGHTER
10ED D5           PUSH    DE              ; push last values and consider these

10EE 79           LD      A,C             ; get the present operator.
10EF FD CB 01 76  BIT     6,(IY+$01)      ; test FLAGS  - Numeric or string result?
10F3 20 15        JR      NZ,L110A        ; forward if numeric to S-NEXT

10F5 E6 3F        AND     $3F             ; strip indicator bits to give clear literal.
10F7 C6 08        ADD     A,$08           ; add eight - augmenting numeric to equivalent
                                ; string literals.
10F9 4F           LD      C,A             ; place plain literal back in C.
10FA FE 10        CP      $10             ; compare to 'AND'
10FC 20 04        JR      NZ,L1102        ; forward if not to S-NOT-AND

10FE CB F1        SET     6,C             ; set the numeric operand required for 'AND'
1100 18 08        JR      L110A           ; forward to S-NEXT

; ---

;; S-NOT-AND
1102 38 D7        JR      C,L10DB         ; back if less than 'AND' to S-RPORT-C
                                ; Nonsense if '-', '*' etc.

1104 FE 17        CP      $17             ; compare to 'strs-add' literal
1106 28 02        JR      Z,L110A         ; forward if so signaling string result

1108 CB F9        SET     7,C             ; set bit to numeric (Boolean) for others.

;; S-NEXT
110A C5           PUSH    BC              ; stack 'present' values

110B E7           RST     20H             ; NEXT-CHAR
110C C3 59 0F     JP      L0F59           ; jump back to S-LOOP-1



; -------------------------
; THE 'TABLE OF PRIORITIES'
; -------------------------
;
;

;; tbl-pri
110F    DEFB    $06             ;       '-'
        DEFB    $08             ;       '*'
        DEFB    $08             ;       '/'
        DEFB    $0A             ;       '**'
        DEFB    $02             ;       'OR'
        DEFB    $03             ;       'AND'
        DEFB    $05             ;       '<='
        DEFB    $05             ;       '>='
        DEFB    $05             ;       '<>'
        DEFB    $05             ;       '>'
        DEFB    $05             ;       '<'
        DEFB    $05             ;       '='
        DEFB    $06             ;       '+'


; --------------------------
; THE 'LOOK-VARS' SUBROUTINE
; --------------------------
;
;

;; LOOK-VARS
111C FD CB 01 F6  SET     6,(IY+$01)      ; sv FLAGS  - Signal numeric result

1120 DF           RST     18H             ; GET-CHAR
1121 CD CE 14     CALL    L14CE           ; routine ALPHA
1124 D2 9A 0D     JP      NC,L0D9A        ; to REPORT-C

1127 E5           PUSH    HL              ;
1128 4F           LD      C,A             ;

1129 E7           RST     20H             ; NEXT-CHAR
112A E5           PUSH    HL              ;
112B CB A9        RES     5,C             ;
112D FE 10        CP      $10             ;
112F 28 17        JR      Z,L1148         ; to V-SYN/RUN

1131 CB F1        SET     6,C             ;
1133 FE 0D        CP      $0D             ;
1135 28 0C        JR      Z,L1143         ; forward to V-STR-VAR

1137 CB E9        SET     5,C             ;

;; V-CHAR
1139 CD D2 14     CALL    L14D2           ; routine ALPHANUM
113C 30 0A        JR      NC,L1148        ; forward when not to V-RUN/SYN

113E CB B1        RES     6,C             ;

1140 E7           RST     20H             ; NEXT-CHAR
1141 18 F6        JR      L1139           ; loop back to V-CHAR

; ---

;; V-STR-VAR
1143 E7           RST     20H             ; NEXT-CHAR
1144 FD CB 01 B6  RES     6,(IY+$01)      ; sv FLAGS  - Signal string result

;; V-RUN/SYN
1148 41           LD      B,C             ;
1149 CD A6 0D     CALL    L0DA6           ; routine SYNTAX-Z
114C 20 08        JR      NZ,L1156        ; forward to V-RUN

114E 79           LD      A,C             ;
114F E6 E0        AND     $E0             ;
1151 CB FF        SET     7,A             ;
1153 4F           LD      C,A             ;
1154 18 34        JR      L118A           ; forward to V-SYNTAX

; ---

;; V-RUN
1156 2A 10 40     LD      HL,($4010)      ; sv VARS

;; V-EACH
1159 7E           LD      A,(HL)          ;
115A E6 7F        AND     $7F             ;
115C 28 2A        JR      Z,L1188         ; to V-80-BYTE

115E B9           CP      C               ;
115F 20 1F        JR      NZ,L1180        ; to V-NEXT

1161 17           RLA                     ;
1162 87           ADD     A,A             ;
1163 F2 95 11     JP      P,L1195         ; to V-FOUND-2

1166 38 2D        JR      C,L1195         ; to V-FOUND-2

1168 D1           POP     DE              ;
1169 D5           PUSH    DE              ;
116A E5           PUSH    HL              ;

;; V-MATCHES
116B 23           INC     HL              ;

;; V-SPACES
116C 1A           LD      A,(DE)          ;
116D 13           INC     DE              ;
116E A7           AND     A               ;
116F 28 FB        JR      Z,L116C         ; back to V-SPACES

1171 BE           CP      (HL)            ;
1172 28 F7        JR      Z,L116B         ; back to V-MATCHES

1174 F6 80        OR      $80             ;
1176 BE           CP      (HL)            ;
1177 20 06        JR       NZ,L117F       ; forward to V-GET-PTR

1179 1A           LD      A,(DE)          ;
117A CD D2 14     CALL    L14D2           ; routine ALPHANUM
117D 30 15        JR      NC,L1194        ; forward to V-FOUND-1

;; V-GET-PTR
117F E1           POP     HL              ;

;; V-NEXT
1180 C5           PUSH    BC              ;
1181 CD F2 09     CALL    L09F2           ; routine NEXT-ONE
1184 EB           EX      DE,HL           ;
1185 C1           POP     BC              ;
1186 18 D1        JR      L1159           ; back to V-EACH

; ---

;; V-80-BYTE
1188 CB F8        SET     7,B             ;

;; V-SYNTAX
118A D1           POP     DE              ;

118B DF           RST     18H             ; GET-CHAR
118C FE 10        CP      $10             ;
118E 28 09        JR      Z,L1199         ; forward to V-PASS

1190 CB E8        SET     5,B             ;
1192 18 0D        JR      L11A1           ; forward to V-END

; ---

;; V-FOUND-1
1194 D1           POP     DE              ;

;; V-FOUND-2
1195 D1           POP     DE              ;
1196 D1           POP     DE              ;
1197 E5           PUSH    HL              ;

1198 DF           RST     18H             ; GET-CHAR

;; V-PASS
1199 CD D2 14     CALL    L14D2           ; routine ALPHANUM
119C 30 03        JR      NC,L11A1        ; forward if not alphanumeric to V-END


119E E7           RST     20H             ; NEXT-CHAR
119F 18 F8        JR      L1199           ; back to V-PASS

; ---

;; V-END
11A1 E1           POP     HL              ;
11A2 CB 10        RL      B               ;
11A4 CB 70        BIT     6,B             ;
11A6 C9           RET                     ;

; ------------------------
; THE 'STK-VAR' SUBROUTINE
; ------------------------
;
;

;; STK-VAR
11A7 AF           XOR     A               ;
11A8 47           LD      B,A             ;
11A9 CB 79        BIT     7,C             ;
11AB 20 4B        JR      NZ,L11F8        ; forward to SV-COUNT

11AD CB 7E        BIT     7,(HL)          ;
11AF 20 0E        JR      NZ,L11BF        ; forward to SV-ARRAYS

11B1 3C           INC     A               ;

;; SV-SIMPLE$
11B2 23           INC     HL              ;
11B3 4E           LD      C,(HL)          ;
11B4 23           INC     HL              ;
11B5 46           LD      B,(HL)          ;
11B6 23           INC     HL              ;
11B7 EB           EX      DE,HL           ;
11B8 CD C3 12     CALL    L12C3           ; routine STK-STO-$

11BB DF           RST     18H             ; GET-CHAR
11BC C3 5A 12     JP      L125A           ; jump forward to SV-SLICE?

; ---

;; SV-ARRAYS
11BF 23           INC     HL              ;
11C0 23           INC     HL              ;
11C1 23           INC     HL              ;
11C2 46           LD      B,(HL)          ;
11C3 CB 71        BIT     6,C             ;
11C5 28 0A        JR      Z,L11D1         ; forward to SV-PTR

11C7 05           DEC     B               ;
11C8 28 E8        JR      Z,L11B2         ; forward to SV-SIMPLE$

11CA EB           EX      DE,HL           ;

11CB DF           RST     18H             ; GET-CHAR
11CC FE 10        CP      $10             ;
11CE 20 61        JR      NZ,L1231        ; forward to REPORT-3

11D0 EB           EX      DE,HL           ;

;; SV-PTR
11D1 EB           EX      DE,HL           ;
11D2 18 24        JR      L11F8           ; forward to SV-COUNT

; ---

;; SV-COMMA
11D4 E5           PUSH    HL              ;

11D5 DF           RST     18H             ; GET-CHAR
11D6 E1           POP     HL              ;
11D7 FE 1A        CP      $1A             ;
11D9 28 20        JR      Z,L11FB         ; forward to SV-LOOP

11DB CB 79        BIT     7,C             ;
11DD 28 52        JR      Z,L1231         ; forward to REPORT-3

11DF CB 71        BIT     6,C             ;
11E1 20 06        JR      NZ,L11E9        ; forward to SV-CLOSE

11E3 FE 11        CP      $11             ;
11E5 20 3C        JR      NZ,L1223        ; forward to SV-RPT-C


11E7 E7           RST     20H             ; NEXT-CHAR
11E8 C9           RET                     ;

; ---

;; SV-CLOSE
11E9 FE 11        CP      $11             ;
11EB 28 6C        JR      Z,L1259         ; forward to SV-DIM

11ED FE DF        CP      $DF             ;
11EF 20 32        JR      NZ,L1223        ; forward to SV-RPT-C


;; SV-CH-ADD
11F1 DF           RST     18H             ; GET-CHAR
11F2 2B           DEC     HL              ;
11F3 22 16 40     LD      ($4016),HL      ; sv CH_ADD
11F6 18 5E        JR      L1256           ; forward to SV-SLICE

; ---

;; SV-COUNT
11F8 21 00 00     LD      HL,$0000        ;

;; SV-LOOP
11FB E5           PUSH    HL              ;

11FC E7           RST     20H             ; NEXT-CHAR
11FD E1           POP     HL              ;
11FE 79           LD      A,C             ;
11FF FE C0        CP      $C0             ;
1201 20 09        JR      NZ,L120C        ; forward to SV-MULT


1203 DF           RST     18H             ; GET-CHAR
1204 FE 11        CP      $11             ;
1206 28 51        JR      Z,L1259         ; forward to SV-DIM

1208 FE DF        CP      $DF             ;
120A 28 E5        JR      Z,L11F1         ; back to SV-CH-ADD

;; SV-MULT
120C C5           PUSH    BC              ;
120D E5           PUSH    HL              ;
120E CD FF 12     CALL    L12FF           ; routine DE,(DE+1)
1211 E3           EX      (SP),HL         ;
1212 EB           EX      DE,HL           ;
1213 CD DD 12     CALL    L12DD           ; routine INT-EXP1
1216 38 19        JR      C,L1231         ; forward to REPORT-3

1218 0B           DEC     BC              ;
1219 CD 05 13     CALL    L1305           ; routine GET-HL*DE
121C 09           ADD     HL,BC           ;
121D D1           POP     DE              ;
121E C1           POP     BC              ;
121F 10 B3        DJNZ    L11D4           ; loop back to SV-COMMA

1221 CB 79        BIT     7,C             ;

;; SV-RPT-C
1223 20 66        JR      NZ,L128B        ; relative jump to SL-RPT-C

1225 E5           PUSH    HL              ;
1226 CB 71        BIT     6,C             ;
1228 20 13        JR      NZ,L123D        ; forward to SV-ELEM$

122A 42           LD      B,D             ;
122B 4B           LD      C,E             ;

122C DF           RST     18H             ; GET-CHAR
122D FE 11        CP      $11             ; is character a ')' ?
122F 28 02        JR      Z,L1233         ; skip forward to SV-NUMBER


;; REPORT-3
1231 CF           RST     08H             ; ERROR-1
        DEFB    $02             ; Error Report: Subscript wrong


;; SV-NUMBER
1233 E7           RST     20H             ; NEXT-CHAR
1234 E1           POP     HL              ;
1235 11 05 00     LD      DE,$0005        ;
1238 CD 05 13     CALL    L1305           ; routine GET-HL*DE
123B 09           ADD     HL,BC           ;
123C C9           RET                     ; return                            >>

; ---

;; SV-ELEM$
123D CD FF 12     CALL    L12FF           ; routine DE,(DE+1)
1240 E3           EX      (SP),HL         ;
1241 CD 05 13     CALL    L1305           ; routine GET-HL*DE
1244 C1           POP     BC              ;
1245 09           ADD     HL,BC           ;
1246 23           INC     HL              ;
1247 42           LD      B,D             ;
1248 4B           LD      C,E             ;
1249 EB           EX      DE,HL           ;
124A CD C2 12     CALL    L12C2           ; routine STK-ST-0

124D DF           RST     18H             ; GET-CHAR
124E FE 11        CP      $11             ; is it ')' ?
1250 28 07        JR      Z,L1259         ; forward if so to SV-DIM

1252 FE 1A        CP      $1A             ; is it ',' ?
1254 20 DB        JR      NZ,L1231        ; back if not to REPORT-3

;; SV-SLICE
1256 CD 63 12     CALL    L1263           ; routine SLICING

;; SV-DIM
1259 E7           RST     20H             ; NEXT-CHAR

;; SV-SLICE?
125A FE 10        CP      $10             ;
125C 28 F8        JR      Z,L1256         ; back to SV-SLICE

125E FD CB 01 B6  RES     6,(IY+$01)      ; sv FLAGS  - Signal string result
1262 C9           RET                     ; return.

; ------------------------
; THE 'SLICING' SUBROUTINE
; ------------------------
;
;

;; SLICING
1263 CD A6 0D     CALL    L0DA6           ; routine SYNTAX-Z
1266 C4 F8 13     CALL    NZ,L13F8        ; routine STK-FETCH

1269 E7           RST     20H             ; NEXT-CHAR
126A FE 11        CP      $11             ; is it ')' ?
126C 28 50        JR      Z,L12BE         ; forward if so to SL-STORE

126E D5           PUSH    DE              ;
126F AF           XOR     A               ;
1270 F5           PUSH    AF              ;
1271 C5           PUSH    BC              ;
1272 11 01 00     LD      DE,$0001        ;

1275 DF           RST     18H             ; GET-CHAR
1276 E1           POP     HL              ;
1277 FE DF        CP      $DF             ; is it 'TO' ?
1279 28 17        JR      Z,L1292         ; forward if so to SL-SECOND

127B F1           POP     AF              ;
127C CD DE 12     CALL    L12DE           ; routine INT-EXP2
127F F5           PUSH    AF              ;
1280 50           LD      D,B             ;
1281 59           LD      E,C             ;
1282 E5           PUSH    HL              ;

1283 DF           RST     18H             ; GET-CHAR
1284 E1           POP     HL              ;
1285 FE DF        CP      $DF             ; is it 'TO' ?
1287 28 09        JR      Z,L1292         ; forward if so to SL-SECOND

1289 FE 11        CP      $11             ;

;; SL-RPT-C
128B C2 9A 0D     JP      NZ,L0D9A        ; to REPORT-C

128E 62           LD      H,D             ;
128F 6B           LD      L,E             ;
1290 18 13        JR      L12A5           ; forward to SL-DEFINE

; ---

;; SL-SECOND
1292 E5           PUSH    HL              ;

1293 E7           RST     20H             ; NEXT-CHAR
1294 E1           POP     HL              ;
1295 FE 11        CP      $11             ; is it ')' ?
1297 28 0C        JR      Z,L12A5         ; forward if so to SL-DEFINE

1299 F1           POP     AF              ;
129A CD DE 12     CALL    L12DE           ; routine INT-EXP2
129D F5           PUSH    AF              ;

129E DF           RST     18H             ; GET-CHAR
129F 60           LD      H,B             ;
12A0 69           LD      L,C             ;
12A1 FE 11        CP      $11             ; is it ')' ?
12A3 20 E6        JR      NZ,L128B        ; back if not to SL-RPT-C

;; SL-DEFINE
12A5 F1           POP     AF              ;
12A6 E3           EX      (SP),HL         ;
12A7 19           ADD     HL,DE           ;
12A8 2B           DEC     HL              ;
12A9 E3           EX      (SP),HL         ;
12AA A7           AND     A               ;
12AB ED 52        SBC     HL,DE           ;
12AD 01 00 00     LD      BC,$0000        ;
12B0 38 07        JR      C,L12B9         ; forward to SL-OVER

12B2 23           INC     HL              ;
12B3 A7           AND     A               ;
12B4 FA 31 12     JP      M,L1231         ; jump back to REPORT-3

12B7 44           LD      B,H             ;
12B8 4D           LD      C,L             ;

;; SL-OVER
12B9 D1           POP     DE              ;
12BA FD CB 01 B6  RES     6,(IY+$01)      ; sv FLAGS  - Signal string result

;; SL-STORE
12BE CD A6 0D     CALL    L0DA6           ; routine SYNTAX-Z
12C1 C8           RET     Z               ; return if checking syntax.

; --------------------------
; THE 'STK-STORE' SUBROUTINE
; --------------------------
;
;

;; STK-ST-0
12C2 AF           XOR     A               ;

;; STK-STO-$
12C3 C5           PUSH    BC              ;
12C4 CD EB 19     CALL    L19EB           ; routine TEST-5-SP
12C7 C1           POP     BC              ;
12C8 2A 1C 40     LD      HL,($401C)      ; sv STKEND
12CB 77           LD      (HL),A          ;
12CC 23           INC     HL              ;
12CD 73           LD      (HL),E          ;
12CE 23           INC     HL              ;
12CF 72           LD      (HL),D          ;
12D0 23           INC     HL              ;
12D1 71           LD      (HL),C          ;
12D2 23           INC     HL              ;
12D3 70           LD      (HL),B          ;
12D4 23           INC     HL              ;
12D5 22 1C 40     LD      ($401C),HL      ; sv STKEND
12D8 FD CB 01 B6  RES     6,(IY+$01)      ; update FLAGS - signal string result
12DC C9           RET                     ; return.

; -------------------------
; THE 'INT EXP' SUBROUTINES
; -------------------------
;
;

;; INT-EXP1
12DD AF           XOR     A               ;

;; INT-EXP2
12DE D5           PUSH    DE              ;
12DF E5           PUSH    HL              ;
12E0 F5           PUSH    AF              ;
12E1 CD 92 0D     CALL    L0D92           ; routine CLASS-6
12E4 F1           POP     AF              ;
12E5 CD A6 0D     CALL    L0DA6           ; routine SYNTAX-Z
12E8 28 12        JR      Z,L12FC         ; forward if checking syntax to I-RESTORE

12EA F5           PUSH    AF              ;
12EB CD A7 0E     CALL    L0EA7           ; routine FIND-INT
12EE D1           POP     DE              ;
12EF 78           LD      A,B             ;
12F0 B1           OR      C               ;
12F1 37           SCF                     ; Set Carry Flag
12F2 28 05        JR      Z,L12F9         ; forward to I-CARRY

12F4 E1           POP     HL              ;
12F5 E5           PUSH    HL              ;
12F6 A7           AND     A               ;
12F7 ED 42        SBC     HL,BC           ;

;; I-CARRY
12F9 7A           LD      A,D             ;
12FA DE 00        SBC     A,$00           ;

;; I-RESTORE
12FC E1           POP     HL              ;
12FD D1           POP     DE              ;
12FE C9           RET                     ;

; --------------------------
; THE 'DE,(DE+1)' SUBROUTINE
; --------------------------
; INDEX and LOAD Z80 subroutine.
; This emulates the 6800 processor instruction LDX 1,X which loads a two-byte
; value from memory into the register indexing it. Often these are hardly worth
; the bother of writing as subroutines and this one doesn't save any time or
; memory. The timing and space overheads have to be offset against the ease of
; writing and the greater program readability from using such toolkit routines.

;; DE,(DE+1)
12FF EB           EX      DE,HL           ; move index address into HL.
1300 23           INC     HL              ; increment to address word.
1301 5E           LD      E,(HL)          ; pick up word low-order byte.
1302 23           INC     HL              ; index high-order byte and
1303 56           LD      D,(HL)          ; pick it up.
1304 C9           RET                     ; return with DE = word.

; --------------------------
; THE 'GET-HL*DE' SUBROUTINE
; --------------------------
;

;; GET-HL*DE
1305 CD A6 0D     CALL    L0DA6           ; routine SYNTAX-Z
1308 C8           RET     Z               ;

1309 C5           PUSH    BC              ;
130A 06 10        LD      B,$10           ;
130C 7C           LD      A,H             ;
130D 4D           LD      C,L             ;
130E 21 00 00     LD      HL,$0000        ;

;; HL-LOOP
1311 29           ADD     HL,HL           ;
1312 38 06        JR      C,L131A         ; forward with carry to HL-END

1314 CB 11        RL      C               ;
1316 17           RLA                     ;
1317 30 04        JR      NC,L131D        ; forward with no carry to HL-AGAIN

1319 19           ADD     HL,DE           ;

;; HL-END
131A DA D3 0E     JP      C,L0ED3         ; to REPORT-4

;; HL-AGAIN
131D 10 F2        DJNZ    L1311           ; loop back to HL-LOOP

131F C1           POP     BC              ;
1320 C9           RET                     ; return.

; --------------------
; THE 'LET' SUBROUTINE
; --------------------
;
;

;; LET
1321 2A 12 40     LD      HL,($4012)      ; sv DEST-lo
1324 FD CB 2D 4E  BIT     1,(IY+$2D)      ; sv FLAGX
1328 28 44        JR      Z,L136E         ; forward to L-EXISTS

132A 01 05 00     LD      BC,$0005        ;

;; L-EACH-CH
132D 03           INC     BC              ;

; check

;; L-NO-SP
132E 23           INC     HL              ;
132F 7E           LD      A,(HL)          ;
1330 A7           AND     A               ;
1331 28 FB        JR      Z,L132E         ; back to L-NO-SP

1333 CD D2 14     CALL    L14D2           ; routine ALPHANUM
1336 38 F5        JR      C,L132D         ; back to L-EACH-CH

1338 FE 0D        CP      $0D             ; is it '$' ?
133A CA C8 13     JP      Z,L13C8         ; forward if so to L-NEW$


133D F7           RST     30H             ; BC-SPACES
133E D5           PUSH    DE              ;
133F 2A 12 40     LD      HL,($4012)      ; sv DEST
1342 1B           DEC     DE              ;
1343 79           LD      A,C             ;
1344 D6 06        SUB     $06             ;
1346 47           LD      B,A             ;
1347 3E 40        LD      A,$40           ;
1349 28 0E        JR      Z,L1359         ; forward to L-SINGLE

;; L-CHAR
134B 23           INC     HL              ;
134C 7E           LD      A,(HL)          ;
134D A7           AND     A               ; is it a space ?
134E 28 FB        JR      Z,L134B         ; back to L-CHAR

1350 13           INC     DE              ;
1351 12           LD      (DE),A          ;
1352 10 F7        DJNZ    L134B           ; loop back to L-CHAR

1354 F6 80        OR      $80             ;
1356 12           LD      (DE),A          ;
1357 3E 80        LD      A,$80           ;

;; L-SINGLE
1359 2A 12 40     LD      HL,($4012)      ; sv DEST-lo
135C AE           XOR     (HL)            ;
135D E1           POP     HL              ;
135E CD E7 13     CALL    L13E7           ; routine L-FIRST

;; L-NUMERIC
1361 E5           PUSH    HL              ;

1362 EF           RST     28H             ;; FP-CALC
        DEFB    $02             ;;delete
        DEFB    $34             ;;end-calc

1365 E1           POP     HL              ;
1366 01 05 00     LD      BC,$0005        ;
1369 A7           AND     A               ;
136A ED 42        SBC     HL,BC           ;
136C 18 40        JR      L13AE           ; forward to L-ENTER

; ---

;; L-EXISTS
136E FD CB 01 76  BIT     6,(IY+$01)      ; sv FLAGS  - Numeric or string result?
1372 28 06        JR      Z,L137A         ; forward to L-DELETE$

1374 11 06 00     LD      DE,$0006        ;
1377 19           ADD     HL,DE           ;
1378 18 E7        JR      L1361           ; back to L-NUMERIC

; ---

;; L-DELETE$
137A 2A 12 40     LD      HL,($4012)      ; sv DEST-lo
137D ED 4B 2E 40  LD      BC,($402E)      ; sv STRLEN_lo
1381 FD CB 2D 46  BIT     0,(IY+$2D)      ; sv FLAGX
1385 20 30        JR      NZ,L13B7        ; forward to L-ADD$

1387 78           LD      A,B             ;
1388 B1           OR      C               ;
1389 C8           RET     Z               ;

138A E5           PUSH    HL              ;

138B F7           RST     30H             ; BC-SPACES
138C D5           PUSH    DE              ;
138D C5           PUSH    BC              ;
138E 54           LD      D,H             ;
138F 5D           LD      E,L             ;
1390 23           INC     HL              ;
1391 36 00        LD      (HL),$00        ;
1393 ED B8        LDDR                    ; Copy Bytes
1395 E5           PUSH    HL              ;
1396 CD F8 13     CALL    L13F8           ; routine STK-FETCH
1399 E1           POP     HL              ;
139A E3           EX      (SP),HL         ;
139B A7           AND     A               ;
139C ED 42        SBC     HL,BC           ;
139E 09           ADD     HL,BC           ;
139F 30 02        JR      NC,L13A3        ; forward to L-LENGTH

13A1 44           LD      B,H             ;
13A2 4D           LD      C,L             ;

;; L-LENGTH
13A3 E3           EX      (SP),HL         ;
13A4 EB           EX      DE,HL           ;
13A5 78           LD      A,B             ;
13A6 B1           OR      C               ;
13A7 28 02        JR      Z,L13AB         ; forward if zero to L-IN-W/S

13A9 ED B0        LDIR                    ; Copy Bytes

;; L-IN-W/S
13AB C1           POP     BC              ;
13AC D1           POP     DE              ;
13AD E1           POP     HL              ;

; ------------------------
; THE 'L-ENTER' SUBROUTINE
; ------------------------
;

;; L-ENTER
13AE EB           EX      DE,HL           ;
13AF 78           LD      A,B             ;
13B0 B1           OR      C               ;
13B1 C8           RET     Z               ;

13B2 D5           PUSH    DE              ;
13B3 ED B0        LDIR                    ; Copy Bytes
13B5 E1           POP     HL              ;
13B6 C9           RET                     ; return.

; ---

;; L-ADD$
13B7 2B           DEC     HL              ;
13B8 2B           DEC     HL              ;
13B9 2B           DEC     HL              ;
13BA 7E           LD      A,(HL)          ;
13BB E5           PUSH    HL              ;
13BC C5           PUSH    BC              ;

13BD CD CE 13     CALL    L13CE           ; routine L-STRING

13C0 C1           POP     BC              ;
13C1 E1           POP     HL              ;
13C2 03           INC     BC              ;
13C3 03           INC     BC              ;
13C4 03           INC     BC              ;
13C5 C3 60 0A     JP      L0A60           ; jump back to exit via RECLAIM-2

; ---

;; L-NEW$
13C8 3E 60        LD      A,$60           ; prepare mask %01100000
13CA 2A 12 40     LD      HL,($4012)      ; sv DEST-lo
13CD AE           XOR     (HL)            ;

; -------------------------
; THE 'L-STRING' SUBROUTINE
; -------------------------
;

;; L-STRING
13CE F5           PUSH    AF              ;
13CF CD F8 13     CALL    L13F8           ; routine STK-FETCH
13D2 EB           EX      DE,HL           ;
13D3 09           ADD     HL,BC           ;
13D4 E5           PUSH    HL              ;
13D5 03           INC     BC              ;
13D6 03           INC     BC              ;
13D7 03           INC     BC              ;

13D8 F7           RST     30H             ; BC-SPACES
13D9 EB           EX      DE,HL           ;
13DA E1           POP     HL              ;
13DB 0B           DEC     BC              ;
13DC 0B           DEC     BC              ;
13DD C5           PUSH    BC              ;
13DE ED B8        LDDR                    ; Copy Bytes
13E0 EB           EX      DE,HL           ;
13E1 C1           POP     BC              ;
13E2 0B           DEC     BC              ;
13E3 70           LD      (HL),B          ;
13E4 2B           DEC     HL              ;
13E5 71           LD      (HL),C          ;
13E6 F1           POP     AF              ;

;; L-FIRST
13E7 F5           PUSH    AF              ;
13E8 CD C7 14     CALL    L14C7           ; routine REC-V80
13EB F1           POP     AF              ;
13EC 2B           DEC     HL              ;
13ED 77           LD      (HL),A          ;
13EE 2A 1A 40     LD      HL,($401A)      ; sv STKBOT_lo
13F1 22 14 40     LD      ($4014),HL      ; sv E_LINE_lo
13F4 2B           DEC     HL              ;
13F5 36 80        LD      (HL),$80        ;
13F7 C9           RET                     ;

; --------------------------
; THE 'STK-FETCH' SUBROUTINE
; --------------------------
; This routine fetches a five-byte value from the calculator stack
; reducing the pointer to the end of the stack by five.
; For a floating-point number the exponent is in A and the mantissa
; is the thirty-two bits EDCB.
; For strings, the start of the string is in DE and the length in BC.
; A is unused.

;; STK-FETCH
13F8 2A 1C 40     LD      HL,($401C)      ; load HL from system variable STKEND

13FB 2B           DEC     HL              ;
13FC 46           LD      B,(HL)          ;
13FD 2B           DEC     HL              ;
13FE 4E           LD      C,(HL)          ;
13FF 2B           DEC     HL              ;
1400 56           LD      D,(HL)          ;
1401 2B           DEC     HL              ;
1402 5E           LD      E,(HL)          ;
1403 2B           DEC     HL              ;
1404 7E           LD      A,(HL)          ;

1405 22 1C 40     LD      ($401C),HL      ; set system variable STKEND to lower value.
1408 C9           RET                     ; return.

; -------------------------
; THE 'DIM' COMMAND ROUTINE
; -------------------------
; An array is created and initialized to zeros which is also the space
; character on the ZX81.

;; DIM
1409 CD 1C 11     CALL    L111C           ; routine LOOK-VARS

;; D-RPORT-C
140C C2 9A 0D     JP      NZ,L0D9A        ; to REPORT-C

140F CD A6 0D     CALL    L0DA6           ; routine SYNTAX-Z
1412 20 08        JR      NZ,L141C        ; forward to D-RUN

1414 CB B1        RES     6,C             ;
1416 CD A7 11     CALL    L11A7           ; routine STK-VAR
1419 CD 1D 0D     CALL    L0D1D           ; routine CHECK-END

;; D-RUN
141C 38 08        JR      C,L1426         ; forward to D-LETTER

141E C5           PUSH    BC              ;
141F CD F2 09     CALL    L09F2           ; routine NEXT-ONE
1422 CD 60 0A     CALL    L0A60           ; routine RECLAIM-2
1425 C1           POP     BC              ;

;; D-LETTER
1426 CB F9        SET     7,C             ;
1428 06 00        LD      B,$00           ;
142A C5           PUSH    BC              ;
142B 21 01 00     LD      HL,$0001        ;
142E CB 71        BIT     6,C             ;
1430 20 02        JR      NZ,L1434        ; forward to D-SIZE

1432 2E 05        LD      L,$05           ;

;; D-SIZE
1434 EB           EX      DE,HL           ;

;; D-NO-LOOP
1435 E7           RST     20H             ; NEXT-CHAR
1436 26 40        LD      H,$40           ;
1438 CD DD 12     CALL    L12DD           ; routine INT-EXP1
143B DA 31 12     JP      C,L1231         ; jump back to REPORT-3

143E E1           POP     HL              ;
143F C5           PUSH    BC              ;
1440 24           INC     H               ;
1441 E5           PUSH    HL              ;
1442 60           LD      H,B             ;
1443 69           LD      L,C             ;
1444 CD 05 13     CALL    L1305           ; routine GET-HL*DE
1447 EB           EX      DE,HL           ;

1448 DF           RST     18H             ; GET-CHAR
1449 FE 1A        CP      $1A             ;
144B 28 E8        JR      Z,L1435         ; back to D-NO-LOOP

144D FE 11        CP      $11             ; is it ')' ?
144F 20 BB        JR      NZ,L140C        ; back if not to D-RPORT-C


1451 E7           RST     20H             ; NEXT-CHAR
1452 C1           POP     BC              ;
1453 79           LD      A,C             ;
1454 68           LD      L,B             ;
1455 26 00        LD      H,$00           ;
1457 23           INC     HL              ;
1458 23           INC     HL              ;
1459 29           ADD     HL,HL           ;
145A 19           ADD     HL,DE           ;
145B DA D3 0E     JP      C,L0ED3         ; jump to REPORT-4

145E D5           PUSH    DE              ;
145F C5           PUSH    BC              ;
1460 E5           PUSH    HL              ;
1461 44           LD      B,H             ;
1462 4D           LD      C,L             ;
1463 2A 14 40     LD      HL,($4014)      ; sv E_LINE_lo
1466 2B           DEC     HL              ;
1467 CD 9E 09     CALL    L099E           ; routine MAKE-ROOM
146A 23           INC     HL              ;
146B 77           LD       (HL),A         ;
146C C1           POP     BC              ;
146D 0B           DEC     BC              ;
146E 0B           DEC     BC              ;
146F 0B           DEC     BC              ;
1470 23           INC     HL              ;
1471 71           LD      (HL),C          ;
1472 23           INC     HL              ;
1473 70           LD      (HL),B          ;
1474 F1           POP     AF              ;
1475 23           INC     HL              ;
1476 77           LD      (HL),A          ;
1477 62           LD      H,D             ;
1478 6B           LD      L,E             ;
1479 1B           DEC     DE              ;
147A 36 00        LD      (HL),$00        ;
147C C1           POP     BC              ;
147D ED B8        LDDR                    ; Copy Bytes

;; DIM-SIZES
147F C1           POP     BC              ;
1480 70           LD      (HL),B          ;
1481 2B           DEC     HL              ;
1482 71           LD      (HL),C          ;
1483 2B           DEC     HL              ;
1484 3D           DEC     A               ;
1485 20 F8        JR      NZ,L147F        ; back to DIM-SIZES

1487 C9           RET                     ; return.

; ---------------------
; THE 'RESERVE' ROUTINE
; ---------------------
;
;

;; RESERVE
1488 2A 1A 40     LD      HL,($401A)      ; address STKBOT
148B 2B           DEC     HL              ; now last byte of workspace
148C CD 9E 09     CALL    L099E           ; routine MAKE-ROOM
148F 23           INC     HL              ;
1490 23           INC     HL              ;
1491 C1           POP     BC              ;
1492 ED 43 14 40  LD      ($4014),BC      ; sv E_LINE_lo
1496 C1           POP     BC              ;
1497 EB           EX      DE,HL           ;
1498 23           INC     HL              ;
1499 C9           RET                     ;

; ---------------------------
; THE 'CLEAR' COMMAND ROUTINE
; ---------------------------
;
;

;; CLEAR
149A 2A 10 40     LD      HL,($4010)      ; sv VARS_lo
149D 36 80        LD      (HL),$80        ;
149F 23           INC     HL              ;
14A0 22 14 40     LD      ($4014),HL      ; sv E_LINE_lo

; -----------------------
; THE 'X-TEMP' SUBROUTINE
; -----------------------
;
;

;; X-TEMP
14A3 2A 14 40     LD      HL,($4014)      ; sv E_LINE_lo

; ----------------------
; THE 'SET-STK' ROUTINES
; ----------------------
;
;

;; SET-STK-B
14A6 22 1A 40     LD      ($401A),HL      ; sv STKBOT

;

;; SET-STK-E
14A9 22 1C 40     LD      ($401C),HL      ; sv STKEND
14AC C9           RET                     ;

; -----------------------
; THE 'CURSOR-IN' ROUTINE
; -----------------------
; This routine is called to set the edit line to the minimum cursor/newline
; and to set STKEND, the start of free space, at the next position.

;; CURSOR-IN
14AD 2A 14 40     LD      HL,($4014)      ; fetch start of edit line from E_LINE
14B0 36 7F        LD      (HL),$7F        ; insert cursor character

14B2 23           INC     HL              ; point to next location.
14B3 36 76        LD      (HL),$76        ; insert NEWLINE character
14B5 23           INC     HL              ; point to next free location.

14B6 FD 36 22 02  LD      (IY+$22),$02    ; set lower screen display file size DF_SZ

14BA 18 EA        JR      L14A6           ; exit via SET-STK-B above

; ------------------------
; THE 'SET-MIN' SUBROUTINE
; ------------------------
;
;

;; SET-MIN
14BC 21 5D 40     LD      HL,$405D        ; normal location of calculator's memory area
14BF 22 1F 40     LD      ($401F),HL      ; update system variable MEM
14C2 2A 1A 40     LD      HL,($401A)      ; fetch STKBOT
14C5 18 E2        JR      L14A9           ; back to SET-STK-E


; ------------------------------------
; THE 'RECLAIM THE END-MARKER' ROUTINE
; ------------------------------------

;; REC-V80
14C7 ED 5B 14 40  LD      DE,($4014)      ; sv E_LINE_lo
14CB C3 5D 0A     JP      L0A5D           ; to RECLAIM-1

; ----------------------
; THE 'ALPHA' SUBROUTINE
; ----------------------

;; ALPHA
14CE FE 26        CP      $26             ;
14D0 18 02        JR      L14D4           ; skip forward to ALPHA-2


; -------------------------
; THE 'ALPHANUM' SUBROUTINE
; -------------------------

;; ALPHANUM
14D2 FE 1C        CP      $1C             ;


;; ALPHA-2
14D4 3F           CCF                     ; Complement Carry Flag
14D5 D0           RET     NC              ;

14D6 FE 40        CP      $40             ;
14D8 C9           RET                     ;


; ------------------------------------------
; THE 'DECIMAL TO FLOATING POINT' SUBROUTINE
; ------------------------------------------
;

;; DEC-TO-FP
14D9 CD 48 15     CALL    L1548           ; routine INT-TO-FP gets first part
14DC FE 1B        CP      $1B             ; is character a '.' ?
14DE 20 15        JR      NZ,L14F5        ; forward if not to E-FORMAT


14E0 EF           RST     28H             ;; FP-CALC
        DEFB    $A1             ;;stk-one
        DEFB    $C0             ;;st-mem-0
        DEFB    $02             ;;delete
        DEFB    $34             ;;end-calc


;; NXT-DGT-1
14E5 E7           RST     20H             ; NEXT-CHAR
14E6 CD 14 15     CALL    L1514           ; routine STK-DIGIT
14E9 38 0A        JR      C,L14F5         ; forward to E-FORMAT


14EB EF           RST     28H             ;; FP-CALC
        DEFB    $E0             ;;get-mem-0
        DEFB    $A4             ;;stk-ten
        DEFB    $05             ;;division
        DEFB    $C0             ;;st-mem-0
        DEFB    $04             ;;multiply
        DEFB    $0F             ;;addition
        DEFB    $34             ;;end-calc

14F3 18 F0        JR      L14E5           ; loop back till exhausted to NXT-DGT-1

; ---

;; E-FORMAT
14F5 FE 2A        CP      $2A             ; is character 'E' ?
14F7 C0           RET     NZ              ; return if not

14F8 FD 36 5D FF  LD      (IY+$5D),$FF    ; initialize sv MEM-0-1st to $FF TRUE

14FC E7           RST     20H             ; NEXT-CHAR
14FD FE 15        CP      $15             ; is character a '+' ?
14FF 28 07        JR      Z,L1508         ; forward if so to SIGN-DONE

1501 FE 16        CP      $16             ; is it a '-' ?
1503 20 04        JR      NZ,L1509        ; forward if not to ST-E-PART

1505 FD 34 5D     INC     (IY+$5D)        ; sv MEM-0-1st change to FALSE

;; SIGN-DONE
1508 E7           RST     20H             ; NEXT-CHAR

;; ST-E-PART
1509 CD 48 15     CALL    L1548           ; routine INT-TO-FP

150C EF           RST     28H             ;; FP-CALC              m, e.
        DEFB    $E0             ;;get-mem-0             m, e, (1/0) TRUE/FALSE
        DEFB    $00             ;;jump-true
        DEFB    $02             ;;to L1511, E-POSTVE
        DEFB    $18             ;;neg                   m, -e

;; E-POSTVE
1511    DEFB    $38             ;;e-to-fp               x.
        DEFB    $34             ;;end-calc              x.

1513 C9           RET                     ; return.


; --------------------------
; THE 'STK-DIGIT' SUBROUTINE
; --------------------------
;

;; STK-DIGIT
1514 FE 1C        CP      $1C             ;
1516 D8           RET     C               ;

1517 FE 26        CP      $26             ;
1519 3F           CCF                     ; Complement Carry Flag
151A D8           RET     C               ;

151B D6 1C        SUB     $1C             ;

; ------------------------
; THE 'STACK-A' SUBROUTINE
; ------------------------
;


;; STACK-A
151D 4F           LD      C,A             ;
151E 06 00        LD      B,$00           ;

; -------------------------
; THE 'STACK-BC' SUBROUTINE
; -------------------------
; The ZX81 does not have an integer number format so the BC register contents
; must be converted to their full floating-point form.

;; STACK-BC
1520 FD 21 00 40  LD      IY,$4000        ; re-initialize the system variables pointer.
1524 C5           PUSH    BC              ; save the integer value.

; now stack zero, five zero bytes as a starting point.

1525 EF           RST     28H             ;; FP-CALC
        DEFB    $A0             ;;stk-zero                      0.
        DEFB    $34             ;;end-calc

1528 C1           POP     BC              ; restore integer value.

1529 36 91        LD      (HL),$91        ; place $91 in exponent         65536.
                                ; this is the maximum possible value

152B 78           LD      A,B             ; fetch hi-byte.
152C A7           AND     A               ; test for zero.
152D 20 07        JR      NZ,L1536        ; forward if not zero to STK-BC-2

152F 77           LD      (HL),A          ; else make exponent zero again
1530 B1           OR      C               ; test lo-byte
1531 C8           RET     Z               ; return if BC was zero - done.

; else  there has to be a set bit if only the value one.

1532 41           LD      B,C             ; save C in B.
1533 4E           LD      C,(HL)          ; fetch zero to C
1534 36 89        LD      (HL),$89        ; make exponent $89             256.

;; STK-BC-2
1536 35           DEC     (HL)            ; decrement exponent - halving number
1537 CB 21        SLA     C               ;  C<-76543210<-0
1539 CB 10        RL      B               ;  C<-76543210<-C
153B 30 F9        JR      NC,L1536        ; loop back if no carry to STK-BC-2

153D CB 38        SRL     B               ;  0->76543210->C
153F CB 19        RR      C               ;  C->76543210->C

1541 23           INC     HL              ; address first byte of mantissa
1542 70           LD      (HL),B          ; insert B
1543 23           INC     HL              ; address second byte of mantissa
1544 71           LD      (HL),C          ; insert C

1545 2B           DEC     HL              ; point to the
1546 2B           DEC     HL              ; exponent again
1547 C9           RET                     ; return.

; ------------------------------------------
; THE 'INTEGER TO FLOATING POINT' SUBROUTINE
; ------------------------------------------
;
;

;; INT-TO-FP
1548 F5           PUSH    AF              ;

1549 EF           RST     28H             ;; FP-CALC
        DEFB    $A0             ;;stk-zero
        DEFB    $34             ;;end-calc

154C F1           POP     AF              ;

;; NXT-DGT-2
154D CD 14 15     CALL    L1514           ; routine STK-DIGIT
1550 D8           RET     C               ;


1551 EF           RST     28H             ;; FP-CALC
        DEFB    $01             ;;exchange
        DEFB    $A4             ;;stk-ten
        DEFB    $04             ;;multiply
        DEFB    $0F             ;;addition
        DEFB    $34             ;;end-calc


1557 E7           RST     20H             ; NEXT-CHAR
1558 18 F3        JR      L154D           ; to NXT-DGT-2


; -------------------------------------------
; THE 'E-FORMAT TO FLOATING POINT' SUBROUTINE
; -------------------------------------------
; (Offset $38: 'e-to-fp')
; invoked from DEC-TO-FP and PRINT-FP.
; e.g. 2.3E4 is 23000.
; This subroutine evaluates xEm where m is a positive or negative integer.
; At a simple level x is multiplied by ten for every unit of m.
; If the decimal exponent m is negative then x is divided by ten for each unit.
; A short-cut is taken if the exponent is greater than seven and in this
; case the exponent is reduced by seven and the value is multiplied or divided
; by ten million.
; Note. for the ZX Spectrum an even cleverer method was adopted which involved
; shifting the bits out of the exponent so the result was achieved with six
; shifts at most. The routine below had to be completely re-written mostly
; in Z80 machine code.
; Although no longer operable, the calculator literal was retained for old
; times sake, the routine being invoked directly from a machine code CALL.
;
; On entry in the ZX81, m, the exponent, is the 'last value', and the
; floating-point decimal mantissa is beneath it.


;; e-to-fp
155A    RST     28H             ;; FP-CALC              x, m.
        DEFB    $2D             ;;duplicate             x, m, m.
        DEFB    $32             ;;less-0                x, m, (1/0).
        DEFB    $C0             ;;st-mem-0              x, m, (1/0).
        DEFB    $02             ;;delete                x, m.
        DEFB    $27             ;;abs                   x, +m.

;; E-LOOP
1560    DEFB    $A1             ;;stk-one               x, m,1.
        DEFB    $03             ;;subtract              x, m-1.
        DEFB    $2D             ;;duplicate             x, m-1,m-1.
        DEFB    $32             ;;less-0                x, m-1, (1/0).
        DEFB    $00             ;;jump-true             x, m-1.
        DEFB    $22             ;;to L1587, E-END       x, m-1.

        DEFB    $2D             ;;duplicate             x, m-1, m-1.
        DEFB    $30             ;;stk-data
        DEFB    $33             ;;Exponent: $83, Bytes: 1

        DEFB    $40             ;;(+00,+00,+00)         x, m-1, m-1, 6.
        DEFB    $03             ;;subtract              x, m-1, m-7.
        DEFB    $2D             ;;duplicate             x, m-1, m-7, m-7.
        DEFB    $32             ;;less-0                x, m-1, m-7, (1/0).
        DEFB    $00             ;;jump-true             x, m-1, m-7.
        DEFB    $0C             ;;to L157A, E-LOW

; but if exponent m is higher than 7 do a bigger chunk.
; multiplying (or dividing if negative) by 10 million - 1e7.

        DEFB    $01             ;;exchange              x, m-7, m-1.
        DEFB    $02             ;;delete                x, m-7.
        DEFB    $01             ;;exchange              m-7, x.
        DEFB    $30             ;;stk-data
        DEFB    $80             ;;Bytes: 3
        DEFB    $48             ;;Exponent $98
        DEFB    $18,$96,$80     ;;(+00)                 m-7, x, 10,000,000 (=f)
        DEFB    $2F             ;;jump
        DEFB    $04             ;;to L157D, E-CHUNK

; ---

;; E-LOW
157A    DEFB    $02             ;;delete                x, m-1.
        DEFB    $01             ;;exchange              m-1, x.
        DEFB    $A4             ;;stk-ten               m-1, x, 10 (=f).

;; E-CHUNK
157D    DEFB    $E0             ;;get-mem-0             m-1, x, f, (1/0)
        DEFB    $00             ;;jump-true             m-1, x, f
        DEFB    $04             ;;to L1583, E-DIVSN

        DEFB    $04             ;;multiply              m-1, x*f.
        DEFB    $2F             ;;jump
        DEFB    $02             ;;to L1584, E-SWAP

; ---

;; E-DIVSN
1583    DEFB    $05             ;;division              m-1, x/f (= new x).

;; E-SWAP
1584    DEFB    $01             ;;exchange              x, m-1 (= new m).
        DEFB    $2F             ;;jump                  x, m.
        DEFB    $DA             ;;to L1560, E-LOOP

; ---

;; E-END
1587    DEFB    $02             ;;delete                x. (-1)
        DEFB    $34             ;;end-calc              x.

1589 C9           RET                     ; return.

; -------------------------------------
; THE 'FLOATING-POINT TO BC' SUBROUTINE
; -------------------------------------
; The floating-point form on the calculator stack is compressed directly into
; the BC register rounding up if necessary.
; Valid range is 0 to 65535.4999

;; FP-TO-BC
158A CD F8 13     CALL    L13F8           ; routine STK-FETCH - exponent to A
                                ; mantissa to EDCB.
158D A7           AND     A               ; test for value zero.
158E 20 05        JR      NZ,L1595        ; forward if not to FPBC-NZRO

; else value is zero

1590 47           LD      B,A             ; zero to B
1591 4F           LD      C,A             ; also to C
1592 F5           PUSH    AF              ; save the flags on machine stack
1593 18 31        JR      L15C6           ; forward to FPBC-END

; ---

; EDCB  =>  BCE

;; FPBC-NZRO
1595 43           LD      B,E             ; transfer the mantissa from EDCB
1596 59           LD      E,C             ; to BCE. Bit 7 of E is the 17th bit which
1597 4A           LD      C,D             ; will be significant for rounding if the
                                ; number is already normalized.

1598 D6 91        SUB     $91             ; subtract 65536
159A 3F           CCF                     ; complement carry flag
159B CB 78        BIT     7,B             ; test sign bit
159D F5           PUSH    AF              ; push the result

159E CB F8        SET     7,B             ; set the implied bit
15A0 38 24        JR      C,L15C6         ; forward with carry from SUB/CCF to FPBC-END
                                ; number is too big.

15A2 3C           INC     A               ; increment the exponent and
15A3 ED 44        NEG                     ; negate to make range $00 - $0F

15A5 FE 08        CP      $08             ; test if one or two bytes
15A7 38 06        JR      C,L15AF         ; forward with two to BIG-INT

15A9 59           LD      E,C             ; shift mantissa
15AA 48           LD      C,B             ; 8 places right
15AB 06 00        LD      B,$00           ; insert a zero in B
15AD D6 08        SUB     $08             ; reduce exponent by eight

;; BIG-INT
15AF A7           AND     A               ; test the exponent
15B0 57           LD      D,A             ; save exponent in D.

15B1 7B           LD      A,E             ; fractional bits to A
15B2 07           RLCA                    ; rotate most significant bit to carry for
                                ; rounding of an already normal number.

15B3 28 07        JR      Z,L15BC         ; forward if exponent zero to EXP-ZERO
                                ; the number is normalized

;; FPBC-NORM
15B5 CB 38        SRL     B               ;   0->76543210->C
15B7 CB 19        RR      C               ;   C->76543210->C

15B9 15           DEC     D               ; decrement exponent

15BA 20 F9        JR      NZ,L15B5        ; loop back till zero to FPBC-NORM

;; EXP-ZERO
15BC 30 08        JR      NC,L15C6        ; forward without carry to NO-ROUND

15BE 03           INC     BC              ; round up.
15BF 78           LD      A,B             ; test result
15C0 B1           OR      C               ; for zero
15C1 20 03        JR      NZ,L15C6        ; forward if not to GRE-ZERO

15C3 F1           POP     AF              ; restore sign flag
15C4 37           SCF                     ; set carry flag to indicate overflow
15C5 F5           PUSH    AF              ; save combined flags again

;; FPBC-END
15C6 C5           PUSH    BC              ; save BC value

; set HL and DE to calculator stack pointers.

15C7 EF           RST     28H             ;; FP-CALC
        DEFB    $34             ;;end-calc


15C9 C1           POP     BC              ; restore BC value
15CA F1           POP     AF              ; restore flags
15CB 79           LD      A,C             ; copy low byte to A also.
15CC C9           RET                     ; return

; ------------------------------------
; THE 'FLOATING-POINT TO A' SUBROUTINE
; ------------------------------------
;
;

;; FP-TO-A
15CD CD 8A 15     CALL    L158A           ; routine FP-TO-BC
15D0 D8           RET     C               ;

15D1 F5           PUSH    AF              ;
15D2 05           DEC     B               ;
15D3 04           INC     B               ;
15D4 28 03        JR      Z,L15D9         ; forward if in range to FP-A-END

15D6 F1           POP     AF              ; fetch result
15D7 37           SCF                     ; set carry flag signaling overflow
15D8 C9           RET                     ; return

;; FP-A-END
15D9 F1           POP     AF              ;
15DA C9           RET                     ;


; ----------------------------------------------
; THE 'PRINT A FLOATING-POINT NUMBER' SUBROUTINE
; ----------------------------------------------
; prints 'last value' x on calculator stack.
; There are a wide variety of formats see Chapter 4.
; e.g.
; PI            prints as       3.1415927
; .123          prints as       0.123
; .0123         prints as       .0123
; 999999999999  prints as       1000000000000
; 9876543210123 prints as       9876543200000

; Begin by isolating zero and just printing the '0' character
; for that case. For negative numbers print a leading '-' and
; then form the absolute value of x.

;; PRINT-FP
15DB EF           RST     28H             ;; FP-CALC              x.
        DEFB    $2D             ;;duplicate             x, x.
        DEFB    $32             ;;less-0                x, (1/0).
        DEFB    $00             ;;jump-true
        DEFB    $0B             ;;to L15EA, PF-NGTVE    x.

        DEFB    $2D             ;;duplicate             x, x
        DEFB    $33             ;;greater-0             x, (1/0).
        DEFB    $00             ;;jump-true
        DEFB    $0D             ;;to L15F0, PF-POSTVE   x.

        DEFB    $02             ;;delete                .
        DEFB    $34             ;;end-calc              .

15E6 3E 1C        LD      A,$1C           ; load accumulator with character '0'

15E8 D7           RST     10H             ; PRINT-A
15E9 C9           RET                     ; return.                               >>

; ---

;; PF-NEGTVE
15EA    DEFB    $27             ; abs                   +x.
        DEFB    $34             ;;end-calc              x.

15EC 3E 16        LD      A,$16           ; load accumulator with '-'

15EE D7           RST     10H             ; PRINT-A

15EF EF           RST     28H             ;; FP-CALC              x.

;; PF-POSTVE
15F0    DEFB    $34             ;;end-calc              x.

; register HL addresses the exponent of the floating-point value.
; if positive, and point floats to left, then bit 7 is set.

15F1 7E           LD      A,(HL)          ; pick up the exponent byte
15F2 CD 1D 15     CALL    L151D           ; routine STACK-A places on calculator stack.

; now calculate roughly the number of digits, n, before the decimal point by
; subtracting a half from true exponent and multiplying by log to
; the base 10 of 2.
; The true number could be one higher than n, the integer result.

15F5 EF           RST     28H             ;; FP-CALC              x, e.
        DEFB    $30             ;;stk-data
        DEFB    $78             ;;Exponent: $88, Bytes: 2
        DEFB    $00,$80         ;;(+00,+00)             x, e, 128.5.
        DEFB    $03             ;;subtract              x, e -.5.
        DEFB    $30             ;;stk-data
        DEFB    $EF             ;;Exponent: $7F, Bytes: 4
        DEFB    $1A,$20,$9A,$85 ;;                      .30103 (log10 2)
        DEFB    $04             ;;multiply              x,
        DEFB    $24             ;;int
        DEFB    $C1             ;;st-mem-1              x, n.


        DEFB    $30             ;;stk-data
        DEFB    $34             ;;Exponent: $84, Bytes: 1
        DEFB    $00             ;;(+00,+00,+00)         x, n, 8.

        DEFB    $03             ;;subtract              x, n-8.
        DEFB    $18             ;;neg                   x, 8-n.
        DEFB    $38             ;;e-to-fp               x * (10^n)

; finally the 8 or 9 digit decimal is rounded.
; a ten-digit integer can arise in the case of, say, 999999999.5
; which gives 1000000000.

        DEFB    $A2             ;;stk-half
        DEFB    $0F             ;;addition
        DEFB    $24             ;;int                   i.
        DEFB    $34             ;;end-calc

; If there were 8 digits then final rounding will take place on the calculator
; stack above and the next two instructions insert a masked zero so that
; no further rounding occurs. If the result is a 9 digit integer then
; rounding takes place within the buffer.

160E 21 6B 40     LD      HL,$406B        ; address system variable MEM-2-5th
                                ; which could be the 'ninth' digit.
1611 36 90        LD      (HL),$90        ; insert the value $90  10010000

; now starting from lowest digit lay down the 8, 9 or 10 digit integer
; which represents the significant portion of the number
; e.g. PI will be the nine-digit integer 314159265

1613 06 0A        LD      B,$0A           ; count is ten digits.

;; PF-LOOP
1615 23           INC     HL              ; increase pointer

1616 E5           PUSH    HL              ; preserve buffer address.
1617 C5           PUSH    BC              ; preserve counter.

1618 EF           RST     28H             ;; FP-CALC              i.
        DEFB    $A4             ;;stk-ten               i, 10.
        DEFB    $2E             ;;n-mod-m               i mod 10, i/10
        DEFB    $01             ;;exchange              i/10, remainder.
        DEFB    $34             ;;end-calc

161D CD CD 15     CALL    L15CD           ; routine FP-TO-A  $00-$09

1620 F6 90        OR      $90             ; make left hand nibble 9

1622 C1           POP     BC              ; restore counter
1623 E1           POP     HL              ; restore buffer address.

1624 77           LD      (HL),A          ; insert masked digit in buffer.
1625 10 EE        DJNZ    L1615           ; loop back for all ten to PF-LOOP

; the most significant digit will be last but if the number is exhausted then
; the last one or two positions will contain zero ($90).

; e.g. for 'one' we have zero as estimate of leading digits.
; 1*10^8 100000000 as integer value
; 90 90 90 90 90   90 90 90 91 90 as buffer mem3/mem4 contents.


1627 23           INC     HL              ; advance pointer to one past buffer
1628 01 08 00     LD      BC,$0008        ; set C to 8 ( B is already zero )
162B E5           PUSH    HL              ; save pointer.

;; PF-NULL
162C 2B           DEC     HL              ; decrease pointer
162D 7E           LD      A,(HL)          ; fetch masked digit
162E FE 90        CP      $90             ; is it a leading zero ?
1630 28 FA        JR      Z,L162C         ; loop back if so to PF-NULL

; at this point a significant digit has been found. carry is reset.

1632 ED 42        SBC     HL,BC           ; subtract eight from the address.
1634 E5           PUSH    HL              ; ** save this pointer too
1635 7E           LD      A,(HL)          ; fetch addressed byte
1636 C6 6B        ADD     A,$6B           ; add $6B - forcing a round up ripple
                                ; if  $95 or over.
1638 F5           PUSH    AF              ; save the carry result.

; now enter a loop to round the number. After rounding has been considered
; a zero that has arisen from rounding or that was present at that position
; originally is changed from $90 to $80.

;; PF-RND-LP
1639 F1           POP     AF              ; retrieve carry from machine stack.
163A 23           INC     HL              ; increment address
163B 7E           LD      A,(HL)          ; fetch new byte
163C CE 00        ADC     A,$00           ; add in any carry

163E 27           DAA                     ; decimal adjust accumulator
                                ; carry will ripple through the '9'

163F F5           PUSH    AF              ; save carry on machine stack.
1640 E6 0F        AND     $0F             ; isolate character 0 - 9 AND set zero flag
                                ; if zero.
1642 77           LD      (HL),A          ; place back in location.
1643 CB FE        SET     7,(HL)          ; set bit 7 to show printable.
                                ; but not if trailing zero after decimal point.
1645 28 F2        JR      Z,L1639         ; back if a zero to PF-RND-LP
                                ; to consider further rounding and/or trailing
                                ; zero identification.

1647 F1           POP     AF              ; balance stack
1648 E1           POP     HL              ; ** retrieve lower pointer

; now insert 6 trailing zeros which are printed if before the decimal point
; but mark the end of printing if after decimal point.
; e.g. 9876543210123 is printed as 9876543200000
; 123.456001 is printed as 123.456

1649 06 06        LD      B,$06           ; the count is six.

;; PF-ZERO-6
164B 36 80        LD      (HL),$80        ; insert a masked zero
164D 2B           DEC     HL              ; decrease pointer.
164E 10 FB        DJNZ    L164B           ; loop back for all six to PF-ZERO-6

; n-mod-m reduced the number to zero and this is now deleted from the calculator
; stack before fetching the original estimate of leading digits.


1650 EF           RST     28H             ;; FP-CALC              0.
        DEFB    $02             ;;delete                .
        DEFB    $E1             ;;get-mem-1             n.
        DEFB    $34             ;;end-calc              n.

1654 CD CD 15     CALL    L15CD           ; routine FP-TO-A
1657 28 02        JR      Z,L165B         ; skip forward if positive to PF-POS

1659 ED 44        NEG                     ; negate makes positive

;; PF-POS
165B 5F           LD      E,A             ; transfer count of digits to E
165C 1C           INC     E               ; increment twice
165D 1C           INC     E               ;
165E E1           POP     HL              ; * retrieve pointer to one past buffer.

;; GET-FIRST
165F 2B           DEC     HL              ; decrement address.
1660 1D           DEC     E               ; decrement digit counter.
1661 7E           LD      A,(HL)          ; fetch masked byte.
1662 E6 0F        AND     $0F             ; isolate right-hand nibble.
1664 28 F9        JR      Z,L165F         ; back with leading zero to GET-FIRST

; now determine if E-format printing is needed

1666 7B           LD      A,E             ; transfer now accurate number count to A.
1667 D6 05        SUB     $05             ; subtract five
1669 FE 08        CP      $08             ; compare with 8 as maximum digits is 13.
166B F2 82 16     JP      P,L1682         ; forward if positive to PF-E-FMT

166E FE F6        CP      $F6             ; test for more than four zeros after point.
1670 FA 82 16     JP      M,L1682         ; forward if so to PF-E-FMT

1673 C6 06        ADD     A,$06           ; test for zero leading digits, e.g. 0.5
1675 28 48        JR      Z,L16BF         ; forward if so to PF-ZERO-1

1677 FA B2 16     JP      M,L16B2         ; forward if more than one zero to PF-ZEROS

; else digits before the decimal point are to be printed

167A 47           LD      B,A             ; count of leading characters to B.

;; PF-NIB-LP
167B CD D0 16     CALL    L16D0           ; routine PF-NIBBLE
167E 10 FB        DJNZ    L167B           ; loop back for counted numbers to PF-NIB-LP

1680 18 40        JR      L16C2           ; forward to consider decimal part to PF-DC-OUT

; ---

;; PF-E-FMT
1682 43           LD      B,E             ; count to B
1683 CD D0 16     CALL    L16D0           ; routine PF-NIBBLE prints one digit.
1686 CD C2 16     CALL    L16C2           ; routine PF-DC-OUT considers fractional part.

1689 3E 2A        LD      A,$2A           ; prepare character 'E'
168B D7           RST     10H             ; PRINT-A

168C 78           LD      A,B             ; transfer exponent to A
168D A7           AND     A               ; test the sign.
168E F2 98 16     JP      P,L1698         ; forward if positive to PF-E-POS

1691 ED 44        NEG                     ; negate the negative exponent.
1693 47           LD      B,A             ; save positive exponent in B.

1694 3E 16        LD      A,$16           ; prepare character '-'
1696 18 02        JR      L169A           ; skip forward to PF-E-SIGN

; ---

;; PF-E-POS
1698 3E 15        LD      A,$15           ; prepare character '+'

;; PF-E-SIGN
169A D7           RST     10H             ; PRINT-A

; now convert the integer exponent in B to two characters.
; it will be less than 99.

169B 78           LD      A,B             ; fetch positive exponent.
169C 06 FF        LD      B,$FF           ; initialize left hand digit to minus one.

;; PF-E-TENS
169E 04           INC     B               ; increment ten count
169F D6 0A        SUB     $0A             ; subtract ten from exponent
16A1 30 FB        JR      NC,L169E        ; loop back if greater than ten to PF-E-TENS

16A3 C6 0A        ADD     A,$0A           ; reverse last subtraction
16A5 4F           LD      C,A             ; transfer remainder to C

16A6 78           LD      A,B             ; transfer ten value to A.
16A7 A7           AND     A               ; test for zero.
16A8 28 03        JR      Z,L16AD         ; skip forward if so to PF-E-LOW

16AA CD EB 07     CALL    L07EB           ; routine OUT-CODE prints as digit '1' - '9'

;; PF-E-LOW
16AD 79           LD      A,C             ; low byte to A
16AE CD EB 07     CALL    L07EB           ; routine OUT-CODE prints final digit of the
                                ; exponent.
16B1 C9           RET                     ; return.                               >>

; ---

; this branch deals with zeros after decimal point.
; e.g.      .01 or .0000999

;; PF-ZEROS
16B2 ED 44        NEG                     ; negate makes number positive 1 to 4.
16B4 47           LD      B,A             ; zero count to B.

16B5 3E 1B        LD      A,$1B           ; prepare character '.'
16B7 D7           RST     10H             ; PRINT-A

16B8 3E 1C        LD      A,$1C           ; prepare a '0'

;; PF-ZRO-LP
16BA D7           RST     10H             ; PRINT-A
16BB 10 FD        DJNZ    L16BA           ; loop back to PF-ZRO-LP

16BD 18 09        JR      L16C8           ; forward to PF-FRAC-LP

; ---

; there is  a need to print a leading zero e.g. 0.1 but not with .01

;; PF-ZERO-1
16BF 3E 1C        LD      A,$1C           ; prepare character '0'.
16C1 D7           RST     10H             ; PRINT-A

; this subroutine considers the decimal point and any trailing digits.
; if the next character is a marked zero, $80, then nothing more to print.

;; PF-DC-OUT
16C2 35           DEC     (HL)            ; decrement addressed character
16C3 34           INC     (HL)            ; increment it again
16C4 E8           RET     PE              ; return with overflow  (was 128) >>
                                ; as no fractional part

; else there is a fractional part so print the decimal point.

16C5 3E 1B        LD      A,$1B           ; prepare character '.'
16C7 D7           RST     10H             ; PRINT-A

; now enter a loop to print trailing digits

;; PF-FRAC-LP
16C8 35           DEC     (HL)            ; test for a marked zero.
16C9 34           INC     (HL)            ;
16CA E8           RET     PE              ; return when digits exhausted          >>

16CB CD D0 16     CALL    L16D0           ; routine PF-NIBBLE
16CE 18 F8        JR      L16C8           ; back for all fractional digits to PF-FRAC-LP.

; ---

; subroutine to print right-hand nibble

;; PF-NIBBLE
16D0 7E           LD      A,(HL)          ; fetch addressed byte
16D1 E6 0F        AND     $0F             ; mask off lower 4 bits
16D3 CD EB 07     CALL    L07EB           ; routine OUT-CODE
16D6 2B           DEC     HL              ; decrement pointer.
16D7 C9           RET                     ; return.


; -------------------------------
; THE 'PREPARE TO ADD' SUBROUTINE
; -------------------------------
; This routine is called twice to prepare each floating point number for
; addition, in situ, on the calculator stack.
; The exponent is picked up from the first byte which is then cleared to act
; as a sign byte and accept any overflow.
; If the exponent is zero then the number is zero and an early return is made.
; The now redundant sign bit of the mantissa is set and if the number is
; negative then all five bytes of the number are twos-complemented to prepare
; the number for addition.
; On the second invocation the exponent of the first number is in B.


;; PREP-ADD
16D8 7E           LD      A,(HL)          ; fetch exponent.
16D9 36 00        LD      (HL),$00        ; make this byte zero to take any overflow and
                                ; default to positive.
16DB A7           AND     A               ; test stored exponent for zero.
16DC C8           RET     Z               ; return with zero flag set if number is zero.

16DD 23           INC     HL              ; point to first byte of mantissa.
16DE CB 7E        BIT     7,(HL)          ; test the sign bit.
16E0 CB FE        SET     7,(HL)          ; set it to its implied state.
16E2 2B           DEC     HL              ; set pointer to first byte again.
16E3 C8           RET     Z               ; return if bit indicated number is positive.>>

; if negative then all five bytes are twos complemented starting at LSB.

16E4 C5           PUSH    BC              ; save B register contents.
16E5 01 05 00     LD      BC,$0005        ; set BC to five.
16E8 09           ADD     HL,BC           ; point to location after 5th byte.
16E9 41           LD      B,C             ; set the B counter to five.
16EA 4F           LD      C,A             ; store original exponent in C.
16EB 37           SCF                     ; set carry flag so that one is added.

; now enter a loop to twos-complement the number.
; The first of the five bytes becomes $FF to denote a negative number.

;; NEG-BYTE
16EC 2B           DEC     HL              ; point to first or more significant byte.
16ED 7E           LD      A,(HL)          ; fetch to accumulator.
16EE 2F           CPL                     ; complement.
16EF CE 00        ADC     A,$00           ; add in initial carry or any subsequent carry.
16F1 77           LD      (HL),A          ; place number back.
16F2 10 F8        DJNZ    L16EC           ; loop back five times to NEG-BYTE

16F4 79           LD      A,C             ; restore the exponent to accumulator.
16F5 C1           POP     BC              ; restore B register contents.

16F6 C9           RET                     ; return.

; ----------------------------------
; THE 'FETCH TWO NUMBERS' SUBROUTINE
; ----------------------------------
; This routine is used by addition, multiplication and division to fetch
; the two five-byte numbers addressed by HL and DE from the calculator stack
; into the Z80 registers.
; The HL register may no longer point to the first of the two numbers.
; Since the 32-bit addition operation is accomplished using two Z80 16-bit
; instructions, it is important that the lower two bytes of each mantissa are
; in one set of registers and the other bytes all in the alternate set.
;
; In: HL = highest number, DE= lowest number
;
;         : alt':   :
; Out:    :H,B-C:C,B: num1
;         :L,D-E:D-E: num2

;; FETCH-TWO
16F7 E5           PUSH    HL              ; save HL
16F8 F5           PUSH    AF              ; save A - result sign when used from division.

16F9 4E           LD      C,(HL)          ;
16FA 23           INC     HL              ;
16FB 46           LD      B,(HL)          ;
16FC 77           LD      (HL),A          ; insert sign when used from multiplication.
16FD 23           INC     HL              ;
16FE 79           LD      A,C             ; m1
16FF 4E           LD      C,(HL)          ;
1700 C5           PUSH    BC              ; PUSH m2 m3

1701 23           INC     HL              ;
1702 4E           LD      C,(HL)          ; m4
1703 23           INC     HL              ;
1704 46           LD      B,(HL)          ; m5  BC holds m5 m4

1705 EB           EX      DE,HL           ; make HL point to start of second number.

1706 57           LD      D,A             ; m1
1707 5E           LD      E,(HL)          ;
1708 D5           PUSH    DE              ; PUSH m1 n1

1709 23           INC     HL              ;
170A 56           LD      D,(HL)          ;
170B 23           INC     HL              ;
170C 5E           LD      E,(HL)          ;
170D D5           PUSH    DE              ; PUSH n2 n3

170E D9           EXX                     ; - - - - - - -

170F D1           POP     DE              ; POP n2 n3
1710 E1           POP     HL              ; POP m1 n1
1711 C1           POP     BC              ; POP m2 m3

1712 D9           EXX                     ; - - - - - - -

1713 23           INC     HL              ;
1714 56           LD      D,(HL)          ;
1715 23           INC     HL              ;
1716 5E           LD      E,(HL)          ; DE holds n4 n5

1717 F1           POP     AF              ; restore saved
1718 E1           POP     HL              ; registers.
1719 C9           RET                     ; return.

; -----------------------------
; THE 'SHIFT ADDEND' SUBROUTINE
; -----------------------------
; The accumulator A contains the difference between the two exponents.
; This is the lowest of the two numbers to be added

;; SHIFT-FP
171A A7           AND     A               ; test difference between exponents.
171B C8           RET     Z               ; return if zero. both normal.

171C FE 21        CP      $21             ; compare with 33 bits.
171E 30 16        JR      NC,L1736        ; forward if greater than 32 to ADDEND-0

1720 C5           PUSH    BC              ; preserve BC - part
1721 47           LD      B,A             ; shift counter to B.

; Now perform B right shifts on the addend  L'D'E'D E
; to bring it into line with the augend     H'B'C'C B

;; ONE-SHIFT
1722 D9           EXX                     ; - - -
1723 CB 2D        SRA     L               ;    76543210->C    bit 7 unchanged.
1725 CB 1A        RR      D               ; C->76543210->C
1727 CB 1B        RR      E               ; C->76543210->C
1729 D9           EXX                     ; - - -
172A CB 1A        RR      D               ; C->76543210->C
172C CB 1B        RR      E               ; C->76543210->C
172E 10 F2        DJNZ    L1722           ; loop back B times to ONE-SHIFT

1730 C1           POP     BC              ; restore BC
1731 D0           RET     NC              ; return if last shift produced no carry.   >>

; if carry flag was set then accuracy is being lost so round up the addend.

1732 CD 41 17     CALL    L1741           ; routine ADD-BACK
1735 C0           RET     NZ              ; return if not FF 00 00 00 00

; this branch makes all five bytes of the addend zero and is made during
; addition when the exponents are too far apart for the addend bits to
; affect the result.

;; ADDEND-0
1736 D9           EXX                     ; select alternate set for more significant
                                ; bytes.
1737 AF           XOR     A               ; clear accumulator.


; this entry point (from multiplication) sets four of the bytes to zero or if
; continuing from above, during addition, then all five bytes are set to zero.

;; ZEROS-4/5
1738 2E 00        LD      L,$00           ; set byte 1 to zero.
173A 57           LD      D,A             ; set byte 2 to A.
173B 5D           LD      E,L             ; set byte 3 to zero.
173C D9           EXX                     ; select main set
173D 11 00 00     LD      DE,$0000        ; set lower bytes 4 and 5 to zero.
1740 C9           RET                     ; return.

; -------------------------
; THE 'ADD-BACK' SUBROUTINE
; -------------------------
; Called from SHIFT-FP above during addition and after normalization from
; multiplication.
; This is really a 32-bit increment routine which sets the zero flag according
; to the 32-bit result.
; During addition, only negative numbers like FF FF FF FF FF,
; the twos-complement version of xx 80 00 00 01 say
; will result in a full ripple FF 00 00 00 00.
; FF FF FF FF FF when shifted right is unchanged by SHIFT-FP but sets the
; carry invoking this routine.

;; ADD-BACK
1741 1C           INC     E               ;
1742 C0           RET     NZ              ;

1743 14           INC     D               ;
1744 C0           RET     NZ              ;

1745 D9           EXX                     ;
1746 1C           INC     E               ;
1747 20 01        JR      NZ,L174A        ; forward if no overflow to ALL-ADDED

1749 14           INC     D               ;

;; ALL-ADDED
174A D9           EXX                     ;
174B C9           RET                     ; return with zero flag set for zero mantissa.


; ---------------------------
; THE 'SUBTRACTION' OPERATION
; ---------------------------
; just switch the sign of subtrahend and do an add.

;; subtract
174C 1A           LD      A,(DE)          ; fetch exponent byte of second number the
                                ; subtrahend.
174D A7           AND     A               ; test for zero
174E C8           RET     Z               ; return if zero - first number is result.

174F 13           INC     DE              ; address the first mantissa byte.
1750 1A           LD      A,(DE)          ; fetch to accumulator.
1751 EE 80        XOR     $80             ; toggle the sign bit.
1753 12           LD      (DE),A          ; place back on calculator stack.
1754 1B           DEC     DE              ; point to exponent byte.
                                ; continue into addition routine.

; ------------------------
; THE 'ADDITION' OPERATION
; ------------------------
; The addition operation pulls out all the stops and uses most of the Z80's
; registers to add two floating-point numbers.
; This is a binary operation and on entry, HL points to the first number
; and DE to the second.

;; addition
1755 D9           EXX                     ; - - -
1756 E5           PUSH    HL              ; save the pointer to the next literal.
1757 D9           EXX                     ; - - -

1758 D5           PUSH    DE              ; save pointer to second number
1759 E5           PUSH    HL              ; save pointer to first number - will be the
                                ; result pointer on calculator stack.

175A CD D8 16     CALL    L16D8           ; routine PREP-ADD
175D 47           LD      B,A             ; save first exponent byte in B.
175E EB           EX      DE,HL           ; switch number pointers.
175F CD D8 16     CALL    L16D8           ; routine PREP-ADD
1762 4F           LD      C,A             ; save second exponent byte in C.
1763 B8           CP      B               ; compare the exponent bytes.
1764 30 03        JR      NC,L1769        ; forward if second higher to SHIFT-LEN

1766 78           LD      A,B             ; else higher exponent to A
1767 41           LD      B,C             ; lower exponent to B
1768 EB           EX      DE,HL           ; switch the number pointers.

;; SHIFT-LEN
1769 F5           PUSH    AF              ; save higher exponent
176A 90           SUB     B               ; subtract lower exponent

176B CD F7 16     CALL    L16F7           ; routine FETCH-TWO
176E CD 1A 17     CALL    L171A           ; routine SHIFT-FP

1771 F1           POP     AF              ; restore higher exponent.
1772 E1           POP     HL              ; restore result pointer.
1773 77           LD      (HL),A          ; insert exponent byte.
1774 E5           PUSH    HL              ; save result pointer again.

; now perform the 32-bit addition using two 16-bit Z80 add instructions.

1775 68           LD      L,B             ; transfer low bytes of mantissa individually
1776 61           LD      H,C             ; to HL register

1777 19           ADD     HL,DE           ; the actual binary addition of lower bytes

; now the two higher byte pairs that are in the alternate register sets.

1778 D9           EXX                     ; switch in set
1779 EB           EX      DE,HL           ; transfer high mantissa bytes to HL register.

177A ED 4A        ADC     HL,BC           ; the actual addition of higher bytes with
                                ; any carry from first stage.

177C EB           EX      DE,HL           ; result in DE, sign bytes ($FF or $00) to HL

; now consider the two sign bytes

177D 7C           LD      A,H             ; fetch sign byte of num1

177E 8D           ADC     A,L             ; add including any carry from mantissa
                                ; addition. 00 or 01 or FE or FF

177F 6F           LD      L,A             ; result in L.

; possible outcomes of signs and overflow from mantissa are
;
;  H +  L + carry =  L    RRA  XOR L  RRA
; ------------------------------------------------------------
; 00 + 00         = 00    00   00
; 00 + 00 + carry = 01    00   01     carry
; FF + FF         = FE C  FF   01     carry
; FF + FF + carry = FF C  FF   00
; FF + 00         = FF    FF   00
; FF + 00 + carry = 00 C  80   80

1780 1F           RRA                     ; C->76543210->C
1781 AD           XOR     L               ; set bit 0 if shifting required.

1782 D9           EXX                     ; switch back to main set
1783 EB           EX      DE,HL           ; full mantissa result now in D'E'D E registers.
1784 E1           POP     HL              ; restore pointer to result exponent on
                                ; the calculator stack.

1785 1F           RRA                     ; has overflow occurred ?
1786 30 08        JR      NC,L1790        ; skip forward if not to TEST-NEG

; if the addition of two positive mantissas produced overflow or if the
; addition of two negative mantissas did not then the result exponent has to
; be incremented and the mantissa shifted one place to the right.

1788 3E 01        LD      A,$01           ; one shift required.
178A CD 1A 17     CALL    L171A           ; routine SHIFT-FP performs a single shift
                                ; rounding any lost bit
178D 34           INC     (HL)            ; increment the exponent.
178E 28 23        JR      Z,L17B3         ; forward to ADD-REP-6 if the exponent
                                ; wraps round from FF to zero as number is too
                                ; big for the system.

; at this stage the exponent on the calculator stack is correct.

;; TEST-NEG
1790 D9           EXX                     ; switch in the alternate set.
1791 7D           LD      A,L             ; load result sign to accumulator.
1792 E6 80        AND     $80             ; isolate bit 7 from sign byte setting zero
                                ; flag if positive.
1794 D9           EXX                     ; back to main set.

1795 23           INC     HL              ; point to first byte of mantissa
1796 77           LD      (HL),A          ; insert $00 positive or $80 negative at
                                ; position on calculator stack.

1797 2B           DEC     HL              ; point to exponent again.
1798 28 1F        JR      Z,L17B9         ; forward if positive to GO-NC-MLT

; a negative number has to be twos-complemented before being placed on stack.

179A 7B           LD      A,E             ; fetch lowest (rightmost) mantissa byte.
179B ED 44        NEG                     ; Negate
179D 3F           CCF                     ; Complement Carry Flag
179E 5F           LD      E,A             ; place back in register

179F 7A           LD      A,D             ; ditto
17A0 2F           CPL                     ;
17A1 CE 00        ADC     A,$00           ;
17A3 57           LD      D,A             ;

17A4 D9           EXX                     ; switch to higher (leftmost) 16 bits.

17A5 7B           LD      A,E             ; ditto
17A6 2F           CPL                     ;
17A7 CE 00        ADC     A,$00           ;
17A9 5F           LD      E,A             ;

17AA 7A           LD      A,D             ; ditto
17AB 2F           CPL                     ;
17AC CE 00        ADC     A,$00           ;
17AE 30 07        JR      NC,L17B7        ; forward without overflow to END-COMPL

; else entire mantissa is now zero.  00 00 00 00

17B0 1F           RRA                     ; set mantissa to 80 00 00 00
17B1 D9           EXX                     ; switch.
17B2 34           INC     (HL)            ; increment the exponent.

;; ADD-REP-6
17B3 CA 80 18     JP      Z,L1880         ; jump forward if exponent now zero to REPORT-6
                                ; 'Number too big'

17B6 D9           EXX                     ; switch back to alternate set.

;; END-COMPL
17B7 57           LD      D,A             ; put first byte of mantissa back in DE.
17B8 D9           EXX                     ; switch to main set.

;; GO-NC-MLT
17B9 AF           XOR     A               ; clear carry flag and
                                ; clear accumulator so no extra bits carried
                                ; forward as occurs in multiplication.

17BA 18 6C        JR      L1828           ; forward to common code at TEST-NORM
                                ; but should go straight to NORMALIZE.


; ----------------------------------------------
; THE 'PREPARE TO MULTIPLY OR DIVIDE' SUBROUTINE
; ----------------------------------------------
; this routine is called twice from multiplication and twice from division
; to prepare each of the two numbers for the operation.
; Initially the accumulator holds zero and after the second invocation bit 7
; of the accumulator will be the sign bit of the result.

;; PREP-M/D
17BC    SCF                     ; set carry flag to signal number is zero.
        DEC     (HL)            ; test exponent
        INC     (HL)            ; for zero.
        RET     Z               ; return if zero with carry flag set.

        INC     HL              ; address first mantissa byte.
        XOR     (HL)            ; exclusive or the running sign bit.
        SET     7,(HL)          ; set the implied bit.
        DEC     HL              ; point to exponent byte.
        RET                     ; return.

; ------------------------------
; THE 'MULTIPLICATION' OPERATION
; ------------------------------
;
;

;; multiply
17C6 AF           XOR     A               ; reset bit 7 of running sign flag.
17C7 CD BC 17     CALL    L17BC           ; routine PREP-M/D
17CA D8           RET     C               ; return if number is zero.
                                ; zero * anything = zero.

17CB D9           EXX                     ; - - -
17CC E5           PUSH    HL              ; save pointer to 'next literal'
17CD D9           EXX                     ; - - -

17CE D5           PUSH    DE              ; save pointer to second number

17CF EB           EX      DE,HL           ; make HL address second number.

17D0 CD BC 17     CALL    L17BC           ; routine PREP-M/D

17D3 EB           EX      DE,HL           ; HL first number, DE - second number
17D4 38 5A        JR      C,L1830         ; forward with carry to ZERO-RSLT
                                ; anything * zero = zero.

17D6 E5           PUSH    HL              ; save pointer to first number.

17D7 CD F7 16     CALL    L16F7           ; routine FETCH-TWO fetches two mantissas from
                                ; calc stack to B'C'C,B  D'E'D E
                                ; (HL will be overwritten but the result sign
                                ; in A is inserted on the calculator stack)

17DA 78           LD      A,B             ; transfer low mantissa byte of first number
17DB A7           AND     A               ; clear carry.
17DC ED 62        SBC     HL,HL           ; a short form of LD HL,$0000 to take lower
                                ; two bytes of result. (2 program bytes)
17DE D9           EXX                     ; switch in alternate set
17DF E5           PUSH    HL              ; preserve HL
17E0 ED 62        SBC     HL,HL           ; set HL to zero also to take higher two bytes
                                ; of the result and clear carry.
17E2 D9           EXX                     ; switch back.

17E3 06 21        LD      B,$21           ; register B can now be used to count thirty
                                ; three shifts.
17E5 18 11        JR      L17F8           ; forward to loop entry point STRT-MLT

; ---

; The multiplication loop is entered at  STRT-LOOP.

;; MLT-LOOP
17E7 30 05        JR      NC,L17EE        ; forward if no carry to NO-ADD

                                ; else add in the multiplicand.

17E9 19           ADD     HL,DE           ; add the two low bytes to result
17EA D9           EXX                     ; switch to more significant bytes.
17EB ED 5A        ADC     HL,DE           ; add high bytes of multiplicand and any carry.
17ED D9           EXX                     ; switch to main set.

; in either case shift result right into B'C'C A

;; NO-ADD
17EE D9           EXX                     ; switch to alternate set
17EF CB 1C        RR      H               ; C > 76543210 > C
17F1 CB 1D        RR      L               ; C > 76543210 > C
17F3 D9           EXX                     ;
17F4 CB 1C        RR      H               ; C > 76543210 > C
17F6 CB 1D        RR      L               ; C > 76543210 > C

;; STRT-MLT
17F8 D9           EXX                     ; switch in alternate set.
17F9 CB 18        RR      B               ; C > 76543210 > C
17FB CB 19        RR      C               ; C > 76543210 > C
17FD D9           EXX                     ; now main set
17FE CB 19        RR      C               ; C > 76543210 > C
1800 1F           RRA                     ; C > 76543210 > C
1801 10 E4        DJNZ    L17E7           ; loop back 33 times to MLT-LOOP

;

1803 EB           EX      DE,HL           ;
1804 D9           EXX                     ;
1805 EB           EX      DE,HL           ;
1806 D9           EXX                     ;
1807 C1           POP     BC              ;
1808 E1           POP     HL              ;
1809 78           LD      A,B             ;
180A 81           ADD     A,C             ;
180B 20 01        JR      NZ,L180E        ; forward to MAKE-EXPT

180D A7           AND     A               ;

;; MAKE-EXPT
180E 3D           DEC     A               ;
180F 3F           CCF                     ; Complement Carry Flag

;; DIVN-EXPT
1810 17           RLA                     ;
1811 3F           CCF                     ; Complement Carry Flag
1812 1F           RRA                     ;
1813 F2 19 18     JP      P,L1819         ; forward to OFLW1-CLR

1816 30 68        JR      NC,L1880        ; forward to REPORT-6

1818 A7           AND     A               ;

;; OFLW1-CLR
1819 3C           INC     A               ;
181A 20 08        JR      NZ,L1824        ; forward to OFLW2-CLR

181C 38 06        JR      C,L1824         ; forward to OFLW2-CLR

181E D9           EXX                     ;
181F CB 7A        BIT     7,D             ;
1821 D9           EXX                     ;
1822 20 5C        JR      NZ,L1880        ; forward to REPORT-6

;; OFLW2-CLR
1824 77           LD      (HL),A          ;
1825 D9           EXX                     ;
1826 78           LD      A,B             ;
1827 D9           EXX                     ;

; addition joins here with carry flag clear.

;; TEST-NORM
1828 30 15        JR      NC,L183F        ; forward to NORMALIZE

182A 7E           LD      A,(HL)          ;
182B A7           AND     A               ;

;; NEAR-ZERO
182C 3E 80        LD      A,$80           ; prepare to rescue the most significant bit
                                ; of the mantissa if it is set.
182E 28 01        JR      Z,L1831         ; skip forward to SKIP-ZERO

;; ZERO-RSLT
1830 AF           XOR     A               ; make mask byte zero signaling set five
                                ; bytes to zero.

;; SKIP-ZERO
1831 D9           EXX                     ; switch in alternate set
1832 A2           AND     D               ; isolate most significant bit (if A is $80).

1833 CD 38 17     CALL    L1738           ; routine ZEROS-4/5 sets mantissa without
                                ; affecting any flags.

1836 07           RLCA                    ; test if MSB set. bit 7 goes to bit 0.
                                ; either $00 -> $00 or $80 -> $01
1837 77           LD      (HL),A          ; make exponent $01 (lowest) or $00 zero
1838 38 2E        JR      C,L1868         ; forward if first case to OFLOW-CLR

183A 23           INC     HL              ; address first mantissa byte on the
                                ; calculator stack.
183B 77           LD      (HL),A          ; insert a zero for the sign bit.
183C 2B           DEC     HL              ; point to zero exponent
183D 18 29        JR      L1868           ; forward to OFLOW-CLR

; ---

; this branch is common to addition and multiplication with the mantissa
; result still in registers D'E'D E .

;; NORMALIZE
183F 06 20        LD      B,$20           ; a maximum of thirty-two left shifts will be
                                ; needed.

;; SHIFT-ONE
1841 D9           EXX                     ; address higher 16 bits.
1842 CB 7A        BIT     7,D             ; test the leftmost bit
1844 D9           EXX                     ; address lower 16 bits.

1845 20 12        JR      NZ,L1859        ; forward if leftmost bit was set to NORML-NOW

1847 07           RLCA                    ; this holds zero from addition, 33rd bit
                                ; from multiplication.

1848 CB 13        RL      E               ; C < 76543210 < C
184A CB 12        RL      D               ; C < 76543210 < C

184C D9           EXX                     ; address higher 16 bits.

184D CB 13        RL      E               ; C < 76543210 < C
184F CB 12        RL      D               ; C < 76543210 < C

1851 D9           EXX                     ; switch to main set.

1852 35           DEC     (HL)            ; decrement the exponent byte on the calculator
                                ; stack.

1853 28 D7        JR      Z,L182C         ; back if exponent becomes zero to NEAR-ZERO
                                ; it's just possible that the last rotation
                                ; set bit 7 of D. We shall see.

1855 10 EA        DJNZ    L1841           ; loop back to SHIFT-ONE

; if thirty-two left shifts were performed without setting the most significant
; bit then the result is zero.

1857 18 D7        JR      L1830           ; back to ZERO-RSLT

; ---

;; NORML-NOW
1859 17           RLA                     ; for the addition path, A is always zero.
                                ; for the mult path, ...

185A 30 0C        JR      NC,L1868        ; forward to OFLOW-CLR

; this branch is taken only with multiplication.

185C CD 41 17     CALL    L1741           ; routine ADD-BACK

185F 20 07        JR      NZ,L1868        ; forward to OFLOW-CLR

1861 D9           EXX                     ;
1862 16 80        LD      D,$80           ;
1864 D9           EXX                     ;
1865 34           INC     (HL)            ;
1866 28 18        JR      Z,L1880         ; forward to REPORT-6

; now transfer the mantissa from the register sets to the calculator stack
; incorporating the sign bit already there.

;; OFLOW-CLR
1868 E5           PUSH    HL              ; save pointer to exponent on stack.
1869 23           INC     HL              ; address first byte of mantissa which was
                                ; previously loaded with sign bit $00 or $80.

186A D9           EXX                     ; - - -
186B D5           PUSH    DE              ; push the most significant two bytes.
186C D9           EXX                     ; - - -

186D C1           POP     BC              ; pop - true mantissa is now BCDE.

; now pick up the sign bit.

186E 78           LD      A,B             ; first mantissa byte to A
186F 17           RLA                     ; rotate out bit 7 which is set
1870 CB 16        RL      (HL)            ; rotate sign bit on stack into carry.
1872 1F           RRA                     ; rotate sign bit into bit 7 of mantissa.

; and transfer mantissa from main registers to calculator stack.

1873 77           LD      (HL),A          ;
1874 23           INC     HL              ;
1875 71           LD      (HL),C          ;
1876 23           INC     HL              ;
1877 72           LD      (HL),D          ;
1878 23           INC     HL              ;
1879 73           LD      (HL),E          ;

187A E1           POP     HL              ; restore pointer to num1 now result.
187B D1           POP     DE              ; restore pointer to num2 now STKEND.

187C D9           EXX                     ; - - -
187D E1           POP     HL              ; restore pointer to next calculator literal.
187E D9           EXX                     ; - - -

187F C9           RET                     ; return.

; ---

;; REPORT-6
1880 CF           RST     08H             ; ERROR-1
        DEFB    $05             ; Error Report: Arithmetic overflow.

; ------------------------
; THE 'DIVISION' OPERATION
; ------------------------
;   "Of all the arithmetic subroutines, division is the most complicated and
;   the least understood.  It is particularly interesting to note that the
;   Sinclair programmer himself has made a mistake in his programming ( or has
;   copied over someone else's mistake!) for
;   PRINT PEEK 6352 [ $18D0 ] ('unimproved' ROM, 6351 [ $18CF ] )
;   should give 218 not 225."
;   - Dr. Ian Logan, Syntax magazine Jul/Aug 1982.
;   [  i.e. the jump should be made to div-34th ]

;   First check for division by zero.

;; division
1882 EB           EX      DE,HL           ; consider the second number first.
1883 AF           XOR     A               ; set the running sign flag.
1884 CD BC 17     CALL    L17BC           ; routine PREP-M/D
1887 38 F7        JR      C,L1880         ; back if zero to REPORT-6
                                ; 'Arithmetic overflow'

1889 EB           EX      DE,HL           ; now prepare first number and check for zero.
188A CD BC 17     CALL    L17BC           ; routine PREP-M/D
188D D8           RET     C               ; return if zero, 0/anything is zero.

188E D9           EXX                     ; - - -
188F E5           PUSH    HL              ; save pointer to the next calculator literal.
1890 D9           EXX                     ; - - -

1891 D5           PUSH    DE              ; save pointer to divisor - will be STKEND.
1892 E5           PUSH    HL              ; save pointer to dividend - will be result.

1893 CD F7 16     CALL    L16F7           ; routine FETCH-TWO fetches the two numbers
                                ; into the registers H'B'C'C B
                                ;                    L'D'E'D E
1896 D9           EXX                     ; - - -
1897 E5           PUSH    HL              ; save the two exponents.

1898 60           LD      H,B             ; transfer the dividend to H'L'H L
1899 69           LD      L,C             ;
189A D9           EXX                     ;
189B 61           LD      H,C             ;
189C 68           LD      L,B             ;

189D AF           XOR     A               ; clear carry bit and accumulator.
189E 06 DF        LD      B,$DF           ; count upwards from -33 decimal
18A0 18 10        JR      L18B2           ; forward to mid-loop entry point DIV-START

; ---

;; DIV-LOOP
18A2 17           RLA                     ; multiply partial quotient by two
18A3 CB 11        RL      C               ; setting result bit from carry.
18A5 D9           EXX                     ;
18A6 CB 11        RL      C               ;
18A8 CB 10        RL      B               ;
18AA D9           EXX                     ;

;; div-34th
18AB 29           ADD     HL,HL           ;
18AC D9           EXX                     ;
18AD ED 6A        ADC     HL,HL           ;
18AF D9           EXX                     ;
18B0 38 10        JR      C,L18C2         ; forward to SUBN-ONLY

;; DIV-START
18B2 ED 52        SBC     HL,DE           ; subtract divisor part.
18B4 D9           EXX                     ;
18B5 ED 52        SBC     HL,DE           ;
18B7 D9           EXX                     ;
18B8 30 0F        JR      NC,L18C9        ; forward if subtraction goes to NO-RSTORE

18BA 19           ADD     HL,DE           ; else restore
18BB D9           EXX                     ;
18BC ED 5A        ADC     HL,DE           ;
18BE D9           EXX                     ;
18BF A7           AND     A               ; clear carry
18C0 18 08        JR      L18CA           ; forward to COUNT-ONE

; ---

;; SUBN-ONLY
18C2 A7           AND     A               ;
18C3 ED 52        SBC     HL,DE           ;
18C5 D9           EXX                     ;
18C6 ED 52        SBC     HL,DE           ;
18C8 D9           EXX                     ;

;; NO-RSTORE
18C9 37           SCF                     ; set carry flag

;; COUNT-ONE
18CA 04           INC     B               ; increment the counter
18CB FA A2 18     JP      M,L18A2         ; back while still minus to DIV-LOOP

18CE F5           PUSH    AF              ;
18CF 28 E1        JR      Z,L18B2         ; back to DIV-START

; "This jump is made to the wrong place. No 34th bit will ever be obtained
; without first shifting the dividend. Hence important results like 1/10 and
; 1/1000 are not rounded up as they should be. Rounding up never occurs when
; it depends on the 34th bit. The jump should be made to div-34th above."
; - Dr. Frank O'Hara, "The Complete Spectrum ROM Disassembly", 1983,
; published by Melbourne House.
; (Note. on the ZX81 this would be JR Z,L18AB)
;
; However if you make this change, then while (1/2=.5) will now evaluate as
; true, (.25=1/4), which did evaluate as true, no longer does.

18D1 5F           LD      E,A             ;
18D2 51           LD      D,C             ;
18D3 D9           EXX                     ;
18D4 59           LD      E,C             ;
18D5 50           LD      D,B             ;

18D6 F1           POP     AF              ;
18D7 CB 18        RR      B               ;
18D9 F1           POP     AF              ;
18DA CB 18        RR      B               ;

18DC D9           EXX                     ;
18DD C1           POP     BC              ;
18DE E1           POP     HL              ;
18DF 78           LD      A,B             ;
18E0 91           SUB     C               ;
18E1 C3 10 18     JP      L1810           ; jump back to DIVN-EXPT

; ------------------------------------------------
; THE 'INTEGER TRUNCATION TOWARDS ZERO' SUBROUTINE
; ------------------------------------------------
;

;; truncate
18E4 7E           LD      A,(HL)          ; fetch exponent
18E5 FE 81        CP      $81             ; compare to +1
18E7 30 06        JR      NC,L18EF        ; forward, if 1 or more, to T-GR-ZERO

; else the number is smaller than plus or minus 1 and can be made zero.

18E9 36 00        LD      (HL),$00        ; make exponent zero.
18EB 3E 20        LD      A,$20           ; prepare to set 32 bits of mantissa to zero.
18ED 18 05        JR      L18F4           ; forward to NIL-BYTES

; ---

;; T-GR-ZERO
18EF D6 A0        SUB     $A0             ; subtract +32 from exponent
18F1 F0           RET     P               ; return if result is positive as all 32 bits
                                ; of the mantissa relate to the integer part.
                                ; The floating point is somewhere to the right
                                ; of the mantissa

18F2 ED 44        NEG                     ; else negate to form number of rightmost bits
                                ; to be blanked.

; for instance, disregarding the sign bit, the number 3.5 is held as
; exponent $82 mantissa .11100000 00000000 00000000 00000000
; we need to set $82 - $A0 = $E2 NEG = $1E (thirty) bits to zero to form the
; integer.
; The sign of the number is never considered as the first bit of the mantissa
; must be part of the integer.

;; NIL-BYTES
18F4 D5           PUSH    DE              ; save pointer to STKEND
18F5 EB           EX      DE,HL           ; HL points at STKEND
18F6 2B           DEC     HL              ; now at last byte of mantissa.
18F7 47           LD      B,A             ; Transfer bit count to B register.
18F8 CB 38        SRL     B               ; divide by
18FA CB 38        SRL     B               ; eight
18FC CB 38        SRL     B               ;
18FE 28 05        JR      Z,L1905         ; forward if zero to BITS-ZERO

; else the original count was eight or more and whole bytes can be blanked.

;; BYTE-ZERO
1900 36 00        LD      (HL),$00        ; set eight bits to zero.
1902 2B           DEC     HL              ; point to more significant byte of mantissa.
1903 10 FB        DJNZ    L1900           ; loop back to BYTE-ZERO

; now consider any residual bits.

;; BITS-ZERO
1905 E6 07        AND     $07             ; isolate the remaining bits
1907 28 09        JR      Z,L1912         ; forward if none to IX-END

1909 47           LD      B,A             ; transfer bit count to B counter.
190A 3E FF        LD      A,$FF           ; form a mask 11111111

;; LESS-MASK
190C CB 27        SLA     A               ; 1 <- 76543210 <- o     slide mask leftwards.
190E 10 FC        DJNZ    L190C           ; loop back for bit count to LESS-MASK

1910 A6           AND     (HL)            ; lose the unwanted rightmost bits
1911 77           LD      (HL),A          ; and place in mantissa byte.

;; IX-END
1912 EB           EX      DE,HL           ; restore result pointer from DE.
1913 D1           POP     DE              ; restore STKEND from stack.
1914 C9           RET                     ; return.


;********************************
;**  FLOATING-POINT CALCULATOR **
;********************************

; As a general rule the calculator avoids using the IY register.
; Exceptions are val and str$.
; So an assembly language programmer who has disabled interrupts to use IY
; for other purposes can still use the calculator for mathematical
; purposes.


; ------------------------
; THE 'TABLE OF CONSTANTS'
; ------------------------
; The ZX81 has only floating-point number representation.
; Both the ZX80 and the ZX Spectrum have integer numbers in some form.

;; stk-zero                                                 00 00 00 00 00
1915    DEFB    $00             ;;Bytes: 1
        DEFB    $B0             ;;Exponent $00
        DEFB    $00             ;;(+00,+00,+00)

;; stk-one                                                  81 00 00 00 00
1918    DEFB    $31             ;;Exponent $81, Bytes: 1
        DEFB    $00             ;;(+00,+00,+00)


;; stk-half                                                 80 00 00 00 00
191A    DEFB    $30             ;;Exponent: $80, Bytes: 1
        DEFB    $00             ;;(+00,+00,+00)


;; stk-pi/2                                                 81 49 0F DA A2
191C    DEFB    $F1             ;;Exponent: $81, Bytes: 4
        DEFB    $49,$0F,$DA,$A2 ;;

;; stk-ten                                                  84 20 00 00 00
1921    DEFB    $34             ;;Exponent: $84, Bytes: 1
        DEFB    $20             ;;(+00,+00,+00)


; ------------------------
; THE 'TABLE OF ADDRESSES'
; ------------------------
;
; starts with binary operations which have two operands and one result.
; three pseudo binary operations first.

;; tbl-addrs
1923    DEFW    L1C2F           ; $00 Address: $1C2F - jump-true
        DEFW    L1A72           ; $01 Address: $1A72 - exchange
        DEFW    L19E3           ; $02 Address: $19E3 - delete

; true binary operations.

        DEFW    L174C           ; $03 Address: $174C - subtract
        DEFW    L17C6           ; $04 Address: $176C - multiply
        DEFW    L1882           ; $05 Address: $1882 - division
        DEFW    L1DE2           ; $06 Address: $1DE2 - to-power
        DEFW    L1AED           ; $07 Address: $1AED - or

        DEFW    L1AF3           ; $08 Address: $1B03 - no-&-no
        DEFW    L1B03           ; $09 Address: $1B03 - no-l-eql
        DEFW    L1B03           ; $0A Address: $1B03 - no-gr-eql
        DEFW    L1B03           ; $0B Address: $1B03 - nos-neql
        DEFW    L1B03           ; $0C Address: $1B03 - no-grtr
        DEFW    L1B03           ; $0D Address: $1B03 - no-less
        DEFW    L1B03           ; $0E Address: $1B03 - nos-eql
        DEFW    L1755           ; $0F Address: $1755 - addition

        DEFW    L1AF8           ; $10 Address: $1AF8 - str-&-no
        DEFW    L1B03           ; $11 Address: $1B03 - str-l-eql
        DEFW    L1B03           ; $12 Address: $1B03 - str-gr-eql
        DEFW    L1B03           ; $13 Address: $1B03 - strs-neql
        DEFW    L1B03           ; $14 Address: $1B03 - str-grtr
        DEFW    L1B03           ; $15 Address: $1B03 - str-less
        DEFW    L1B03           ; $16 Address: $1B03 - strs-eql
        DEFW    L1B62           ; $17 Address: $1B62 - strs-add

; unary follow

        DEFW    L1AA0           ; $18 Address: $1AA0 - neg

        DEFW    L1C06           ; $19 Address: $1C06 - code
        DEFW    L1BA4           ; $1A Address: $1BA4 - val
        DEFW    L1C11           ; $1B Address: $1C11 - len
        DEFW    L1D49           ; $1C Address: $1D49 - sin
        DEFW    L1D3E           ; $1D Address: $1D3E - cos
        DEFW    L1D6E           ; $1E Address: $1D6E - tan
        DEFW    L1DC4           ; $1F Address: $1DC4 - asn
        DEFW    L1DD4           ; $20 Address: $1DD4 - acs
        DEFW    L1D76           ; $21 Address: $1D76 - atn
        DEFW    L1CA9           ; $22 Address: $1CA9 - ln
        DEFW    L1C5B           ; $23 Address: $1C5B - exp
        DEFW    L1C46           ; $24 Address: $1C46 - int
        DEFW    L1DDB           ; $25 Address: $1DDB - sqr
        DEFW    L1AAF           ; $26 Address: $1AAF - sgn
        DEFW    L1AAA           ; $27 Address: $1AAA - abs
        DEFW    L1ABE           ; $28 Address: $1A1B - peek
        DEFW    L1AC5           ; $29 Address: $1AC5 - usr-no
        DEFW    L1BD5           ; $2A Address: $1BD5 - str$
        DEFW    L1B8F           ; $2B Address: $1B8F - chrs
        DEFW    L1AD5           ; $2C Address: $1AD5 - not

; end of true unary

        DEFW    L19F6           ; $2D Address: $19F6 - duplicate
        DEFW    L1C37           ; $2E Address: $1C37 - n-mod-m

        DEFW    L1C23           ; $2F Address: $1C23 - jump
        DEFW    L19FC           ; $30 Address: $19FC - stk-data

        DEFW    L1C17           ; $31 Address: $1C17 - dec-jr-nz
        DEFW    L1ADB           ; $32 Address: $1ADB - less-0
        DEFW    L1ACE           ; $33 Address: $1ACE - greater-0
        DEFW    L002B           ; $34 Address: $002B - end-calc
        DEFW    L1D18           ; $35 Address: $1D18 - get-argt
        DEFW    L18E4           ; $36 Address: $18E4 - truncate
        DEFW    L19E4           ; $37 Address: $19E4 - fp-calc-2
        DEFW    L155A           ; $38 Address: $155A - e-to-fp

; the following are just the next available slots for the 128 compound literals
; which are in range $80 - $FF.

        DEFW    L1A7F           ; $39 Address: $1A7F - series-xx    $80 - $9F.
        DEFW    L1A51           ; $3A Address: $1A51 - stk-const-xx $A0 - $BF.
        DEFW    L1A63           ; $3B Address: $1A63 - st-mem-xx    $C0 - $DF.
        DEFW    L1A45           ; $3C Address: $1A45 - get-mem-xx   $E0 - $FF.

; Aside: 3D - 7F are therefore unused calculator literals.
;        39 - 7B would be available for expansion.

; -------------------------------
; THE 'FLOATING POINT CALCULATOR'
; -------------------------------
;
;

;; CALCULATE
199D CD 85 1B     CALL    L1B85           ; routine STK-PNTRS is called to set up the
                                ; calculator stack pointers for a default
                                ; unary operation. HL = last value on stack.
                                ; DE = STKEND first location after stack.

; the calculate routine is called at this point by the series generator...

;; GEN-ENT-1
19A0 78           LD      A,B             ; fetch the Z80 B register to A
19A1 32 1E 40     LD      ($401E),A       ; and store value in system variable BREG.
                                ; this will be the counter for dec-jr-nz
                                ; or if used from fp-calc2 the calculator
                                ; instruction.

; ... and again later at this point

;; GEN-ENT-2
19A4 D9           EXX                     ; switch sets
19A5 E3           EX      (SP),HL         ; and store the address of next instruction,
                                ; the return address, in H'L'.
                                ; If this is a recursive call then the H'L'
                                ; of the previous invocation goes on stack.
                                ; c.f. end-calc.
19A6 D9           EXX                     ; switch back to main set.

; this is the re-entry looping point when handling a string of literals.

;; RE-ENTRY
19A7 ED 53 1C 40  LD      ($401C),DE      ; save end of stack in system variable STKEND
19AB D9           EXX                     ; switch to alt
19AC 7E           LD      A,(HL)          ; get next literal
19AD 23           INC     HL              ; increase pointer'

; single operation jumps back to here

;; SCAN-ENT
19AE E5           PUSH    HL              ; save pointer on stack   *
19AF A7           AND     A               ; now test the literal
19B0 F2 C2 19     JP      P,L19C2         ; forward to FIRST-3D if in range $00 - $3D
                                ; anything with bit 7 set will be one of
                                ; 128 compound literals.

; compound literals have the following format.
; bit 7 set indicates compound.
; bits 6-5 the subgroup 0-3.
; bits 4-0 the embedded parameter $00 - $1F.
; The subgroup 0-3 needs to be manipulated to form the next available four
; address places after the simple literals in the address table.

19B3 57           LD      D,A             ; save literal in D
19B4 E6 60        AND     $60             ; and with 01100000 to isolate subgroup
19B6 0F           RRCA                    ; rotate bits
19B7 0F           RRCA                    ; 4 places to right
19B8 0F           RRCA                    ; not five as we need offset * 2
19B9 0F           RRCA                    ; 00000xx0
19BA C6 72        ADD     A,$72           ; add ($39 * 2) to give correct offset.
                                ; alter above if you add more literals.
19BC 6F           LD      L,A             ; store in L for later indexing.
19BD 7A           LD      A,D             ; bring back compound literal
19BE E6 1F        AND     $1F             ; use mask to isolate parameter bits
19C0 18 0E        JR      L19D0           ; forward to ENT-TABLE

; ---

; the branch was here with simple literals.

;; FIRST-3D
19C2 FE 18        CP      $18             ; compare with first unary operations.
19C4 30 08        JR      NC,L19CE        ; to DOUBLE-A with unary operations

; it is binary so adjust pointers.

19C6 D9           EXX                     ;
19C7 01 FB FF     LD      BC,$FFFB        ; the value -5
19CA 54           LD      D,H             ; transfer HL, the last value, to DE.
19CB 5D           LD      E,L             ;
19CC 09           ADD     HL,BC           ; subtract 5 making HL point to second
                                ; value.
19CD D9           EXX                     ;

;; DOUBLE-A
19CE 07           RLCA                    ; double the literal
19CF 6F           LD      L,A             ; and store in L for indexing

;; ENT-TABLE
19D0 11 23 19     LD      DE,L1923        ; Address: tbl-addrs
19D3 26 00        LD      H,$00           ; prepare to index
19D5 19           ADD     HL,DE           ; add to get address of routine
19D6 5E           LD      E,(HL)          ; low byte to E
19D7 23           INC     HL              ;
19D8 56           LD      D,(HL)          ; high byte to D

19D9 21 A7 19     LD      HL,L19A7        ; Address: RE-ENTRY
19DC E3           EX      (SP),HL         ; goes on machine stack
                                ; address of next literal goes to HL. *


19DD D5           PUSH    DE              ; now the address of routine is stacked.
19DE D9           EXX                     ; back to main set
                                ; avoid using IY register.
19DF ED 4B 1D 40  LD      BC,($401D)      ; STKEND_hi
                                ; nothing much goes to C but BREG to B
                                ; and continue into next ret instruction
                                ; which has a dual identity


; -----------------------
; THE 'DELETE' SUBROUTINE
; -----------------------
; offset $02: 'delete'
; A simple return but when used as a calculator literal this
; deletes the last value from the calculator stack.
; On entry, as always with binary operations,
; HL=first number, DE=second number
; On exit, HL=result, DE=stkend.
; So nothing to do

;; delete
19E3 C9           RET                     ; return - indirect jump if from above.

; ---------------------------------
; THE 'SINGLE OPERATION' SUBROUTINE
; ---------------------------------
; offset $37: 'fp-calc-2'
; this single operation is used, in the first instance, to evaluate most
; of the mathematical and string functions found in BASIC expressions.

;; fp-calc-2
19E4 F1           POP     AF              ; drop return address.
19E5 3A 1E 40     LD      A,($401E)       ; load accumulator from system variable BREG
                                ; value will be literal eg. 'tan'
19E8 D9           EXX                     ; switch to alt
19E9 18 C3        JR      L19AE           ; back to SCAN-ENT
                                ; next literal will be end-calc in scanning

; ------------------------------
; THE 'TEST 5 SPACES' SUBROUTINE
; ------------------------------
; This routine is called from MOVE-FP, STK-CONST and STK-STORE to
; test that there is enough space between the calculator stack and the
; machine stack for another five-byte value. It returns with BC holding
; the value 5 ready for any subsequent LDIR.

;; TEST-5-SP
19EB D5           PUSH    DE              ; save
19EC E5           PUSH    HL              ; registers
19ED 01 05 00     LD      BC,$0005        ; an overhead of five bytes
19F0 CD C5 0E     CALL    L0EC5           ; routine TEST-ROOM tests free RAM raising
                                ; an error if not.
19F3 E1           POP     HL              ; else restore
19F4 D1           POP     DE              ; registers.
19F5 C9           RET                     ; return with BC set at 5.


; ---------------------------------------------
; THE 'MOVE A FLOATING POINT NUMBER' SUBROUTINE
; ---------------------------------------------
; offset $2D: 'duplicate'
; This simple routine is a 5-byte LDIR instruction
; that incorporates a memory check.
; When used as a calculator literal it duplicates the last value on the
; calculator stack.
; Unary so on entry HL points to last value, DE to stkend

;; duplicate
;; MOVE-FP
19F6 CD EB 19     CALL    L19EB           ; routine TEST-5-SP test free memory
                                ; and sets BC to 5.
19F9 ED B0        LDIR                    ; copy the five bytes.
19FB C9           RET                     ; return with DE addressing new STKEND
                                ; and HL addressing new last value.

; -------------------------------
; THE 'STACK LITERALS' SUBROUTINE
; -------------------------------
; offset $30: 'stk-data'
; When a calculator subroutine needs to put a value on the calculator
; stack that is not a regular constant this routine is called with a
; variable number of following data bytes that convey to the routine
; the floating point form as succinctly as is possible.

;; stk-data
19FC 62           LD      H,D             ; transfer STKEND
19FD 6B           LD      L,E             ; to HL for result.

;; STK-CONST
19FE CD EB 19     CALL    L19EB           ; routine TEST-5-SP tests that room exists
                                ; and sets BC to $05.

1A01 D9           EXX                     ; switch to alternate set
1A02 E5           PUSH    HL              ; save the pointer to next literal on stack
1A03 D9           EXX                     ; switch back to main set

1A04 E3           EX      (SP),HL         ; pointer to HL, destination to stack.

1A05 C5           PUSH    BC              ; save BC - value 5 from test room ??.

1A06 7E           LD      A,(HL)          ; fetch the byte following 'stk-data'
1A07 E6 C0        AND     $C0             ; isolate bits 7 and 6
1A09 07           RLCA                    ; rotate
1A0A 07           RLCA                    ; to bits 1 and 0  range $00 - $03.
1A0B 4F           LD      C,A             ; transfer to C
1A0C 0C           INC     C               ; and increment to give number of bytes
                                ; to read. $01 - $04
1A0D 7E           LD      A,(HL)          ; reload the first byte
1A0E E6 3F        AND     $3F             ; mask off to give possible exponent.
1A10 20 02        JR      NZ,L1A14        ; forward to FORM-EXP if it was possible to
                                ; include the exponent.

; else byte is just a byte count and exponent comes next.

1A12 23           INC     HL              ; address next byte and
1A13 7E           LD      A,(HL)          ; pick up the exponent ( - $50).

;; FORM-EXP
1A14 C6 50        ADD     A,$50           ; now add $50 to form actual exponent
1A16 12           LD      (DE),A          ; and load into first destination byte.
1A17 3E 05        LD      A,$05           ; load accumulator with $05 and
1A19 91           SUB     C               ; subtract C to give count of trailing
                                ; zeros plus one.
1A1A 23           INC     HL              ; increment source
1A1B 13           INC     DE              ; increment destination
1A1C 06 00        LD      B,$00           ; prepare to copy
1A1E ED B0        LDIR                    ; copy C bytes

1A20 C1           POP     BC              ; restore 5 counter to BC ??.

1A21 E3           EX      (SP),HL         ; put HL on stack as next literal pointer
                                ; and the stack value - result pointer -
                                ; to HL.

1A22 D9           EXX                     ; switch to alternate set.
1A23 E1           POP     HL              ; restore next literal pointer from stack
                                ; to H'L'.
1A24 D9           EXX                     ; switch back to main set.

1A25 47           LD      B,A             ; zero count to B
1A26 AF           XOR     A               ; clear accumulator

;; STK-ZEROS
1A27 05           DEC     B               ; decrement B counter
1A28 C8           RET     Z               ; return if zero.          >>
                                ; DE points to new STKEND
                                ; HL to new number.

1A29 12           LD      (DE),A          ; else load zero to destination
1A2A 13           INC     DE              ; increase destination
1A2B 18 FA        JR      L1A27           ; loop back to STK-ZEROS until done.

; -------------------------------
; THE 'SKIP CONSTANTS' SUBROUTINE
; -------------------------------
; This routine traverses variable-length entries in the table of constants,
; stacking intermediate, unwanted constants onto a dummy calculator stack,
; in the first five bytes of the ZX81 ROM.

;; SKIP-CONS
1A2D A7           AND     A               ; test if initially zero.

;; SKIP-NEXT
1A2E C8           RET     Z               ; return if zero.          >>

1A2F F5           PUSH     AF             ; save count.
1A30 D5           PUSH    DE              ; and normal STKEND

1A31 11 00 00     LD      DE,$0000        ; dummy value for STKEND at start of ROM
                                ; Note. not a fault but this has to be
                                ; moved elsewhere when running in RAM.
                                ;
1A34 CD FE 19     CALL    L19FE           ; routine STK-CONST works through variable
                                ; length records.

1A37 D1           POP     DE              ; restore real STKEND
1A38 F1           POP     AF              ; restore count
1A39 3D           DEC     A               ; decrease
1A3A 18 F2        JR      L1A2E           ; loop back to SKIP-NEXT

; --------------------------------
; THE 'MEMORY LOCATION' SUBROUTINE
; --------------------------------
; This routine, when supplied with a base address in HL and an index in A,
; will calculate the address of the A'th entry, where each entry occupies
; five bytes. It is used for addressing floating-point numbers in the
; calculator's memory area.

;; LOC-MEM
1A3C 4F           LD      C,A             ; store the original number $00-$1F.
1A3D 07           RLCA                    ; double.
1A3E 07           RLCA                    ; quadruple.
1A3F 81           ADD     A,C             ; now add original value to multiply by five.

1A40 4F           LD      C,A             ; place the result in C.
1A41 06 00        LD      B,$00           ; set B to 0.
1A43 09           ADD     HL,BC           ; add to form address of start of number in HL.

1A44 C9           RET                     ; return.

; -------------------------------------
; THE 'GET FROM MEMORY AREA' SUBROUTINE
; -------------------------------------
; offsets $E0 to $FF: 'get-mem-0', 'get-mem-1' etc.
; A holds $00-$1F offset.
; The calculator stack increases by 5 bytes.

;; get-mem-xx
1A45 D5           PUSH    DE              ; save STKEND
1A46 2A 1F 40     LD      HL,($401F)      ; MEM is base address of the memory cells.
1A49 CD 3C 1A     CALL    L1A3C           ; routine LOC-MEM so that HL = first byte
1A4C CD F6 19     CALL    L19F6           ; routine MOVE-FP moves 5 bytes with memory
                                ; check.
                                ; DE now points to new STKEND.
1A4F E1           POP     HL              ; the original STKEND is now RESULT pointer.
1A50 C9           RET                     ; return.

; ---------------------------------
; THE 'STACK A CONSTANT' SUBROUTINE
; ---------------------------------
; offset $A0: 'stk-zero'
; offset $A1: 'stk-one'
; offset $A2: 'stk-half'
; offset $A3: 'stk-pi/2'
; offset $A4: 'stk-ten'
; This routine allows a one-byte instruction to stack up to 32 constants
; held in short form in a table of constants. In fact only 5 constants are
; required. On entry the A register holds the literal ANDed with $1F.
; It isn't very efficient and it would have been better to hold the
; numbers in full, five byte form and stack them in a similar manner
; to that which would be used later for semi-tone table values.

;; stk-const-xx
1A51 62           LD      H,D             ; save STKEND - required for result
1A52 6B           LD      L,E             ;
1A53 D9           EXX                     ; swap
1A54 E5           PUSH    HL              ; save pointer to next literal
1A55 21 15 19     LD      HL,L1915        ; Address: stk-zero - start of table of
                                ; constants
1A58 D9           EXX                     ;
1A59 CD 2D 1A     CALL    L1A2D           ; routine SKIP-CONS
1A5C CD FE 19     CALL    L19FE           ; routine STK-CONST
1A5F D9           EXX                     ;
1A60 E1           POP     HL              ; restore pointer to next literal.
1A61 D9           EXX                     ;
1A62 C9           RET                     ; return.

; ---------------------------------------
; THE 'STORE IN A MEMORY AREA' SUBROUTINE
; ---------------------------------------
; Offsets $C0 to $DF: 'st-mem-0', 'st-mem-1' etc.
; Although 32 memory storage locations can be addressed, only six
; $C0 to $C5 are required by the ROM and only the thirty bytes (6*5)
; required for these are allocated. ZX81 programmers who wish to
; use the floating point routines from assembly language may wish to
; alter the system variable MEM to point to 160 bytes of RAM to have
; use the full range available.
; A holds derived offset $00-$1F.
; Unary so on entry HL points to last value, DE to STKEND.

;; st-mem-xx
1A63 E5           PUSH    HL              ; save the result pointer.
1A64 EB           EX      DE,HL           ; transfer to DE.
1A65 2A 1F 40     LD      HL,($401F)      ; fetch MEM the base of memory area.
1A68 CD 3C 1A     CALL    L1A3C           ; routine LOC-MEM sets HL to the destination.
1A6B EB           EX      DE,HL           ; swap - HL is start, DE is destination.
1A6C CD F6 19     CALL    L19F6           ; routine MOVE-FP.
                                ; note. a short ld bc,5; ldir
                                ; the embedded memory check is not required
                                ; so these instructions would be faster!
1A6F EB           EX      DE,HL           ; DE = STKEND
1A70 E1           POP     HL              ; restore original result pointer
1A71 C9           RET                     ; return.

; -------------------------
; THE 'EXCHANGE' SUBROUTINE
; -------------------------
; offset $01: 'exchange'
; This routine exchanges the last two values on the calculator stack
; On entry, as always with binary operations,
; HL=first number, DE=second number
; On exit, HL=result, DE=stkend.

;; exchange
1A72 06 05        LD      B,$05           ; there are five bytes to be swapped

; start of loop.

;; SWAP-BYTE
1A74 1A           LD      A,(DE)          ; each byte of second
1A75 4E           LD      C,(HL)          ; each byte of first
1A76 EB           EX      DE,HL           ; swap pointers
1A77 12           LD      (DE),A          ; store each byte of first
1A78 71           LD      (HL),C          ; store each byte of second
1A79 23           INC     HL              ; advance both
1A7A 13           INC     DE              ; pointers.
1A7B 10 F7        DJNZ    L1A74           ; loop back to SWAP-BYTE until all 5 done.

1A7D EB           EX      DE,HL           ; even up the exchanges
                                ; so that DE addresses STKEND.
1A7E C9           RET                     ; return.

; ---------------------------------
; THE 'SERIES GENERATOR' SUBROUTINE
; ---------------------------------
; offset $86: 'series-06'
; offset $88: 'series-08'
; offset $8C: 'series-0C'
; The ZX81 uses Chebyshev polynomials to generate approximations for
; SIN, ATN, LN and EXP. These are named after the Russian mathematician
; Pafnuty Chebyshev, born in 1821, who did much pioneering work on numerical
; series. As far as calculators are concerned, Chebyshev polynomials have an
; advantage over other series, for example the Taylor series, as they can
; reach an approximation in just six iterations for SIN, eight for EXP and
; twelve for LN and ATN. The mechanics of the routine are interesting but
; for full treatment of how these are generated with demonstrations in
; Sinclair BASIC see "The Complete Spectrum ROM Disassembly" by Dr Ian Logan
; and Dr Frank O'Hara, published 1983 by Melbourne House.

;; series-xx
1A7F 47           LD      B,A             ; parameter $00 - $1F to B counter
1A80 CD A0 19     CALL    L19A0           ; routine GEN-ENT-1 is called.
                                ; A recursive call to a special entry point
                                ; in the calculator that puts the B register
                                ; in the system variable BREG. The return
                                ; address is the next location and where
                                ; the calculator will expect its first
                                ; instruction - now pointed to by HL'.
                                ; The previous pointer to the series of
                                ; five-byte numbers goes on the machine stack.

; The initialization phase.

        DEFB    $2D             ;;duplicate       x,x
        DEFB    $0F             ;;addition        x+x
        DEFB    $C0             ;;st-mem-0        x+x
        DEFB    $02             ;;delete          .
        DEFB    $A0             ;;stk-zero        0
        DEFB    $C2             ;;st-mem-2        0

; a loop is now entered to perform the algebraic calculation for each of
; the numbers in the series

;; G-LOOP
1A89    DEFB    $2D             ;;duplicate       v,v.
        DEFB    $E0             ;;get-mem-0       v,v,x+2
        DEFB    $04             ;;multiply        v,v*x+2
        DEFB    $E2             ;;get-mem-2       v,v*x+2,v
        DEFB    $C1             ;;st-mem-1
        DEFB    $03             ;;subtract
        DEFB    $34             ;;end-calc

; the previous pointer is fetched from the machine stack to H'L' where it
; addresses one of the numbers of the series following the series literal.

1A90 CD FC 19     CALL    L19FC           ; routine STK-DATA is called directly to
                                ; push a value and advance H'L'.
1A93 CD A4 19     CALL    L19A4           ; routine GEN-ENT-2 recursively re-enters
                                ; the calculator without disturbing
                                ; system variable BREG
                                ; H'L' value goes on the machine stack and is
                                ; then loaded as usual with the next address.

        DEFB    $0F             ;;addition
        DEFB    $01             ;;exchange
        DEFB    $C2             ;;st-mem-2
        DEFB    $02             ;;delete

        DEFB    $31             ;;dec-jr-nz
        DEFB    $EE             ;;back to L1A89, G-LOOP

; when the counted loop is complete the final subtraction yields the result
; for example SIN X.

        DEFB    $E1             ;;get-mem-1
        DEFB    $03             ;;subtract
        DEFB    $34             ;;end-calc

1A9F C9           RET                     ; return with H'L' pointing to location
                                ; after last number in series.

; -----------------------
; Handle unary minus (18)
; -----------------------
; Unary so on entry HL points to last value, DE to STKEND.

;; NEGATE
;; negate
1AA0 7E           LD A,  (HL)             ; fetch exponent of last value on the
                                ; calculator stack.
1AA1 A7           AND     A               ; test it.
1AA2 C8           RET     Z               ; return if zero.

1AA3 23           INC     HL              ; address the byte with the sign bit.
1AA4 7E           LD      A,(HL)          ; fetch to accumulator.
1AA5 EE 80        XOR     $80             ; toggle the sign bit.
1AA7 77           LD      (HL),A          ; put it back.
1AA8 2B           DEC     HL              ; point to last value again.
1AA9 C9           RET                     ; return.

; -----------------------
; Absolute magnitude (27)
; -----------------------
; This calculator literal finds the absolute value of the last value,
; floating point, on calculator stack.

;; abs
1AAA 23           INC     HL              ; point to byte with sign bit.
1AAB CB BE        RES     7,(HL)          ; make the sign positive.
1AAD 2B           DEC     HL              ; point to last value again.
1AAE C9           RET                     ; return.

; -----------
; Signum (26)
; -----------
; This routine replaces the last value on the calculator stack,
; which is in floating point form, with one if positive and with -minus one
; if negative. If it is zero then it is left as such.

;; sgn
1AAF 23           INC     HL              ; point to first byte of 4-byte mantissa.
1AB0 7E           LD      A,(HL)          ; pick up the byte with the sign bit.
1AB1 2B           DEC     HL              ; point to exponent.
1AB2 35           DEC     (HL)            ; test the exponent for
1AB3 34           INC     (HL)            ; the value zero.

1AB4 37           SCF                     ; set the carry flag.
1AB5 C4 E0 1A     CALL    NZ,L1AE0        ; routine FP-0/1  replaces last value with one
                                ; if exponent indicates the value is non-zero.
                                ; in either case mantissa is now four zeros.

1AB8 23           INC HL                  ; point to first byte of 4-byte mantissa.
1AB9 07           RLCA                    ; rotate original sign bit to carry.
1ABA CB 1E        RR      (HL)            ; rotate the carry into sign.
1ABC 2B           DEC HL                  ; point to last value.
1ABD C9           RET                     ; return.


; -------------------------
; Handle PEEK function (28)
; -------------------------
; This function returns the contents of a memory address.
; The entire address space can be peeked including the ROM.

;; peek
1ABE CD A7 0E     CALL    L0EA7           ; routine FIND-INT puts address in BC.
1AC1 0A           LD      A,(BC)          ; load contents into A register.

;; IN-PK-STK
1AC2 C3 1D 15     JP      L151D           ; exit via STACK-A to put value on the
                                ; calculator stack.

; ---------------
; USR number (29)
; ---------------
; The USR function followed by a number 0-65535 is the method by which
; the ZX81 invokes machine code programs. This function returns the
; contents of the BC register pair.
; Note. that STACK-BC re-initializes the IY register to $4000 if a user-written
; program has altered it.

;; usr-no
1AC5 CD A7 0E     CALL    L0EA7           ; routine FIND-INT to fetch the
                                ; supplied address into BC.

1AC8 21 20 15     LD      HL,L1520        ; address: STACK-BC is
1ACB E5           PUSH    HL              ; pushed onto the machine stack.
1ACC C5           PUSH    BC              ; then the address of the machine code
                                ; routine.

1ACD C9           RET                     ; make an indirect jump to the routine
                                ; and, hopefully, to STACK-BC also.


; -----------------------
; Greater than zero ($33)
; -----------------------
; Test if the last value on the calculator stack is greater than zero.
; This routine is also called directly from the end-tests of the comparison
; routine.

;; GREATER-0
;; greater-0
1ACE 7E           LD      A,(HL)          ; fetch exponent.
1ACF A7           AND     A               ; test it for zero.
1AD0 C8           RET     Z               ; return if so.


1AD1 3E FF        LD      A,$FF           ; prepare XOR mask for sign bit
1AD3 18 07        JR      L1ADC           ; forward to SIGN-TO-C
                                ; to put sign in carry
                                ; (carry will become set if sign is positive)
                                ; and then overwrite location with 1 or 0
                                ; as appropriate.

; ------------------------
; Handle NOT operator ($2C)
; ------------------------
; This overwrites the last value with 1 if it was zero else with zero
; if it was any other value.
;
; e.g. NOT 0 returns 1, NOT 1 returns 0, NOT -3 returns 0.
;
; The subroutine is also called directly from the end-tests of the comparison
; operator.

;; NOT
;; not
1AD5 7E           LD      A,(HL)          ; get exponent byte.
1AD6 ED 44        NEG                     ; negate - sets carry if non-zero.
1AD8 3F           CCF                     ; complement so carry set if zero, else reset.
1AD9 18 05        JR      L1AE0           ; forward to FP-0/1.

; -------------------
; Less than zero (32)
; -------------------
; Destructively test if last value on calculator stack is less than zero.
; Bit 7 of second byte will be set if so.

;; less-0
1ADB AF           XOR     A               ; set xor mask to zero
                                ; (carry will become set if sign is negative).

; transfer sign of mantissa to Carry Flag.

;; SIGN-TO-C
1ADC 23           INC     HL              ; address 2nd byte.
1ADD AE           XOR     (HL)            ; bit 7 of HL will be set if number is negative.
1ADE 2B           DEC     HL              ; address 1st byte again.
1ADF 07           RLCA                    ; rotate bit 7 of A to carry.

; -----------
; Zero or one
; -----------
; This routine places an integer value zero or one at the addressed location
; of calculator stack or MEM area. The value one is written if carry is set on
; entry else zero.

;; FP-0/1
1AE0 E5           PUSH    HL              ; save pointer to the first byte
1AE1 06 05        LD      B,$05           ; five bytes to do.

;; FP-loop
1AE3 36 00        LD      (HL),$00        ; insert a zero.
1AE5 23           INC     HL              ;
1AE6 10 FB        DJNZ    L1AE3           ; repeat.

1AE8 E1           POP     HL              ;
1AE9 D0           RET     NC              ;

1AEA 36 81        LD      (HL),$81        ; make value 1
1AEC C9           RET                     ; return.


; -----------------------
; Handle OR operator (07)
; -----------------------
; The Boolean OR operator. eg. X OR Y
; The result is zero if both values are zero else a non-zero value.
;
; e.g.    0 OR 0  returns 0.
;        -3 OR 0  returns -3.
;         0 OR -3 returns 1.
;        -3 OR 2  returns 1.
;
; A binary operation.
; On entry HL points to first operand (X) and DE to second operand (Y).

;; or
1AED 1A           LD      A,(DE)          ; fetch exponent of second number
1AEE A7           AND     A               ; test it.
1AEF C8           RET     Z               ; return if zero.

1AF0 37           SCF                     ; set carry flag
1AF1 18 ED        JR      L1AE0           ; back to FP-0/1 to overwrite the first operand
                                ; with the value 1.


; -----------------------------
; Handle number AND number (08)
; -----------------------------
; The Boolean AND operator.
;
; e.g.    -3 AND 2  returns -3.
;         -3 AND 0  returns 0.
;          0 and -2 returns 0.
;          0 and 0  returns 0.
;
; Compare with OR routine above.

;; no-&-no
1AF3 1A           LD      A,(DE)          ; fetch exponent of second number.
1AF4 A7           AND     A               ; test it.
1AF5 C0           RET     NZ              ; return if not zero.

1AF6 18 E8        JR      L1AE0           ; back to FP-0/1 to overwrite the first operand
                                ; with zero for return value.

; -----------------------------
; Handle string AND number (10)
; -----------------------------
; e.g. "YOU WIN" AND SCORE>99 will return the string if condition is true
; or the null string if false.

;; str-&-no
1AF8 1A           LD      A,(DE)          ; fetch exponent of second number.
1AF9 A7           AND     A               ; test it.
1AFA C0           RET     NZ              ; return if number was not zero - the string
                                ; is the result.

; if the number was zero (false) then the null string must be returned by
; altering the length of the string on the calculator stack to zero.

1AFB D5           PUSH    DE              ; save pointer to the now obsolete number
                                ; (which will become the new STKEND)

1AFC 1B           DEC     DE              ; point to the 5th byte of string descriptor.
1AFD AF           XOR     A               ; clear the accumulator.
1AFE 12           LD      (DE),A          ; place zero in high byte of length.
1AFF 1B           DEC     DE              ; address low byte of length.
1B00 12           LD      (DE),A          ; place zero there - now the null string.

1B01 D1           POP     DE              ; restore pointer - new STKEND.
1B02 C9           RET                     ; return.

; -----------------------------------
; Perform comparison ($09-$0E, $11-$16)
; -----------------------------------
; True binary operations.
;
; A single entry point is used to evaluate six numeric and six string
; comparisons. On entry, the calculator literal is in the B register and
; the two numeric values, or the two string parameters, are on the
; calculator stack.
; The individual bits of the literal are manipulated to group similar
; operations although the SUB 8 instruction does nothing useful and merely
; alters the string test bit.
; Numbers are compared by subtracting one from the other, strings are
; compared by comparing every character until a mismatch, or the end of one
; or both, is reached.
;
; Numeric Comparisons.
; --------------------
; The 'x>y' example is the easiest as it employs straight-thru logic.
; Number y is subtracted from x and the result tested for greater-0 yielding
; a final value 1 (true) or 0 (false).
; For 'x<y' the same logic is used but the two values are first swapped on the
; calculator stack.
; For 'x=y' NOT is applied to the subtraction result yielding true if the
; difference was zero and false with anything else.
; The first three numeric comparisons are just the opposite of the last three
; so the same processing steps are used and then a final NOT is applied.
;
; literal    Test   No  sub 8       ExOrNot  1st RRCA  exch sub  ?   End-Tests
; =========  ====   == ======== === ======== ========  ==== ===  =  === === ===
; no-l-eql   x<=y   09 00000001 dec 00000000 00000000  ---- x-y  ?  --- >0? NOT
; no-gr-eql  x>=y   0A 00000010 dec 00000001 10000000c swap y-x  ?  --- >0? NOT
; nos-neql   x<>y   0B 00000011 dec 00000010 00000001  ---- x-y  ?  NOT --- NOT
; no-grtr    x>y    0C 00000100  -  00000100 00000010  ---- x-y  ?  --- >0? ---
; no-less    x<y    0D 00000101  -  00000101 10000010c swap y-x  ?  --- >0? ---
; nos-eql    x=y    0E 00000110  -  00000110 00000011  ---- x-y  ?  NOT --- ---
;
;                                                           comp -> C/F
;                                                           ====    ===
; str-l-eql  x$<=y$ 11 00001001 dec 00001000 00000100  ---- x$y$ 0  !or >0? NOT
; str-gr-eql x$>=y$ 12 00001010 dec 00001001 10000100c swap y$x$ 0  !or >0? NOT
; strs-neql  x$<>y$ 13 00001011 dec 00001010 00000101  ---- x$y$ 0  !or >0? NOT
; str-grtr   x$>y$  14 00001100  -  00001100 00000110  ---- x$y$ 0  !or >0? ---
; str-less   x$<y$  15 00001101  -  00001101 10000110c swap y$x$ 0  !or >0? ---
; strs-eql   x$=y$  16 00001110  -  00001110 00000111  ---- x$y$ 0  !or >0? ---
;
; String comparisons are a little different in that the eql/neql carry flag
; from the 2nd RRCA is, as before, fed into the first of the end tests but
; along the way it gets modified by the comparison process. The result on the
; stack always starts off as zero and the carry fed in determines if NOT is
; applied to it. So the only time the greater-0 test is applied is if the
; stack holds zero which is not very efficient as the test will always yield
; zero. The most likely explanation is that there were once separate end tests
; for numbers and strings.

;; no-l-eql,etc.
1B03 78           LD      A,B             ; transfer literal to accumulator.
1B04 D6 08        SUB     $08             ; subtract eight - which is not useful.

1B06 CB 57        BIT     2,A             ; isolate '>', '<', '='.

1B08 20 01        JR      NZ,L1B0B        ; skip to EX-OR-NOT with these.

1B0A 3D           DEC     A               ; else make $00-$02, $08-$0A to match bits 0-2.

;; EX-OR-NOT
1B0B 0F           RRCA                    ; the first RRCA sets carry for a swap.
1B0C 30 08        JR      NC,L1B16        ; forward to NU-OR-STR with other 8 cases

; for the other 4 cases the two values on the calculator stack are exchanged.

1B0E F5           PUSH    AF              ; save A and carry.
1B0F E5           PUSH    HL              ; save HL - pointer to first operand.
                                ; (DE points to second operand).

1B10 CD 72 1A     CALL    L1A72           ; routine exchange swaps the two values.
                                ; (HL = second operand, DE = STKEND)

1B13 D1           POP     DE              ; DE = first operand
1B14 EB           EX      DE,HL           ; as we were.
1B15 F1           POP     AF              ; restore A and carry.

; Note. it would be better if the 2nd RRCA preceded the string test.
; It would save two duplicate bytes and if we also got rid of that sub 8
; at the beginning we wouldn't have to alter which bit we test.

;; NU-OR-STR
1B16 CB 57        BIT     2,A             ; test if a string comparison.
1B18 20 07        JR      NZ,L1B21        ; forward to STRINGS if so.

; continue with numeric comparisons.

1B1A 0F           RRCA                    ; 2nd RRCA causes eql/neql to set carry.
1B1B F5           PUSH    AF              ; save A and carry

1B1C CD 4C 17     CALL    L174C           ; routine subtract leaves result on stack.
1B1F 18 33        JR      L1B54           ; forward to END-TESTS

; ---

;; STRINGS
1B21 0F           RRCA                    ; 2nd RRCA causes eql/neql to set carry.
1B22 F5           PUSH    AF              ; save A and carry.

1B23 CD F8 13     CALL    L13F8           ; routine STK-FETCH gets 2nd string params
1B26 D5           PUSH    DE              ; save start2 *.
1B27 C5           PUSH    BC              ; and the length.

1B28 CD F8 13     CALL    L13F8           ; routine STK-FETCH gets 1st string
                                ; parameters - start in DE, length in BC.
1B2B E1           POP     HL              ; restore length of second to HL.

; A loop is now entered to compare, by subtraction, each corresponding character
; of the strings. For each successful match, the pointers are incremented and
; the lengths decreased and the branch taken back to here. If both string
; remainders become null at the same time, then an exact match exists.

;; BYTE-COMP
1B2C 7C           LD      A,H             ; test if the second string
1B2D B5           OR      L               ; is the null string and hold flags.

1B2E E3           EX      (SP),HL         ; put length2 on stack, bring start2 to HL *.
1B2F 78           LD      A,B             ; hi byte of length1 to A

1B30 20 0B        JR      NZ,L1B3D        ; forward to SEC-PLUS if second not null.

1B32 B1           OR      C               ; test length of first string.

;; SECND-LOW
1B33 C1           POP     BC              ; pop the second length off stack.
1B34 28 04        JR      Z,L1B3A         ; forward to BOTH-NULL if first string is also
                                ; of zero length.

; the true condition - first is longer than second (SECND-LESS)

1B36 F1           POP     AF              ; restore carry (set if eql/neql)
1B37 3F           CCF                     ; complement carry flag.
                                ; Note. equality becomes false.
                                ; Inequality is true. By swapping or applying
                                ; a terminal 'not', all comparisons have been
                                ; manipulated so that this is success path.
1B38 18 16        JR      L1B50           ; forward to leave via STR-TEST

; ---
; the branch was here with a match

;; BOTH-NULL
1B3A F1           POP     AF              ; restore carry - set for eql/neql
1B3B 18 13        JR      L1B50           ; forward to STR-TEST

; ---
; the branch was here when 2nd string not null and low byte of first is yet
; to be tested.


;; SEC-PLUS
1B3D B1           OR      C               ; test the length of first string.
1B3E 28 0D        JR      Z,L1B4D         ; forward to FRST-LESS if length is zero.

; both strings have at least one character left.

1B40 1A           LD      A,(DE)          ; fetch character of first string.
1B41 96           SUB     (HL)            ; subtract with that of 2nd string.
1B42 38 09        JR      C,L1B4D         ; forward to FRST-LESS if carry set

1B44 20 ED        JR      NZ,L1B33        ; back to SECND-LOW and then STR-TEST
                                ; if not exact match.

1B46 0B           DEC     BC              ; decrease length of 1st string.
1B47 13           INC     DE              ; increment 1st string pointer.

1B48 23           INC     HL              ; increment 2nd string pointer.
1B49 E3           EX      (SP),HL         ; swap with length on stack
1B4A 2B           DEC     HL              ; decrement 2nd string length
1B4B 18 DF        JR      L1B2C           ; back to BYTE-COMP

; ---
;   the false condition.

;; FRST-LESS
1B4D C1           POP     BC              ; discard length
1B4E F1           POP     AF              ; pop A
1B4F A7           AND     A               ; clear the carry for false result.

; ---
;   exact match and x$>y$ rejoin here

;; STR-TEST
1B50 F5           PUSH    AF              ; save A and carry

1B51 EF           RST     28H             ;; FP-CALC
        DEFB    $A0             ;;stk-zero      an initial false value.
        DEFB    $34             ;;end-calc

;   both numeric and string paths converge here.

;; END-TESTS
1B54 F1           POP     AF              ; pop carry  - will be set if eql/neql
1B55 F5           PUSH    AF              ; save it again.

1B56 DC D5 1A     CALL    C,L1AD5         ; routine NOT sets true(1) if equal(0)
                                ; or, for strings, applies true result.
1B59 CD CE 1A     CALL    L1ACE           ; greater-0  ??????????


1B5C F1           POP     AF              ; pop A
1B5D 0F           RRCA                    ; the third RRCA - test for '<=', '>=' or '<>'.
1B5E D4 D5 1A     CALL    NC,L1AD5        ; apply a terminal NOT if so.
1B61 C9           RET                     ; return.

; -------------------------
; String concatenation ($17)
; -------------------------
;   This literal combines two strings into one e.g. LET A$ = B$ + C$
;   The two parameters of the two strings to be combined are on the stack.

;; strs-add
1B62 CD F8 13     CALL    L13F8           ; routine STK-FETCH fetches string parameters
                                ; and deletes calculator stack entry.
1B65 D5           PUSH    DE              ; save start address.
1B66 C5           PUSH    BC              ; and length.

1B67 CD F8 13     CALL    L13F8           ; routine STK-FETCH for first string
1B6A E1           POP     HL              ; re-fetch first length
1B6B E5           PUSH    HL              ; and save again
1B6C D5           PUSH    DE              ; save start of second string
1B6D C5           PUSH    BC              ; and its length.

1B6E 09           ADD     HL,BC           ; add the two lengths.
1B6F 44           LD      B,H             ; transfer to BC
1B70 4D           LD      C,L             ; and create
1B71 F7           RST     30H             ; BC-SPACES in workspace.
                                ; DE points to start of space.

1B72 CD C3 12     CALL    L12C3           ; routine STK-STO-$ stores parameters
                                ; of new string updating STKEND.

1B75 C1           POP     BC              ; length of first
1B76 E1           POP     HL              ; address of start
1B77 78           LD      A,B             ; test for
1B78 B1           OR      C               ; zero length.
1B79 28 02        JR      Z,L1B7D         ; to OTHER-STR if null string

1B7B ED B0        LDIR                    ; copy string to workspace.

;; OTHER-STR
1B7D C1           POP     BC              ; now second length
1B7E E1           POP     HL              ; and start of string
1B7F 78           LD      A,B             ; test this one
1B80 B1           OR      C               ; for zero length
1B81 28 02        JR      Z,L1B85         ; skip forward to STK-PNTRS if so as complete.

1B83 ED B0        LDIR                    ; else copy the bytes.
                                ; and continue into next routine which
                                ; sets the calculator stack pointers.

; --------------------
; Check stack pointers
; --------------------
;   Register DE is set to STKEND and HL, the result pointer, is set to five
;   locations below this.
;   This routine is used when it is inconvenient to save these values at the
;   time the calculator stack is manipulated due to other activity on the
;   machine stack.
;   This routine is also used to terminate the VAL routine for
;   the same reason and to initialize the calculator stack at the start of
;   the CALCULATE routine.

;; STK-PNTRS
1B85 2A 1C 40     LD      HL,($401C)      ; fetch STKEND value from system variable.
1B88 11 FB FF     LD      DE,$FFFB        ; the value -5
1B8B E5           PUSH    HL              ; push STKEND value.

1B8C 19           ADD     HL,DE           ; subtract 5 from HL.

1B8D D1           POP     DE              ; pop STKEND to DE.
1B8E C9           RET                     ; return.

; ----------------
; Handle CHR$ (2B)
; ----------------
;   This function returns a single character string that is a result of
;   converting a number in the range 0-255 to a string e.g. CHR$ 38 = "A".
;   Note. the ZX81 does not have an ASCII character set.

;; chrs
1B8F CD CD 15     CALL    L15CD           ; routine FP-TO-A puts the number in A.

1B92 38 0E        JR      C,L1BA2         ; forward to REPORT-Bd if overflow
1B94 20 0C        JR      NZ,L1BA2        ; forward to REPORT-Bd if negative

1B96 F5           PUSH    AF              ; save the argument.

1B97 01 01 00     LD      BC,$0001        ; one space required.
1B9A F7           RST     30H             ; BC-SPACES makes DE point to start

1B9B F1           POP     AF              ; restore the number.

1B9C 12           LD      (DE),A          ; and store in workspace

1B9D CD C3 12     CALL    L12C3           ; routine STK-STO-$ stacks descriptor.

1BA0 EB           EX      DE,HL           ; make HL point to result and DE to STKEND.
1BA1 C9           RET                     ; return.

; ---

;; REPORT-Bd
1BA2 CF           RST     08H             ; ERROR-1
        DEFB    $0A             ; Error Report: Integer out of range

; ----------------------------
; Handle VAL ($1A)
; ----------------------------
;   VAL treats the characters in a string as a numeric expression.
;       e.g. VAL "2.3" = 2.3, VAL "2+4" = 6, VAL ("2" + "4") = 24.

;; val
1BA4 2A 16 40     LD      HL,($4016)      ; fetch value of system variable CH_ADD
1BA7 E5           PUSH    HL              ; and save on the machine stack.

1BA8 CD F8 13     CALL    L13F8           ; routine STK-FETCH fetches the string operand
                                ; from calculator stack.

1BAB D5           PUSH    DE              ; save the address of the start of the string.
1BAC 03           INC     BC              ; increment the length for a carriage return.

1BAD F7           RST     30H             ; BC-SPACES creates the space in workspace.
1BAE E1           POP     HL              ; restore start of string to HL.
1BAF ED 53 16 40  LD      ($4016),DE      ; load CH_ADD with start DE in workspace.

1BB3 D5           PUSH    DE              ; save the start in workspace
1BB4 ED B0        LDIR                    ; copy string from program or variables or
                                ; workspace to the workspace area.
1BB6 EB           EX      DE,HL           ; end of string + 1 to HL
1BB7 2B           DEC     HL              ; decrement HL to point to end of new area.
1BB8 36 76        LD      (HL),$76        ; insert a carriage return at end.
                                ; ZX81 has a non-ASCII character set
1BBA FD CB 01 BE  RES     7,(IY+$01)      ; update FLAGS  - signal checking syntax.
1BBE CD 92 0D     CALL    L0D92           ; routine CLASS-06 - SCANNING evaluates string
                                ; expression and checks for integer result.

1BC1 CD 22 0D     CALL    L0D22           ; routine CHECK-2 checks for carriage return.


1BC4 E1           POP     HL              ; restore start of string in workspace.

1BC5 22 16 40     LD      ($4016),HL      ; set CH_ADD to the start of the string again.
1BC8 FD CB 01 FE  SET     7,(IY+$01)      ; update FLAGS  - signal running program.
1BCC CD 55 0F     CALL    L0F55           ; routine SCANNING evaluates the string
                                ; in full leaving result on calculator stack.

1BCF E1           POP     HL              ; restore saved character address in program.
1BD0 22 16 40     LD      ($4016),HL      ; and reset the system variable CH_ADD.

1BD3 18 B0        JR      L1B85           ; back to exit via STK-PNTRS.
                                ; resetting the calculator stack pointers
                                ; HL and DE from STKEND as it wasn't possible
                                ; to preserve them during this routine.

; ----------------
; Handle STR$ (2A)
; ----------------
;   This function returns a string representation of a numeric argument.
;   The method used is to trick the PRINT-FP routine into thinking it
;   is writing to a collapsed display file when in fact it is writing to
;   string workspace.
;   If there is already a newline at the intended print position and the
;   column count has not been reduced to zero then the print routine
;   assumes that there is only 1K of RAM and the screen memory, like the rest
;   of dynamic memory, expands as necessary using calls to the ONE-SPACE
;   routine. The screen is character-mapped not bit-mapped.

;; str$
1BD5 01 01 00     LD      BC,$0001        ; create an initial byte in workspace
1BD8 F7           RST     30H             ; using BC-SPACES restart.

1BD9 36 76        LD      (HL),$76        ; place a carriage return there.

1BDB 2A 39 40     LD      HL,($4039)      ; fetch value of S_POSN column/line
1BDE E5           PUSH    HL              ; and preserve on stack.

1BDF 2E FF        LD      L,$FF           ; make column value high to create a
                                ; contrived buffer of length 254.
1BE1 22 39 40     LD      ($4039),HL      ; and store in system variable S_POSN.

1BE4 2A 0E 40     LD      HL,($400E)      ; fetch value of DF_CC
1BE7 E5           PUSH    HL              ; and preserve on stack also.

1BE8 ED 53 0E 40  LD      ($400E),DE      ; now set DF_CC which normally addresses
                                ; somewhere in the display file to the start
                                ; of workspace.
1BEC D5           PUSH    DE              ; save the start of new string.

1BED CD DB 15     CALL    L15DB           ; routine PRINT-FP.

1BF0 D1           POP     DE              ; retrieve start of string.

1BF1 2A 0E 40     LD      HL,($400E)      ; fetch end of string from DF_CC.
1BF4 A7           AND     A               ; prepare for true subtraction.
1BF5 ED 52        SBC     HL,DE           ; subtract to give length.

1BF7 44           LD      B,H             ; and transfer to the BC
1BF8 4D           LD      C,L             ; register.

1BF9 E1           POP     HL              ; restore original
1BFA 22 0E 40     LD      ($400E),HL      ; DF_CC value

1BFD E1           POP     HL              ; restore original
1BFE 22 39 40     LD      ($4039),HL      ; S_POSN values.

1C01 CD C3 12     CALL    L12C3           ; routine STK-STO-$ stores the string
                                ; descriptor on the calculator stack.

1C04 EB           EX      DE,HL           ; HL = last value, DE = STKEND.
1C05 C9           RET                     ; return.


; -------------------
; THE 'CODE' FUNCTION
; -------------------
; (offset $19: 'code')
;   Returns the code of a character or first character of a string
;   e.g. CODE "AARDVARK" = 38  (not 65 as the ZX81 does not have an ASCII
;   character set).


;; code
1C06 CD F8 13     CALL    L13F8           ; routine STK-FETCH to fetch and delete the
                                ; string parameters.
                                ; DE points to the start, BC holds the length.
1C09 78           LD      A,B             ; test length
1C0A B1           OR      C               ; of the string.
1C0B 28 01        JR      Z,L1C0E         ; skip to STK-CODE with zero if the null string.

1C0D 1A           LD      A,(DE)          ; else fetch the first character.

;; STK-CODE
1C0E C3 1D 15     JP      L151D           ; jump back to STACK-A (with memory check)

; --------------------
; THE 'LEN' SUBROUTINE
; --------------------
; (offset $1b: 'len')
;   Returns the length of a string.
;   In Sinclair BASIC strings can be more than twenty thousand characters long
;   so a sixteen-bit register is required to store the length

;; len
1C11 CD F8 13     CALL    L13F8           ; routine STK-FETCH to fetch and delete the
                                ; string parameters from the calculator stack.
                                ; register BC now holds the length of string.

1C14 C3 20 15     JP      L1520           ; jump back to STACK-BC to save result on the
                                ; calculator stack (with memory check).

; -------------------------------------
; THE 'DECREASE THE COUNTER' SUBROUTINE
; -------------------------------------
; (offset $31: 'dec-jr-nz')
;   The calculator has an instruction that decrements a single-byte
;   pseudo-register and makes consequential relative jumps just like
;   the Z80's DJNZ instruction.

;; dec-jr-nz
1C17 D9           EXX                     ; switch in set that addresses code

1C18 E5           PUSH    HL              ; save pointer to offset byte
1C19 21 1E 40     LD      HL,$401E        ; address BREG in system variables
1C1C 35           DEC     (HL)            ; decrement it
1C1D E1           POP     HL              ; restore pointer

1C1E 20 04        JR      NZ,L1C24        ; to JUMP-2 if not zero

1C20 23           INC     HL              ; step past the jump length.
1C21 D9           EXX                     ; switch in the main set.
1C22 C9           RET                     ; return.

;   Note. as a general rule the calculator avoids using the IY register
;   otherwise the cumbersome 4 instructions in the middle could be replaced by
;   dec (iy+$xx) - using three instruction bytes instead of six.


; ---------------------
; THE 'JUMP' SUBROUTINE
; ---------------------
; (Offset $2F; 'jump')
;   This enables the calculator to perform relative jumps just like
;   the Z80 chip's JR instruction.
;   This is one of the few routines to be polished for the ZX Spectrum.
;   See, without looking at the ZX Spectrum ROM, if you can get rid of the
;   relative jump.

;; jump
;; JUMP
1C23    EXX                     ;switch in pointer set

;; JUMP-2
1C24 5E           LD      E,(HL)          ; the jump byte 0-127 forward, 128-255 back.
1C25 AF           XOR     A               ; clear accumulator.
1C26 CB 7B        BIT     7,E             ; test if negative jump
1C28 28 01        JR      Z,L1C2B         ; skip, if positive, to JUMP-3.

1C2A 2F           CPL                     ; else change to $FF.

;; JUMP-3
1C2B 57           LD      D,A             ; transfer to high byte.
1C2C 19           ADD     HL,DE           ; advance calculator pointer forward or back.

1C2D D9           EXX                     ; switch out pointer set.
1C2E C9           RET                     ; return.

; -----------------------------
; THE 'JUMP ON TRUE' SUBROUTINE
; -----------------------------
; (Offset $00; 'jump-true')
;   This enables the calculator to perform conditional relative jumps
;   dependent on whether the last test gave a true result
;   On the ZX81, the exponent will be zero for zero or else $81 for one.

;; jump-true
1C2F 1A           LD      A,(DE)          ; collect exponent byte

1C30 A7           AND     A               ; is result 0 or 1 ?
1C31 20 F0        JR      NZ,L1C23        ; back to JUMP if true (1).

1C33 D9           EXX                     ; else switch in the pointer set.
1C34 23           INC     HL              ; step past the jump length.
1C35 D9           EXX                     ; switch in the main set.
1C36 C9           RET                     ; return.


; ------------------------
; THE 'MODULUS' SUBROUTINE
; ------------------------
; ( Offset $2E: 'n-mod-m' )
; ( i1, i2 -- i3, i4 )
;   The subroutine calculate N mod M where M is the positive integer, the
;   'last value' on the calculator stack and N is the integer beneath.
;   The subroutine returns the integer quotient as the last value and the
;   remainder as the value beneath.
;   e.g.    17 MOD 3 = 5 remainder 2
;   It is invoked during the calculation of a random number and also by
;   the PRINT-FP routine.

;; n-mod-m
1C37    RST     28H             ;; FP-CALC          17, 3.
        DEFB    $C0             ;;st-mem-0          17, 3.
        DEFB    $02             ;;delete            17.
        DEFB    $2D             ;;duplicate         17, 17.
        DEFB    $E0             ;;get-mem-0         17, 17, 3.
        DEFB    $05             ;;division          17, 17/3.
        DEFB    $24             ;;int               17, 5.
        DEFB    $E0             ;;get-mem-0         17, 5, 3.
        DEFB    $01             ;;exchange          17, 3, 5.
        DEFB    $C0             ;;st-mem-0          17, 3, 5.
        DEFB    $04             ;;multiply          17, 15.
        DEFB    $03             ;;subtract          2.
        DEFB    $E0             ;;get-mem-0         2, 5.
        DEFB    $34             ;;end-calc          2, 5.

1C45 C9           RET                     ; return.


; ----------------------
; THE 'INTEGER' FUNCTION
; ----------------------
; (offset $24: 'int')
;   This function returns the integer of x, which is just the same as truncate
;   for positive numbers. The truncate literal truncates negative numbers
;   upwards so that -3.4 gives -3 whereas the BASIC INT function has to
;   truncate negative numbers down so that INT -3.4 is 4.
;   It is best to work through using, say, plus or minus 3.4 as examples.

;; int
1C46    RST     28H             ;; FP-CALC              x.    (= 3.4 or -3.4).
        DEFB    $2D             ;;duplicate             x, x.
        DEFB    $32             ;;less-0                x, (1/0)
        DEFB    $00             ;;jump-true             x, (1/0)
        DEFB    $04             ;;to L1C46, X-NEG

        DEFB    $36             ;;truncate              trunc 3.4 = 3.
        DEFB    $34             ;;end-calc              3.

1C4D C9           RET                     ; return with + int x on stack.


;; X-NEG
1C4E    DEFB    $2D             ;;duplicate             -3.4, -3.4.
        DEFB    $36             ;;truncate              -3.4, -3.
        DEFB    $C0             ;;st-mem-0              -3.4, -3.
        DEFB    $03             ;;subtract              -.4
        DEFB    $E0             ;;get-mem-0             -.4, -3.
        DEFB    $01             ;;exchange              -3, -.4.
        DEFB    $2C             ;;not                   -3, (0).
        DEFB    $00             ;;jump-true             -3.
        DEFB    $03             ;;to L1C59, EXIT        -3.

        DEFB    $A1             ;;stk-one               -3, 1.
        DEFB    $03             ;;subtract              -4.

;; EXIT
1C59    DEFB    $34             ;;end-calc              -4.

1C5A C9           RET                     ; return.


; ----------------
; Exponential (23)
; ----------------
;
;

;; EXP
;; exp
1C5B    RST     28H             ;; FP-CALC
        DEFB    $30             ;;stk-data
        DEFB    $F1             ;;Exponent: $81, Bytes: 4
        DEFB    $38,$AA,$3B,$29 ;;
        DEFB    $04             ;;multiply
        DEFB    $2D             ;;duplicate
        DEFB    $24             ;;int
        DEFB    $C3             ;;st-mem-3
        DEFB    $03             ;;subtract
        DEFB    $2D             ;;duplicate
        DEFB    $0F             ;;addition
        DEFB    $A1             ;;stk-one
        DEFB    $03             ;;subtract
        DEFB    $88             ;;series-08
        DEFB    $13             ;;Exponent: $63, Bytes: 1
        DEFB    $36             ;;(+00,+00,+00)
        DEFB    $58             ;;Exponent: $68, Bytes: 2
        DEFB    $65,$66         ;;(+00,+00)
        DEFB    $9D             ;;Exponent: $6D, Bytes: 3
        DEFB    $78,$65,$40     ;;(+00)
        DEFB    $A2             ;;Exponent: $72, Bytes: 3
        DEFB    $60,$32,$C9     ;;(+00)
        DEFB    $E7             ;;Exponent: $77, Bytes: 4
        DEFB    $21,$F7,$AF,$24 ;;
        DEFB    $EB             ;;Exponent: $7B, Bytes: 4
        DEFB    $2F,$B0,$B0,$14 ;;
        DEFB    $EE             ;;Exponent: $7E, Bytes: 4
        DEFB    $7E,$BB,$94,$58 ;;
        DEFB    $F1             ;;Exponent: $81, Bytes: 4
        DEFB    $3A,$7E,$F8,$CF ;;
        DEFB    $E3             ;;get-mem-3
        DEFB    $34             ;;end-calc

1C8F CD CD 15     CALL    L15CD           ; routine FP-TO-A
1C92 20 07        JR      NZ,L1C9B        ; to N-NEGTV

1C94 38 03        JR      C,L1C99         ; to REPORT-6b

1C96 86           ADD     A,(HL)          ;
1C97 30 09        JR      NC,L1CA2        ; to RESULT-OK


;; REPORT-6b
1C99    RST     08H             ; ERROR-1
        DEFB    $05             ; Error Report: Number too big

;; N-NEGTV
1C9B 38 07        JR      C,L1CA4         ; to RSLT-ZERO

1C9D 96           SUB     (HL)            ;
1C9E 30 04        JR      NC,L1CA4        ; to RSLT-ZERO

1CA0 ED 44        NEG                     ; Negate

;; RESULT-OK
1CA2 77           LD      (HL),A          ;
1CA3 C9           RET                     ; return.


;; RSLT-ZERO
1CA4 EF           RST     28H             ;; FP-CALC
        DEFB    $02             ;;delete
        DEFB    $A0             ;;stk-zero
        DEFB    $34             ;;end-calc

1CA8 C9           RET                     ; return.


; --------------------------------
; THE 'NATURAL LOGARITHM' FUNCTION
; --------------------------------
; (offset $22: 'ln')
;   Like the ZX81 itself, 'natural' logarithms came from Scotland.
;   They were devised in 1614 by well-traveled Scotsman John Napier who noted
;   "Nothing doth more molest and hinder calculators than the multiplications,
;    divisions, square and cubical extractions of great numbers".
;
;   Napier's logarithms enabled the above operations to be accomplished by
;   simple addition and subtraction simplifying the navigational and
;   astronomical calculations which beset his age.
;   Napier's logarithms were quickly overtaken by logarithms to the base 10
;   devised, in conjunction with Napier, by Henry Briggs a Cambridge-educated
;   professor of Geometry at Oxford University. These simplified the layout
;   of the tables enabling humans to easily scale calculations.
;
;   It is only recently with the introduction of pocket calculators and
;   computers like the ZX81 that natural logarithms are once more at the fore,
;   although some computers retain logarithms to the base ten.
;   'Natural' logarithms are powers to the base 'e', which like 'pi' is a
;   naturally occurring number in branches of mathematics.
;   Like 'pi' also, 'e' is an irrational number and starts 2.718281828...
;
;   The tabular use of logarithms was that to multiply two numbers one looked
;   up their two logarithms in the tables, added them together and then looked
;   for the result in a table of antilogarithms to give the desired product.
;
;   The EXP function is the BASIC equivalent of a calculator's 'antiln' function
;   and by picking any two numbers, 1.72 and 6.89 say,
;     10 PRINT EXP ( LN 1.72 + LN 6.89 )
;   will give just the same result as
;     20 PRINT 1.72 * 6.89.
;   Division is accomplished by subtracting the two logs.
;
;   Napier also mentioned "square and cubicle extractions".
;   To raise a number to the power 3, find its 'ln', multiply by 3 and find the
;   'antiln'.  e.g. PRINT EXP( LN 4 * 3 )  gives 64.
;   Similarly to find the n'th root divide the logarithm by 'n'.
;   The ZX81 ROM used PRINT EXP ( LN 9 / 2 ) to find the square root of the
;   number 9. The Napieran square root function is just a special case of
;   the 'to_power' function. A cube root or indeed any root/power would be just
;   as simple.

;   First test that the argument to LN is a positive, non-zero number.

;; ln
1CA9 EF           RST     28H             ;; FP-CALC
        DEFB    $2D             ;;duplicate
        DEFB    $33             ;;greater-0
        DEFB    $00             ;;jump-true
        DEFB    $04             ;;to L1CB1, VALID

        DEFB    $34             ;;end-calc


;; REPORT-Ab
1CAF CF           RST     08H             ; ERROR-1
        DEFB    $09             ; Error Report: Invalid argument

;; VALID
1CB1    DEFB    $A0             ;;stk-zero              Note. not
        DEFB    $02             ;;delete                necessary.
        DEFB    $34             ;;end-calc
1CB4 7E           LD      A,(HL)          ;

1CB5 36 80        LD      (HL),$80        ;
1CB7 CD 1D 15     CALL    L151D           ; routine STACK-A

1CBA EF           RST     28H             ;; FP-CALC
        DEFB    $30             ;;stk-data
        DEFB    $38             ;;Exponent: $88, Bytes: 1
        DEFB    $00             ;;(+00,+00,+00)
        DEFB    $03             ;;subtract
        DEFB    $01             ;;exchange
        DEFB    $2D             ;;duplicate
        DEFB    $30             ;;stk-data
        DEFB    $F0             ;;Exponent: $80, Bytes: 4
        DEFB    $4C,$CC,$CC,$CD ;;
        DEFB    $03             ;;subtract
        DEFB    $33             ;;greater-0
        DEFB    $00             ;;jump-true
        DEFB    $08             ;;to L1CD2, GRE.8

        DEFB    $01             ;;exchange
        DEFB    $A1             ;;stk-one
        DEFB    $03             ;;subtract
        DEFB    $01             ;;exchange
        DEFB    $34             ;;end-calc

1CD0 34           INC     (HL)            ;

1CD1 EF           RST     28H             ;; FP-CALC

;; GRE.8
1CD2    DEFB    $01             ;;exchange
        DEFB    $30             ;;stk-data
        DEFB    $F0             ;;Exponent: $80, Bytes: 4
        DEFB    $31,$72,$17,$F8 ;;
        DEFB    $04             ;;multiply
        DEFB    $01             ;;exchange
        DEFB    $A2             ;;stk-half
        DEFB    $03             ;;subtract
        DEFB    $A2             ;;stk-half
        DEFB    $03             ;;subtract
        DEFB    $2D             ;;duplicate
        DEFB    $30             ;;stk-data
        DEFB    $32             ;;Exponent: $82, Bytes: 1
        DEFB    $20             ;;(+00,+00,+00)
        DEFB    $04             ;;multiply
        DEFB    $A2             ;;stk-half
        DEFB    $03             ;;subtract
        DEFB    $8C             ;;series-0C
        DEFB    $11             ;;Exponent: $61, Bytes: 1
        DEFB    $AC             ;;(+00,+00,+00)
        DEFB    $14             ;;Exponent: $64, Bytes: 1
        DEFB    $09             ;;(+00,+00,+00)
        DEFB    $56             ;;Exponent: $66, Bytes: 2
        DEFB    $DA,$A5         ;;(+00,+00)
        DEFB    $59             ;;Exponent: $69, Bytes: 2
        DEFB    $30,$C5         ;;(+00,+00)
        DEFB    $5C             ;;Exponent: $6C, Bytes: 2
        DEFB    $90,$AA         ;;(+00,+00)
        DEFB    $9E             ;;Exponent: $6E, Bytes: 3
        DEFB    $70,$6F,$61     ;;(+00)
        DEFB    $A1             ;;Exponent: $71, Bytes: 3
        DEFB    $CB,$DA,$96     ;;(+00)
        DEFB    $A4             ;;Exponent: $74, Bytes: 3
        DEFB    $31,$9F,$B4     ;;(+00)
        DEFB    $E7             ;;Exponent: $77, Bytes: 4
        DEFB    $A0,$FE,$5C,$FC ;;
        DEFB    $EA             ;;Exponent: $7A, Bytes: 4
        DEFB    $1B,$43,$CA,$36 ;;
        DEFB    $ED             ;;Exponent: $7D, Bytes: 4
        DEFB    $A7,$9C,$7E,$5E ;;
        DEFB    $F0             ;;Exponent: $80, Bytes: 4
        DEFB    $6E,$23,$80,$93 ;;
        DEFB    $04             ;;multiply
        DEFB    $0F             ;;addition
        DEFB    $34             ;;end-calc

1D17 C9           RET                     ; return.

; -----------------------------
; THE 'TRIGONOMETRIC' FUNCTIONS
; -----------------------------
;   Trigonometry is rocket science. It is also used by carpenters and pyramid
;   builders.
;   Some uses can be quite abstract but the principles can be seen in simple
;   right-angled triangles. Triangles have some special properties -
;
;   1) The sum of the three angles is always PI radians (180 degrees).
;      Very helpful if you know two angles and wish to find the third.
;   2) In any right-angled triangle the sum of the squares of the two shorter
;      sides is equal to the square of the longest side opposite the right-angle.
;      Very useful if you know the length of two sides and wish to know the
;      length of the third side.
;   3) Functions sine, cosine and tangent enable one to calculate the length
;      of an unknown side when the length of one other side and an angle is
;      known.
;   4) Functions arcsin, arccosine and arctan enable one to calculate an unknown
;      angle when the length of two of the sides is known.

; --------------------------------
; THE 'REDUCE ARGUMENT' SUBROUTINE
; --------------------------------
; (offset $35: 'get-argt')
;
;   This routine performs two functions on the angle, in radians, that forms
;   the argument to the sine and cosine functions.
;   First it ensures that the angle 'wraps round'. That if a ship turns through
;   an angle of, say, 3*PI radians (540 degrees) then the net effect is to turn
;   through an angle of PI radians (180 degrees).
;   Secondly it converts the angle in radians to a fraction of a right angle,
;   depending within which quadrant the angle lies, with the periodicity
;   resembling that of the desired sine value.
;   The result lies in the range -1 to +1.
;
;                       90 deg.
;
;                       (pi/2)
;                II       +1        I
;                         |
;          sin+      |\   |   /|    sin+
;          cos-      | \  |  / |    cos+
;          tan-      |  \ | /  |    tan+
;                    |   \|/)  |
;   180 deg. (pi) 0 -|----+----|-- 0  (0)   0 degrees
;                    |   /|\   |
;          sin-      |  / | \  |    sin-
;          cos-      | /  |  \ |    cos+
;          tan+      |/   |   \|    tan-
;                         |
;                III      -1       IV
;                       (3pi/2)
;
;                       270 deg.


;; get-argt
1D18 EF           RST     28H             ;; FP-CALC         X.
        DEFB    $30             ;;stk-data
        DEFB    $EE             ;;Exponent: $7E,
                                ;;Bytes: 4
        DEFB    $22,$F9,$83,$6E ;;                 X, 1/(2*PI)
        DEFB    $04             ;;multiply         X/(2*PI) = fraction

        DEFB    $2D             ;;duplicate
        DEFB    $A2             ;;stk-half
        DEFB    $0F             ;;addition
        DEFB    $24             ;;int

        DEFB    $03             ;;subtract         now range -.5 to .5

        DEFB    $2D             ;;duplicate
        DEFB    $0F             ;;addition         now range -1 to 1.
        DEFB    $2D             ;;duplicate
        DEFB    $0F             ;;addition         now range -2 to 2.

;   quadrant I (0 to +1) and quadrant IV (-1 to 0) are now correct.
;   quadrant II ranges +1 to +2.
;   quadrant III ranges -2 to -1.

        DEFB    $2D             ;;duplicate        Y, Y.
        DEFB    $27             ;;abs              Y, abs(Y).    range 1 to 2
        DEFB    $A1             ;;stk-one          Y, abs(Y), 1.
        DEFB    $03             ;;subtract         Y, abs(Y)-1.  range 0 to 1
        DEFB    $2D             ;;duplicate        Y, Z, Z.
        DEFB    $33             ;;greater-0        Y, Z, (1/0).

        DEFB    $C0             ;;st-mem-0         store as possible sign
                                ;;                 for cosine function.

        DEFB    $00             ;;jump-true
        DEFB    $04             ;;to L1D35, ZPLUS  with quadrants II and III

;   else the angle lies in quadrant I or IV and value Y is already correct.

        DEFB    $02             ;;delete          Y    delete test value.
        DEFB    $34             ;;end-calc        Y.

1D34 C9           RET                     ; return.         with Q1 and Q4 >>>

;   The branch was here with quadrants II (0 to 1) and III (1 to 0).
;   Y will hold -2 to -1 if this is quadrant III.

;; ZPLUS
1D35    DEFB    $A1             ;;stk-one         Y, Z, 1
        DEFB    $03             ;;subtract        Y, Z-1.       Q3 = 0 to -1
        DEFB    $01             ;;exchange        Z-1, Y.
        DEFB    $32             ;;less-0          Z-1, (1/0).
        DEFB    $00             ;;jump-true       Z-1.
        DEFB    $02             ;;to L1D3C, YNEG
                                ;;if angle in quadrant III

;   else angle is within quadrant II (-1 to 0)

        DEFB    $18             ;;negate          range +1 to 0


;; YNEG
1D3C    DEFB    $34             ;;end-calc        quadrants II and III correct.

1D3D C9           RET                     ; return.


; ---------------------
; THE 'COSINE' FUNCTION
; ---------------------
; (offset $1D: 'cos')
;   Cosines are calculated as the sine of the opposite angle rectifying the
;   sign depending on the quadrant rules.
;
;
;             /|
;          h /y|
;           /  |o
;          /x  |
;         /----|
;           a
;
;   The cosine of angle x is the adjacent side (a) divided by the hypotenuse 1.
;   However if we examine angle y then a/h is the sine of that angle.
;   Since angle x plus angle y equals a right-angle, we can find angle y by
;   subtracting angle x from pi/2.
;   However it's just as easy to reduce the argument first and subtract the
;   reduced argument from the value 1 (a reduced right-angle).
;   It's even easier to subtract 1 from the angle and rectify the sign.
;   In fact, after reducing the argument, the absolute value of the argument
;   is used and rectified using the test result stored in mem-0 by 'get-argt'
;   for that purpose.

;; cos
1D3E EF           RST     28H             ;; FP-CALC              angle in radians.
        DEFB    $35             ;;get-argt              X       reduce -1 to +1

        DEFB    $27             ;;abs                   ABS X   0 to 1
        DEFB    $A1             ;;stk-one               ABS X, 1.
        DEFB    $03             ;;subtract              now opposite angle
                                ;;                      though negative sign.
        DEFB    $E0             ;;get-mem-0             fetch sign indicator.
        DEFB    $00             ;;jump-true
        DEFB    $06             ;;fwd to L1D4B, C-ENT
                                ;;forward to common code if in QII or QIII


        DEFB    $18             ;;negate                else make positive.
        DEFB    $2F             ;;jump
        DEFB    $03             ;;fwd to L1D4B, C-ENT
                                ;;with quadrants QI and QIV

; -------------------
; THE 'SINE' FUNCTION
; -------------------
; (offset $1C: 'sin')
;   This is a fundamental transcendental function from which others such as cos
;   and tan are directly, or indirectly, derived.
;   It uses the series generator to produce Chebyshev polynomials.
;
;
;             /|
;          1 / |
;           /  |x
;          /a  |
;         /----|
;           y
;
;   The 'get-argt' function is designed to modify the angle and its sign
;   in line with the desired sine value and afterwards it can launch straight
;   into common code.

;; sin
1D49 EF           RST     28H             ;; FP-CALC      angle in radians
        DEFB    $35             ;;get-argt      reduce - sign now correct.

;; C-ENT
1D4B    DEFB    $2D             ;;duplicate
        DEFB    $2D             ;;duplicate
        DEFB    $04             ;;multiply
        DEFB    $2D             ;;duplicate
        DEFB    $0F             ;;addition
        DEFB    $A1             ;;stk-one
        DEFB    $03             ;;subtract

        DEFB    $86             ;;series-06
        DEFB    $14             ;;Exponent: $64, Bytes: 1
        DEFB    $E6             ;;(+00,+00,+00)
        DEFB    $5C             ;;Exponent: $6C, Bytes: 2
        DEFB    $1F,$0B         ;;(+00,+00)
        DEFB    $A3             ;;Exponent: $73, Bytes: 3
        DEFB    $8F,$38,$EE     ;;(+00)
        DEFB    $E9             ;;Exponent: $79, Bytes: 4
        DEFB    $15,$63,$BB,$23 ;;
        DEFB    $EE             ;;Exponent: $7E, Bytes: 4
        DEFB    $92,$0D,$CD,$ED ;;
        DEFB    $F1             ;;Exponent: $81, Bytes: 4
        DEFB    $23,$5D,$1B,$EA ;;

        DEFB    $04             ;;multiply
        DEFB    $34             ;;end-calc

1D6D C9           RET                     ; return.


; ----------------------
; THE 'TANGENT' FUNCTION
; ----------------------
; (offset $1E: 'tan')
;
;   Evaluates tangent x as    sin(x) / cos(x).
;
;
;             /|
;          h / |
;           /  |o
;          /x  |
;         /----|
;           a
;
;   The tangent of angle x is the ratio of the length of the opposite side
;   divided by the length of the adjacent side. As the opposite length can
;   be calculates using sin(x) and the adjacent length using cos(x) then
;   the tangent can be defined in terms of the previous two functions.

;   Error 6 if the argument, in radians, is too close to one like pi/2
;   which has an infinite tangent. e.g. PRINT TAN (PI/2)  evaluates as 1/0.
;   Similarly PRINT TAN (3*PI/2), TAN (5*PI/2) etc.

;; tan
1D6E EF           RST     28H             ;; FP-CALC          x.
        DEFB    $2D             ;;duplicate         x, x.
        DEFB    $1C             ;;sin               x, sin x.
        DEFB    $01             ;;exchange          sin x, x.
        DEFB    $1D             ;;cos               sin x, cos x.
        DEFB    $05             ;;division          sin x/cos x (= tan x).
        DEFB    $34             ;;end-calc          tan x.

1D75 C9           RET                     ; return.

; ---------------------
; THE 'ARCTAN' FUNCTION
; ---------------------
; (Offset $21: 'atn')
;   The inverse tangent function with the result in radians.
;   This is a fundamental transcendental function from which others such as
;   asn and acs are directly, or indirectly, derived.
;   It uses the series generator to produce Chebyshev polynomials.

;; atn
1D76 7E           LD      A,(HL)          ; fetch exponent
1D77 FE 81        CP      $81             ; compare to that for 'one'
1D79 38 0E        JR      C,L1D89         ; forward, if less, to SMALL

1D7B EF           RST     28H             ;; FP-CALC      X.
        DEFB    $A1             ;;stk-one
        DEFB    $18             ;;negate
        DEFB    $01             ;;exchange
        DEFB    $05             ;;division
        DEFB    $2D             ;;duplicate
        DEFB    $32             ;;less-0
        DEFB    $A3             ;;stk-pi/2
        DEFB    $01             ;;exchange
        DEFB    $00             ;;jump-true
        DEFB    $06             ;;to L1D8B, CASES

        DEFB    $18             ;;negate
        DEFB    $2F             ;;jump
        DEFB    $03             ;;to L1D8B, CASES

; ---

;; SMALL
1D89 EF           RST     28H             ;; FP-CALC
        DEFB    $A0             ;;stk-zero

;; CASES
1D8B    DEFB    $01             ;;exchange
        DEFB    $2D             ;;duplicate
        DEFB    $2D             ;;duplicate
        DEFB    $04             ;;multiply
        DEFB    $2D             ;;duplicate
        DEFB    $0F             ;;addition
        DEFB    $A1             ;;stk-one
        DEFB    $03             ;;subtract

        DEFB    $8C             ;;series-0C
        DEFB    $10             ;;Exponent: $60, Bytes: 1
        DEFB    $B2             ;;(+00,+00,+00)
        DEFB    $13             ;;Exponent: $63, Bytes: 1
        DEFB    $0E             ;;(+00,+00,+00)
        DEFB    $55             ;;Exponent: $65, Bytes: 2
        DEFB    $E4,$8D         ;;(+00,+00)
        DEFB    $58             ;;Exponent: $68, Bytes: 2
        DEFB    $39,$BC         ;;(+00,+00)
        DEFB    $5B             ;;Exponent: $6B, Bytes: 2
        DEFB    $98,$FD         ;;(+00,+00)
        DEFB    $9E             ;;Exponent: $6E, Bytes: 3
        DEFB    $00,$36,$75     ;;(+00)
        DEFB    $A0             ;;Exponent: $70, Bytes: 3
        DEFB    $DB,$E8,$B4     ;;(+00)
        DEFB    $63             ;;Exponent: $73, Bytes: 2
        DEFB    $42,$C4         ;;(+00,+00)
        DEFB    $E6             ;;Exponent: $76, Bytes: 4
        DEFB    $B5,$09,$36,$BE ;;
        DEFB    $E9             ;;Exponent: $79, Bytes: 4
        DEFB    $36,$73,$1B,$5D ;;
        DEFB    $EC             ;;Exponent: $7C, Bytes: 4
        DEFB    $D8,$DE,$63,$BE ;;
        DEFB    $F0             ;;Exponent: $80, Bytes: 4
        DEFB    $61,$A1,$B3,$0C ;;

        DEFB    $04             ;;multiply
        DEFB    $0F             ;;addition
        DEFB    $34             ;;end-calc

1DC3 C9           RET                     ; return.


; ---------------------
; THE 'ARCSIN' FUNCTION
; ---------------------
; (Offset $1F: 'asn')
;   The inverse sine function with result in radians.
;   Derived from arctan function above.
;   Error A unless the argument is between -1 and +1 inclusive.
;   Uses an adaptation of the formula asn(x) = atn(x/sqr(1-x*x))
;
;
;                 /|
;                / |
;              1/  |x
;              /a  |
;             /----|
;               y
;
;   e.g. We know the opposite side (x) and hypotenuse (1)
;   and we wish to find angle a in radians.
;   We can derive length y by Pythagoras and then use ATN instead.
;   Since y*y + x*x = 1*1 (Pythagoras Theorem) then
;   y=sqr(1-x*x)                         - no need to multiply 1 by itself.
;   So, asn(a) = atn(x/y)
;   or more fully,
;   asn(a) = atn(x/sqr(1-x*x))

;   Close but no cigar.

;   While PRINT ATN (x/SQR (1-x*x)) gives the same results as PRINT ASN x,
;   it leads to division by zero when x is 1 or -1.
;   To overcome this, 1 is added to y giving half the required angle and the
;   result is then doubled.
;   That is, PRINT ATN (x/(SQR (1-x*x) +1)) *2
;
;
;               . /|
;            .  c/ |
;         .     /1 |x
;      . c   b /a  |
;    ---------/----|
;      1      y
;
;   By creating an isosceles triangle with two equal sides of 1, angles c and
;   c are also equal. If b+c+d = 180 degrees and b+a = 180 degrees then c=a/2.
;
;   A value higher than 1 gives the required error as attempting to find  the
;   square root of a negative number generates an error in Sinclair BASIC.

;; asn
1DC4 EF           RST     28H             ;; FP-CALC      x.
        DEFB    $2D             ;;duplicate     x, x.
        DEFB    $2D             ;;duplicate     x, x, x.
        DEFB    $04             ;;multiply      x, x*x.
        DEFB    $A1             ;;stk-one       x, x*x, 1.
        DEFB    $03             ;;subtract      x, x*x-1.
        DEFB    $18             ;;negate        x, 1-x*x.
        DEFB    $25             ;;sqr           x, sqr(1-x*x) = y.
        DEFB    $A1             ;;stk-one       x, y, 1.
        DEFB    $0F             ;;addition      x, y+1.
        DEFB    $05             ;;division      x/y+1.
        DEFB    $21             ;;atn           a/2     (half the angle)
        DEFB    $2D             ;;duplicate     a/2, a/2.
        DEFB    $0F             ;;addition      a.
        DEFB    $34             ;;end-calc      a.

1DD3 C9           RET                     ; return.


; ------------------------
; THE 'ARCCOS' FUNCTION
; ------------------------
; (Offset $20: 'acs')
;   The inverse cosine function with the result in radians.
;   Error A unless the argument is between -1 and +1.
;   Result in range 0 to pi.
;   Derived from asn above which is in turn derived from the preceding atn. It
;   could have been derived directly from atn using acs(x) = atn(sqr(1-x*x)/x).
;   However, as sine and cosine are horizontal translations of each other,
;   uses acs(x) = pi/2 - asn(x)

;   e.g. the arccosine of a known x value will give the required angle b in
;   radians.
;   We know, from above, how to calculate the angle a using asn(x).
;   Since the three angles of any triangle add up to 180 degrees, or pi radians,
;   and the largest angle in this case is a right-angle (pi/2 radians), then
;   we can calculate angle b as pi/2 (both angles) minus asn(x) (angle a).
;
;
;            /|
;         1 /b|
;          /  |x
;         /a  |
;        /----|
;          y

;; acs
1DD4 EF           RST     28H             ;; FP-CALC      x.
        DEFB    $1F             ;;asn           asn(x).
        DEFB    $A3             ;;stk-pi/2      asn(x), pi/2.
        DEFB    $03             ;;subtract      asn(x) - pi/2.
        DEFB    $18             ;;negate        pi/2 - asn(x) = acs(x).
        DEFB    $34             ;;end-calc      acs(x)

1DDA C9           RET                     ; return.


; --------------------------
; THE 'SQUARE ROOT' FUNCTION
; --------------------------
; (Offset $25: 'sqr')
;   Error A if argument is negative.
;   This routine is remarkable for its brevity - 7 bytes.
;   The ZX81 code was originally 9K and various techniques had to be
;   used to shoe-horn it into an 8K Rom chip.


;; sqr
1DDB EF           RST     28H             ;; FP-CALC              x.
        DEFB    $2D             ;;duplicate             x, x.
        DEFB    $2C             ;;not                   x, 1/0
        DEFB    $00             ;;jump-true             x, (1/0).
        DEFB    $1E             ;;to L1DFD, LAST        exit if argument zero
                                ;;                      with zero result.

;   else continue to calculate as x ** .5

        DEFB    $A2             ;;stk-half              x, .5.
        DEFB    $34             ;;end-calc              x, .5.


; ------------------------------
; THE 'EXPONENTIATION' OPERATION
; ------------------------------
; (Offset $06: 'to-power')
;   This raises the first number X to the power of the second number Y.
;   As with the ZX80,
;   0 ** 0 = 1
;   0 ** +n = 0
;   0 ** -n = arithmetic overflow.

;; to-power
1DE2 EF           RST     28H             ;; FP-CALC              X,Y.
        DEFB    $01             ;;exchange              Y,X.
        DEFB    $2D             ;;duplicate             Y,X,X.
        DEFB    $2C             ;;not                   Y,X,(1/0).
        DEFB    $00             ;;jump-true
        DEFB    $07             ;;forward to L1DEE, XISO if X is zero.

;   else X is non-zero. function 'ln' will catch a negative value of X.

        DEFB    $22             ;;ln                    Y, LN X.
        DEFB    $04             ;;multiply              Y * LN X
        DEFB    $34             ;;end-calc

1DED C9           JP      L1C5B           ; jump back to EXP routine.  ->

; ---

;   These routines form the three simple results when the number is zero.
;   begin by deleting the known zero to leave Y the power factor.

;; XISO
1DEE    DEFB    $02             ;;delete                Y.
        DEFB    $2D             ;;duplicate             Y, Y.
        DEFB    $2C             ;;not                   Y, (1/0).
        DEFB    $00             ;;jump-true
        DEFB    $09             ;;forward to L1DFB, ONE if Y is zero.

;   the power factor is not zero. If negative then an error exists.

        DEFB    $A0             ;;stk-zero              Y, 0.
        DEFB    $01             ;;exchange              0, Y.
        DEFB    $33             ;;greater-0             0, (1/0).
        DEFB    $00             ;;jump-true             0
        DEFB    $06             ;;to L1DFD, LAST        if Y was any positive
                                ;;                      number.

;   else force division by zero thereby raising an Arithmetic overflow error.
;   There are some one and two-byte alternatives but perhaps the most formal
;   might have been to use end-calc; rst 08; defb 05.

        DEFB    $A1             ;;stk-one               0, 1.
        DEFB    $01             ;;exchange              1, 0.
        DEFB    $05             ;;division              1/0    >> error

; ---

;; ONE
1DFB    DEFB    $02             ;;delete                .
        DEFB    $A1             ;;stk-one               1.

;; LAST
1DFD    DEFB    $34             ;;end-calc              last value 1 or 0.

1DFE C9           RET                     ; return.

; ---------------------
; THE 'SPARE LOCATIONS'
; ---------------------

;; SPARE
1DFF    DEFB    $FF             ; That's all folks.



; ------------------------
; THE 'ZX81 CHARACTER SET'
; ------------------------

;; char-set - begins with space character.

; $00 - Character: ' '          CHR$(0)

1E00    DEFB    %00000000
        DEFB    %00000000
        DEFB    %00000000
        DEFB    %00000000
        DEFB    %00000000
        DEFB    %00000000
        DEFB    %00000000
        DEFB    %00000000

; $01 - Character: mosaic       CHR$(1)

        DEFB    %11110000
        DEFB    %11110000
        DEFB    %11110000
        DEFB    %11110000
        DEFB    %00000000
        DEFB    %00000000
        DEFB    %00000000
        DEFB    %00000000


; $02 - Character: mosaic       CHR$(2)

        DEFB    %00001111
        DEFB    %00001111
        DEFB    %00001111
        DEFB    %00001111
        DEFB    %00000000
        DEFB    %00000000
        DEFB    %00000000
        DEFB    %00000000


; $03 - Character: mosaic       CHR$(3)

        DEFB    %11111111
        DEFB    %11111111
        DEFB    %11111111
        DEFB    %11111111
        DEFB    %00000000
        DEFB    %00000000
        DEFB    %00000000
        DEFB    %00000000

; $04 - Character: mosaic       CHR$(4)

        DEFB    %00000000
        DEFB    %00000000
        DEFB    %00000000
        DEFB    %00000000
        DEFB    %11110000
        DEFB    %11110000
        DEFB    %11110000
        DEFB    %11110000

; $05 - Character: mosaic       CHR$(1)

        DEFB    %11110000
        DEFB    %11110000
        DEFB    %11110000
        DEFB    %11110000
        DEFB    %11110000
        DEFB    %11110000
        DEFB    %11110000
        DEFB    %11110000

; $06 - Character: mosaic       CHR$(1)

        DEFB    %00001111
        DEFB    %00001111
        DEFB    %00001111
        DEFB    %00001111
        DEFB    %11110000
        DEFB    %11110000
        DEFB    %11110000
        DEFB    %11110000

; $07 - Character: mosaic       CHR$(1)

        DEFB    %11111111
        DEFB    %11111111
        DEFB    %11111111
        DEFB    %11111111
        DEFB    %11110000
        DEFB    %11110000
        DEFB    %11110000
        DEFB    %11110000

; $08 - Character: mosaic       CHR$(1)

        DEFB    %10101010
        DEFB    %01010101
        DEFB    %10101010
        DEFB    %01010101
        DEFB    %10101010
        DEFB    %01010101
        DEFB    %10101010
        DEFB    %01010101

; $09 - Character: mosaic       CHR$(1)

        DEFB    %00000000
        DEFB    %00000000
        DEFB    %00000000
        DEFB    %00000000
        DEFB    %10101010
        DEFB    %01010101
        DEFB    %10101010
        DEFB    %01010101

; $0A - Character: mosaic       CHR$(10)

        DEFB    %10101010
        DEFB    %01010101
        DEFB    %10101010
        DEFB    %01010101
        DEFB    %00000000
        DEFB    %00000000
        DEFB    %00000000
        DEFB    %00000000

; $0B - Character: '"'          CHR$(11)

        DEFB    %00000000
        DEFB    %00100100
        DEFB    %00100100
        DEFB    %00000000
        DEFB    %00000000
        DEFB    %00000000
        DEFB    %00000000
        DEFB    %00000000

; $0B - Character:  £           CHR$(12)

        DEFB    %00000000
        DEFB    %00011100
        DEFB    %00100010
        DEFB    %01111000
        DEFB    %00100000
        DEFB    %00100000
        DEFB    %01111110
        DEFB    %00000000

; $0B - Character: '$'          CHR$(13)

        DEFB    %00000000
        DEFB    %00001000
        DEFB    %00111110
        DEFB    %00101000
        DEFB    %00111110
        DEFB    %00001010
        DEFB    %00111110
        DEFB    %00001000

; $0B - Character: ':'          CHR$(14)

        DEFB    %00000000
        DEFB    %00000000
        DEFB    %00000000
        DEFB    %00010000
        DEFB    %00000000
        DEFB    %00000000
        DEFB    %00010000
        DEFB    %00000000

; $0B - Character: '?'          CHR$(15)

        DEFB    %00000000
        DEFB    %00111100
        DEFB    %01000010
        DEFB    %00000100
        DEFB    %00001000
        DEFB    %00000000
        DEFB    %00001000
        DEFB    %00000000

; $10 - Character: '('          CHR$(16)

        DEFB    %00000000
        DEFB    %00000100
        DEFB    %00001000
        DEFB    %00001000
        DEFB    %00001000
        DEFB    %00001000
        DEFB    %00000100
        DEFB    %00000000

; $11 - Character: ')'          CHR$(17)

        DEFB    %00000000
        DEFB    %00100000
        DEFB    %00010000
        DEFB    %00010000
        DEFB    %00010000
        DEFB    %00010000
        DEFB    %00100000
        DEFB    %00000000

; $12 - Character: '>'          CHR$(18)

        DEFB    %00000000
        DEFB    %00000000
        DEFB    %00010000
        DEFB    %00001000
        DEFB    %00000100
        DEFB    %00001000
        DEFB    %00010000
        DEFB    %00000000

; $13 - Character: '<'          CHR$(19)

        DEFB    %00000000
        DEFB    %00000000
        DEFB    %00000100
        DEFB    %00001000
        DEFB    %00010000
        DEFB    %00001000
        DEFB    %00000100
        DEFB    %00000000

; $14 - Character: '='          CHR$(20)

        DEFB    %00000000
        DEFB    %00000000
        DEFB    %00000000
        DEFB    %00111110
        DEFB    %00000000
        DEFB    %00111110
        DEFB    %00000000
        DEFB    %00000000

; $15 - Character: '+'          CHR$(21)

        DEFB    %00000000
        DEFB    %00000000
        DEFB    %00001000
        DEFB    %00001000
        DEFB    %00111110
        DEFB    %00001000
        DEFB    %00001000
        DEFB    %00000000

; $16 - Character: '-'          CHR$(22)

        DEFB    %00000000
        DEFB    %00000000
        DEFB    %00000000
        DEFB    %00000000
        DEFB    %00111110
        DEFB    %00000000
        DEFB    %00000000
        DEFB    %00000000

; $17 - Character: '*'          CHR$(23)

        DEFB    %00000000
        DEFB    %00000000
        DEFB    %00010100
        DEFB    %00001000
        DEFB    %00111110
        DEFB    %00001000
        DEFB    %00010100
        DEFB    %00000000

; $18 - Character: '/'          CHR$(24)

        DEFB    %00000000
        DEFB    %00000000
        DEFB    %00000010
        DEFB    %00000100
        DEFB    %00001000
        DEFB    %00010000
        DEFB    %00100000
        DEFB    %00000000

; $19 - Character: ';'          CHR$(25)

        DEFB    %00000000
        DEFB    %00000000
        DEFB    %00010000
        DEFB    %00000000
        DEFB    %00000000
        DEFB    %00010000
        DEFB    %00010000
        DEFB    %00100000

; $1A - Character: ','          CHR$(26)

        DEFB    %00000000
        DEFB    %00000000
        DEFB    %00000000
        DEFB    %00000000
        DEFB    %00000000
        DEFB    %00001000
        DEFB    %00001000
        DEFB    %00010000

; $1B - Character: '"'          CHR$(27)

        DEFB    %00000000
        DEFB    %00000000
        DEFB    %00000000
        DEFB    %00000000
        DEFB    %00000000
        DEFB    %00011000
        DEFB    %00011000
        DEFB    %00000000

; $1C - Character: '0'          CHR$(28)

        DEFB    %00000000
        DEFB    %00111100
        DEFB    %01000110
        DEFB    %01001010
        DEFB    %01010010
        DEFB    %01100010
        DEFB    %00111100
        DEFB    %00000000

; $1D - Character: '1'          CHR$(29)

        DEFB    %00000000
        DEFB    %00011000
        DEFB    %00101000
        DEFB    %00001000
        DEFB    %00001000
        DEFB    %00001000
        DEFB    %00111110
        DEFB    %00000000

; $1E - Character: '2'          CHR$(30)

        DEFB    %00000000
        DEFB    %00111100
        DEFB    %01000010
        DEFB    %00000010
        DEFB    %00111100
        DEFB    %01000000
        DEFB    %01111110
        DEFB    %00000000

; $1F - Character: '3'          CHR$(31)

        DEFB    %00000000
        DEFB    %00111100
        DEFB    %01000010
        DEFB    %00001100
        DEFB    %00000010
        DEFB    %01000010
        DEFB    %00111100
        DEFB    %00000000

; $20 - Character: '4'          CHR$(32)

        DEFB    %00000000
        DEFB    %00001000
        DEFB    %00011000
        DEFB    %00101000
        DEFB    %01001000
        DEFB    %01111110
        DEFB    %00001000
        DEFB    %00000000

; $21 - Character: '5'          CHR$(33)

        DEFB    %00000000
        DEFB    %01111110
        DEFB    %01000000
        DEFB    %01111100
        DEFB    %00000010
        DEFB    %01000010
        DEFB    %00111100
        DEFB    %00000000

; $22 - Character: '6'          CHR$(34)

        DEFB    %00000000
        DEFB    %00111100
        DEFB    %01000000
        DEFB    %01111100
        DEFB    %01000010
        DEFB    %01000010
        DEFB    %00111100
        DEFB    %00000000

; $23 - Character: '7'          CHR$(35)

        DEFB    %00000000
        DEFB    %01111110
        DEFB    %00000010
        DEFB    %00000100
        DEFB    %00001000
        DEFB    %00010000
        DEFB    %00010000
        DEFB    %00000000

; $24 - Character: '8'          CHR$(36)

        DEFB    %00000000
        DEFB    %00111100
        DEFB    %01000010
        DEFB    %00111100
        DEFB    %01000010
        DEFB    %01000010
        DEFB    %00111100
        DEFB    %00000000

; $25 - Character: '9'          CHR$(37)

        DEFB    %00000000
        DEFB    %00111100
        DEFB    %01000010
        DEFB    %01000010
        DEFB    %00111110
        DEFB    %00000010
        DEFB    %00111100
        DEFB    %00000000

; $26 - Character: 'A'          CHR$(38)

        DEFB    %00000000
        DEFB    %00111100
        DEFB    %01000010
        DEFB    %01000010
        DEFB    %01111110
        DEFB    %01000010
        DEFB    %01000010
        DEFB    %00000000

; $27 - Character: 'B'          CHR$(39)

        DEFB    %00000000
        DEFB    %01111100
        DEFB    %01000010
        DEFB    %01111100
        DEFB    %01000010
        DEFB    %01000010
        DEFB    %01111100
        DEFB    %00000000

; $28 - Character: 'C'          CHR$(40)

        DEFB    %00000000
        DEFB    %00111100
        DEFB    %01000010
        DEFB    %01000000
        DEFB    %01000000
        DEFB    %01000010
        DEFB    %00111100
        DEFB    %00000000

; $29 - Character: 'D'          CHR$(41)

        DEFB    %00000000
        DEFB    %01111000
        DEFB    %01000100
        DEFB    %01000010
        DEFB    %01000010
        DEFB    %01000100
        DEFB    %01111000
        DEFB    %00000000

; $2A - Character: 'E'          CHR$(42)

        DEFB    %00000000
        DEFB    %01111110
        DEFB    %01000000
        DEFB    %01111100
        DEFB    %01000000
        DEFB    %01000000
        DEFB    %01111110
        DEFB    %00000000

; $2B - Character: 'F'          CHR$(43)

        DEFB    %00000000
        DEFB    %01111110
        DEFB    %01000000
        DEFB    %01111100
        DEFB    %01000000
        DEFB    %01000000
        DEFB    %01000000
        DEFB    %00000000

; $2C - Character: 'G'          CHR$(44)

        DEFB    %00000000
        DEFB    %00111100
        DEFB    %01000010
        DEFB    %01000000
        DEFB    %01001110
        DEFB    %01000010
        DEFB    %00111100
        DEFB    %00000000

; $2D - Character: 'H'          CHR$(45)

        DEFB    %00000000
        DEFB    %01000010
        DEFB    %01000010
        DEFB    %01111110
        DEFB    %01000010
        DEFB    %01000010
        DEFB    %01000010
        DEFB    %00000000

; $2E - Character: 'I'          CHR$(46)

        DEFB    %00000000
        DEFB    %00111110
        DEFB    %00001000
        DEFB    %00001000
        DEFB    %00001000
        DEFB    %00001000
        DEFB    %00111110
        DEFB    %00000000

; $2F - Character: 'J'          CHR$(47)

        DEFB    %00000000
        DEFB    %00000010
        DEFB    %00000010
        DEFB    %00000010
        DEFB    %01000010
        DEFB    %01000010
        DEFB    %00111100
        DEFB    %00000000

; $30 - Character: 'K'          CHR$(48)

        DEFB    %00000000
        DEFB    %01000100
        DEFB    %01001000
        DEFB    %01110000
        DEFB    %01001000
        DEFB    %01000100
        DEFB    %01000010
        DEFB    %00000000

; $31 - Character: 'L'          CHR$(49)

        DEFB    %00000000
        DEFB    %01000000
        DEFB    %01000000
        DEFB    %01000000
        DEFB    %01000000
        DEFB    %01000000
        DEFB    %01111110
        DEFB    %00000000

; $32 - Character: 'M'          CHR$(50)

        DEFB    %00000000
        DEFB    %01000010
        DEFB    %01100110
        DEFB    %01011010
        DEFB    %01000010
        DEFB    %01000010
        DEFB    %01000010
        DEFB    %00000000

; $33 - Character: 'N'          CHR$(51)

        DEFB    %00000000
        DEFB    %01000010
        DEFB    %01100010
        DEFB    %01010010
        DEFB    %01001010
        DEFB    %01000110
        DEFB    %01000010
        DEFB    %00000000

; $34 - Character: 'O'          CHR$(52)

        DEFB    %00000000
        DEFB    %00111100
        DEFB    %01000010
        DEFB    %01000010
        DEFB    %01000010
        DEFB    %01000010
        DEFB    %00111100
        DEFB    %00000000

; $35 - Character: 'P'          CHR$(53)

        DEFB    %00000000
        DEFB    %01111100
        DEFB    %01000010
        DEFB    %01000010
        DEFB    %01111100
        DEFB    %01000000
        DEFB    %01000000
        DEFB    %00000000

; $36 - Character: 'Q'          CHR$(54)

        DEFB    %00000000
        DEFB    %00111100
        DEFB    %01000010
        DEFB    %01000010
        DEFB    %01010010
        DEFB    %01001010
        DEFB    %00111100
        DEFB    %00000000

; $37 - Character: 'R'          CHR$(55)

        DEFB    %00000000
        DEFB    %01111100
        DEFB    %01000010
        DEFB    %01000010
        DEFB    %01111100
        DEFB    %01000100
        DEFB    %01000010
        DEFB    %00000000

; $38 - Character: 'S'          CHR$(56)

        DEFB    %00000000
        DEFB    %00111100
        DEFB    %01000000
        DEFB    %00111100
        DEFB    %00000010
        DEFB    %01000010
        DEFB    %00111100
        DEFB    %00000000

; $39 - Character: 'T'          CHR$(57)

        DEFB    %00000000
        DEFB    %11111110
        DEFB    %00010000
        DEFB    %00010000
        DEFB    %00010000
        DEFB    %00010000
        DEFB    %00010000
        DEFB    %00000000

; $3A - Character: 'U'          CHR$(58)

        DEFB    %00000000
        DEFB    %01000010
        DEFB    %01000010
        DEFB    %01000010
        DEFB    %01000010
        DEFB    %01000010
        DEFB    %00111100
        DEFB    %00000000

; $3B - Character: 'V'          CHR$(59)

        DEFB    %00000000
        DEFB    %01000010
        DEFB    %01000010
        DEFB    %01000010
        DEFB    %01000010
        DEFB    %00100100
        DEFB    %00011000
        DEFB    %00000000

; $3C - Character: 'W'          CHR$(60)

        DEFB    %00000000
        DEFB    %01000010
        DEFB    %01000010
        DEFB    %01000010
        DEFB    %01000010
        DEFB    %01011010
        DEFB    %00100100
        DEFB    %00000000

; $3D - Character: 'X'          CHR$(61)

        DEFB    %00000000
        DEFB    %01000010
        DEFB    %00100100
        DEFB    %00011000
        DEFB    %00011000
        DEFB    %00100100
        DEFB    %01000010
        DEFB    %00000000

; $3E - Character: 'Y'          CHR$(62)

        DEFB    %00000000
        DEFB    %10000010
        DEFB    %01000100
        DEFB    %00101000
        DEFB    %00010000
        DEFB    %00010000
        DEFB    %00010000
        DEFB    %00000000

; $3F - Character: 'Z'          CHR$(63)

        DEFB    %00000000
        DEFB    %01111110
        DEFB    %00000100
        DEFB    %00001000
        DEFB    %00010000
        DEFB    %00100000
        DEFB    %01111110
        DEFB    %00000000

.END                                ;TASM assembler instruction.