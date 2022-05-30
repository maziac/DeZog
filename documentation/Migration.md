This guide will provide some info what to do to update your projects from an earlier version.


# Migrate from DeZog 2.7 to DeZog 3.0

A lot of internals have been changed especially to the use of banks and long addresses.
All labels are now internally represented as long addresses.
Prior to 3.0 there was a mix of 64k and long addresses.
However, this is internally, for the user there should be no visible change.

Also the internal memory models for ZX48, ZX128 etc. have been reworked to use the same base as the new customMemory model.

The definition of a 'customMemory' model was changed in the launch.json.
Please refer to the new structure in the [Usage.md](Usage.md).
The old structure cannot be used anymore and need to be changed.

The new 'customMemory' allows ou to define arbitrary slot ranges and bank switching.

This was all done to allow reverse engineering together with bank switching.

As this is a new feature you don't have to adjust any of your programs.

Please read about it in the [ReverseEngineeringUsage.md](ReverseEngineeringUsage.md'.



# Migrate from DeZog 2.6 to DeZog 2.7

No required updates.

# Migrate from DeZog 2.5 to DeZog 2.6

Major change is the integration of the serial port into DeZog.
This removes the need for the extra program DeZogSerialInterface when connecting to a ZX Next via a serial interface.
Along with this the launch.json parameters for the "zxnext" have been changed:
- "port", "hostname" and "socketTimeout" have been removed.
- "serial" has been added.

For completeness: In the settings the "log.socket" pane has been renamed to "log.transport".
But for most users this shouldn't make any difference.

# Migrate from DeZog 2.4 to DeZog 2.5

No required updates.

# Migrate from DeZog 2.3 to DeZog 2.4

## Unit tests

Unit tests are now fully integrated into the vscode testing API. It is available since vscode v1.60.
Prior to this the "Z80 Unit Tests" extension was required to run unit tests. With version 2.4 no additional extension is required anymore and you should remove the "Z80 Unit Tests" extension.

With this also the command palette commands and the text output for unit tests have been removed completely. Executing tests is now completely done via vscode's UI.

The UNITTEST_INITIALIZE macro is now executed not only once for all unit tests but before each single unit test.

You can setup now more than one unit test configuration in the launch.json.

The unit test Z80 macros have been slightly changed what makes it necessary to update the
[unit_tests.inc](unit_tests.inc) (or the [unit_tests_savannah.inc](unit_tests_savannah.inc)) file.
Other than that all your unit tests should still run. Without any change in configuration you should be able to see the tests if you click on vscode's test icon in the sidebar.

If you are using custom code for your unit tests you should be able to use it without change.
However there is a new option that you can read the currently executed unit test label from your custom code.
With this you could implement different behavior depending on the executed unit test.
See [UnitTest.md](UnitTest.md).



## Expressions

Setting expressions: For years the vscode/debug-adapter was not able to set values in the WACTHes pane. Last month I decided to implement a workaround for this: the 'Expressions' section in the VARIABLES pane. This was bad timing. 4 weeks later with vscode 1.60 the setting of values was also supported by vscode. So I removed the 'Expressions' from the VARIABLES pane again. I.e. also the commands '-addexpr' and '-delexpr' have been removed.
Instead, in the WATCHes pane, you can now right click and select 'Set value' to change the value.

From migration point of view: If you've added '-addexpr' or '-delexpr' to the "commandsAfterLaunch" section of your launch.json file, you would have to remove them.


# Migrate from DeZog 2.2 to DeZog 2.3

No required updates.

# Migrate from DeZog 2.1 to DeZog 2.2

## Required updates

If you are using unit tests you need to update z80-unit-tests to v1.2.0.

# Migrate from DeZog 2.0 to DeZog 2.1

## Required updates

If you use CSpect you need to update:
- Update CSpect to version >= 2.13.0
- Update the [DeZog CSpect Plugin](https://github.com/maziac/DeZogPlugin/releases) to >= 2.0.1


## Help

You will find the TOC for the help now also in the sidebar.
It can be turned off in the DeZog settings.


## The Register Memory View

This view:
![](images/memoryviewer2.jpg)

Does **not start automatically anymore** on each debug session start.

If you want to launch the register memory view every time you start a debug session then add it to the "commandsAfterLaunch" in the launch.json. E.g.
~~~
"commandsAfterLaunch": [
    "-rmv"
]
~~~

Or you manually launch it from the debug console when needed with:
~~~
-rmv
~~~


## WATCHes

One major change in 2.1 was the overworked WATCH window.
Please have a look at chapter [WATCHes](https://github.com/maziac/DeZog/blob/master/documentation/Usage.md#watch) in Usage.md.
Together with sjasmplus the WATCH window can now display STRUCTs.
The syntax has been changed slightly. I.e. the parameters 2 and 3 have been exchanged.
Instead of
~~~
label,count,type
~~~

you have to use
~~~
label,type,count
~~~

now.

And the behavior has changed. DeZog will not anymore assume and display an array by default.
If you need the old behavior you now need to specify the count explicitly.

Furthermore the parameters named 'b' and 'w' for byte and word have been removed.
Simply use the size now instead. I.e. 1 for byte and 2 for word.


# launch.json

zsim is much faster now and has got a few more configurations:
- "defaultPortIn": The default value that is read if the read port is unused. Formerly this was always 0xFF which is still the default.
- "zxInterface2Joy": If enabled the simulator shows 2 joystick controls to simulate ZX Interface 2 joysticks. You can also attach a USB controller.
- "kempstonJoy": If enabled the simulator shows a pad to simulate the Kempston joystick at port 0x1F.
- "zxBorderWidth": The ZX Spectrum border is now simulated as well. The displayed border width in pixels. If set to 0 then no border is displayed.
- "zxBeeper": Experimental audio output of the beeper.
- "limitSpeed": If enabled the simulated CPU performance is throttled to fit the given CPU frequency. This was necessary due to the improved zsim speed.
- "updateFrequency": The update frequency of the simulator view in Hz. Defaults to 10Hz. Possible range is 5 to 100 Hz.


# Migrate your projects from DeZog 1.5 to 2.0

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

"skipInterrupt" and "resetOnLaunch" are no global parameters anymore. They have been moved to the "zrcp" parameters.

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
The command line is:
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


