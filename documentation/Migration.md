# Migrate your projects from DeZog 1.5 to 2.0

This guide will provide some info what to do to update your projects for use with DeZog 2.0.


## Required updates

If you use any of these you need to update:

- sjasmplus: Update to >= 1.18.0.
- CSpect:
    - Update to version >= 2.13.0
    - Update the [DeZog CSpect Plugin](https://github.com/maziac/DeZogPlugin/releases) to >= 2.0.0
- ZEsarUX: Update to >= 9.1
- ZXNext:
    - Update the dezogif (i.e. [enNextMf.rom](https://github.com/maziac/dezogif/releases) to >= 2.0.0
    - Update [DeZogSerialInterface](https://github.com/maziac/DeZogSerialInterface/releases) to >= 1.1.1


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

"skipInterrupts" and "resetOnLaunch" are no global parameters anymore. They have been moved to the "zrcp" parameters.

### sjasmplus

This is one of the main changes: DeZog doesn't use the list file of sjasmplus anymore.
Instead it uses the SLD file.
sjasmplus includes special enhancements for DeZog. With the SLD format it is possible to use the ['long addresses'](Usage.md#long-addresses-explanation) feature which allows to debug much bigger projects that would otherwise not fit in 64k.

~~~
	"sjasmplus": [
		{
			"path": "your-sld-file.sld"
		}
	],
~~~

To create such a file you need at least sjasmplus version 1.18.0.
The commandline is:
~~~
sjasmplus --sld=your-sld-file.sld --fullpath your-source.asm
~~~

Of course, you need to exchange "your-..." with your file names.
You can still add other options like the creation of a list or labels file but these files are no longer used by DeZog.


Inside one of your asm files you need to set a few more options:
- Use ```DEVICE something``` to set a device. Otherwise the SLD file will be empty. You can e.g. use ```ZXSPECTRUM48```, ```ZXSPECTRUM128```, ```ZXSPECTRUMNEXT``` or for a non-spectrum pure Z80 system without any banking: **```NOSLOT64K```**
- Add a line ```SLDOPT COMMENT WPMEM, LOGPOINT, ASSERTION``` to use DeZog's WPMEM, LOGPOINT and ASSERTION features. If ```SLDOPT ...``` is omitted sjasmplus will remove the info from the SLD file.

E.g. you could start your main.asm with:
~~~asm
    DEVICE ZXSPECTRUMNEXT
    SLDOPT COMMENT WPMEM, LOGPOINT, ASSERTION
~~~

or
~~~asm
    DEVICE NOSLOTDEVICE
    SLDOPT COMMENT WPMEM, LOGPOINT, ASSERTION
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

Together with this change DeZog supports ASSERTIONs now also for ZEsarUX.


