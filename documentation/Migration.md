
# Migrate your projects from DeZog 1.5 to 2.0

This guide will provide some info what to do to update your projects for use with DeZog 2.0.

## launch.json

A typical launch.json still looks like:

~~~
"configurations": [
        {
            "type": "dezog",
            "request": "launch",
            "name": "Your Config Name",
            "remoteType": "zsim",
            //"remoteType": "zrcp",
            //"remoteType": "cspect",
            "zsim": {
            },
            "sjasmplus": [
                {
                    ...
                }
            ],
            "rootFolder": "${workspaceFolder}",
            "topOfStack": "stack_top",
            "load": "your-program.nex",
        },
~~~

But there are changes inside.

### zsim

~~~
	"zsim": {
		...
	}
~~~

Main change here is that DeZog doesn't make any assumptions any more.
If you want to use a certain feature you have to mention/enable it otherwise it will not be enabled. I.e. there is no implicit enabling of features.

There are also new and modified parameters:

- "Z80N": unchanged
- "loadZxRom": unchanged
- "zxKeyboard": unchanged
- "visualMemory": boolean. Will use the "memoryModel" for display.
- "ulaScreen": unchanged
- "memoryPagingControl": removed. Use memory model instead.
- "tbblueMemoryManagementSlots": removed. Use memory model instead.
- "cpuLoadInterruptRange": unchanged
- "vsyncInterrupt": unchanged

New:
- "memoryModel": "RAM", "ZXNEXT" etc. Defines the memory paging model. "RAM" = no paging.
- "customCode": This is for implementing custom peripherals, see [zsimPeripherals.md](zsimPeripherals.md).


### zrcp (ZEsarUX)

"skipInterrupts" is not a global configuration anymore. It belongs to the "zrcp" parameters now.


### sjasmplus

~~~
	"sjasmplus": [
		{
			...
		}
	],
~~~



## Z80 unit tests

You need to exchange the unit_test.inc file with this one [unit_tests.inc](unit_tests.inc) (or this one [unit_tests_savannah.inc](unit_tests_savannah.inc) for Savannah's z80asm assembler).

The unit tests have been simplified. There are still a few macros left for testing but the majority has been removed.
For these macros you should use ASSERTION instead.

E.g. instead of
~~~
	TEST_DREG DE, 0x1234
~~~

you should use
~~~
	nop ; ASSERTION DE == 0x1234
~~~

ASSERTIONs allow more flexible checks. E.g. you can also use
~~~
	nop ; ASSERTION DE < 0x1234
~~~

Or even
~~~
	nop ; ASSERTION (A == 1) && (DE < 0x1234)
~~~

Note the 'nop'. Although it is not essential it will make your life easier to find the right (failed) ASSERTION in case you use several consecutive assertions:
~~~
	nop ; ASSERTION BC != DE
	nop ; ASSERTION A == 10
	nop ; ASSERTION DE == 0x1234
~~~



The unit tests will automatically enable ASSERTION (and WPMEM and LOGPOINT).



