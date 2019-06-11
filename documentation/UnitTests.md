# Unit Tests

The z80-debug adapter offers the possibility to  execute unit tests.
You can directly run the unit tests or use the [z80-unit-tests](https://github.com/maziac/z80-unit-tests) extension to execute the tests from a test explorer UI.


# Prerequisites

It is recommend to use the sjasmplus assembler but you can also use other assemblers that support macros.

The unit_tests.inc file provides macros in sjasmplus syntax but also in a format that e.g. Savannah's z80asm would understand.


# Usage
In order to use unit tests you must:
1. include the unit_tests.inc file to your sources
2. create the unit tests
3. Provide an initialization routine

## Include unit_tests.inc

Download unit_tests.inc and put
~~~
include "unit_tests.inc"
~~~
to your sources.

## Create Unit Tests

Creating a unit test is easy. A subroutine with a label that start with the prefix "UT_" is recognized as unit test case.

If you use the sjasmplus feature to have hierarchical labels the last part need to start with "UT_".

Here are a few examples of valid unit test label names.
~~~
UT_test1:
	...
	ret

Module1.UT_test2:  ; sjasmplus specific
	...
	ret

  MODULE Mod2  ; sjasmplus specific
UT_test3:
	...
	ret

UT_test4:
	...
	ret
  ENDMODULE
~~~

If you use hierarchical labels you can structure the the tests in test suites and unit tests.
E.g. the example above would result in 2 test suites: "Module1" and "Mod":
~~~
|- UT_test1
|- Module1
|   |- UT_test2
|- Mod2
    |- UT_test3
    |- UT_test4
~~~


### Test Macros

Inside the unit test you should use the provided unit test macros to test for failures [^1].
[^1]: This is very similar to the assertions used in other languages.

There are macros available for various puposes, e.g. to test the registers for specific values or a memory location.

Here is the complete list:
- TEST_MEMORY_BYTE addr, value: (addr) == value
- TEST_MEMORY_WORD addr, value: (addr) == value
- TEST_A value: A == value
- TEST_A_UNEQUAL value: A != value
- TEST_REG reg, value: reg == value, with reg = B|C|D|E|H|L
- TEST_REG_UNEQUAL reg, value: reg != value, with reg = B|C|D|E|H|L
 - TEST_DREG dreg, value: dreg == value, with dreg = BC|DE|HL|IX|IY
 - TEST_DREG_UNEQUAL dreg, value: dreg != value, with dreg = BC|DE|HL|IX|IY
 - TEST_DREGS_EQUAL dreg1, dreg2: dreg1 == dreg2, with dreg1/2 = BC|DE|HL|IX|IY
- TEST_DREGS_UNEQUAL dreg1, dreg2: dreg1 != dreg2, with dreg1/2 = BC|DE|HL|IX|IY
- TEST_STRING addr, string, term0: Compares 2 strings (addr and string)
- TEST_FLAG_Z: Z flag is set
- TEST_FLAG_NZ: Z flag is not set

If the code in the macro is executed and the condition would fail the whole unit test is aborted and failed.
If the condition is fulfilled the code execution carries on after the macro and you can test further conditions.

Example:
~~~
UT_mytest2:
	ld a,5
	call multiply_a_by_3
	TEST_REG C, 15

	ld a,0
	call multiply_a_by_3
	TEST_REG C, 0
	ret
~~~
This simple example test the subroutine 'multiply_a_by_3' which hypothetically takes A, multiplies it by 3 and returns the result in C. If A is 5 it should result in 15 and if A is 0 it should be 0.

Please note that if you run a unit test case in debug mode the debugger will stol execution at exactly the macro that failed.


### Special Test Macros

There exist a few more macros for special usage.

The macro DEFAULT_REGS stores some predefined values into all main registers (A, BC, DE, HL).
In conjunction with the TEST_UNCHANGED_... macro this can be used to check if a certain register has not changed its value.
I.e. you can test that the tested subroutine has no sideeffect and doesn't change some register by accident.

Here is an example:
~~~
UT_mytest2:
	DEFAULT_REGS
	ld hl,mylabel
	call my_subroutine
    TEST_UNCHANGED_BC_DE
	...
	ret
~~~
It check that 'my_subroutine' does not change the values of B, C, D, and E.
It however doesn't care about changing A or HL.

There are a few macros defined for testing:
- TEST_UNCHANGED_BC
- TEST_UNCHANGED_DE
- TEST_UNCHANGED_HL
- TEST_UNCHANGED_BC_DE
- TEST_UNCHANGED_BC_DE_HL
- TEST_UNCHANGED_A
- TEST_UNCHANGED_B
- TEST_UNCHANGED_C
- TEST_UNCHANGED_D
- TEST_UNCHANGED_E
- TEST_UNCHANGED_H
- TEST_UNCHANGED_L


Furthermore the macro USE_ALL_REGS fills all registers with predefined values A, BC, DE, HL, IX, IY and the shadow registers.
THis macro can be used in conditions that you want to test that your subroutine does not use one of the registers by accident. Or in other words: with using this macro you make sure that no register has any meaningful value by accident.




# Misc




# Notes
- launch.json:
	- topOfStack doesn't need to be set. Is overwritten by internal stack for unit tests.
	- codeCoverage: can be set otherwise false.
- Command palette: Enable/disable code coverage during debugging.
- Erklären, dass auch bei WPMEM gestoppt wird, oder wenn ein Test zu lange dauert. Timeout Value erklären.
