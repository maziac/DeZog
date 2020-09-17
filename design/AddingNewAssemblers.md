# Adding a New Assembler

This file is about adding a new assembler list file parsing.
At the moment of writing 3 different Z80 assemblers are supported: sjasmplus, z80asm and z88dk.

This dcument describes what need to be done to add an parser for another assembler.

# Background

DeZog uses the assemblers list file as main source of information about the debugged program.

The main extracted information is:
- source code line to address association
- labels and their values
- label to source code line association

Apart from this it also looks for instrumentation in the comments to extract
- watchpoints
- asserts
- and logpoints


# Two Modes

To make it even more complicated there exist two modes when parsing a list file:
1. ListFile-Mode: The list file is the source. I.e. when stepping through a program the list file itself is shown and you are stepping through the list file no matter from what sources the list file was generated
2. Sources-Mode: The list file is used to find the association between the source files (your assembler files) with the step addresses. When you step through the code you step through your source files.

The mode is determined by the "srcDirs" launch.jso parameter. This is an array which contains the directories where source file can be located. If the array has length 0 (is empty) ListFile-Mode is assumed. If directories are given Sources-Mode is assumed.


# Process

The way this information is extracted is a 2 step process:
1. The list file is analyzed.
	- Labels (normal and EQU) are extracted
	- An array is created which holds for each address:
		- the address
		- the original line
		- the last label
2. The list file is analyzed a 2nd time. This time the source file line/address association is extracted. It also anaylzes the 'includes'.
3. The common format is analyzed and the information is extracted

Step 3 is common for all assemblers.
Step 2 is not done in the ListFile-Mode.


## Parsing

The list file is not the best format for parsing. Different assemblers have different peculiarities that makes it sometimes difficult to extract the right information.
E.g. it is often not simple to determine the right include files and includes inside included files to establish the correct address to file/line association.

In particular here are some problem areas one need to take care of:
- Macros (start and end)
- local labels
- modules (labels). (Start and end)
- includes (start and end, includes inside includes)
- determine EQUs
- determine the number of bytes used in one line of the list file


## Parsing for Labels and Addresses

Is done in ```parseLabelAndAddress(line: string)```.
It is called subsequently for each line of the list file.

You need to extract the label and address. I.e. all labels at the start of the line (normally ended by a ":") and all EQUs and their value.
Note: You may omit EQUs if they are too complicated to parse, e.g. if these contain are calculation of other labels.

Then call ```addLabelForNumber(value: number, label: string)```` to associate the label (or EQU) name with the value (address or number).
If your assembler can differentiate local and global labels you should also add the LabelType.

You can have a look at sjasmplus to see how the different types are used.
Default is the GLOBAL type.
Then if your assembler supports modules you would use NORMAL for your labels and LOCAL if it is a local label (e.g. a label started with a dot '.').

If your assembler supports modules than you also need to call ```moduleStart(name: string)``` when the module starts and ```moduleEnd()``` when it ends.
This is required to create correct label names, i.e. the module name is automatically added to the label name that you pass in ```addLabelForNumber```.


To set the number of associated bytes with one address you need to call ```addAddressLine(address: number, size: number)```.
I.e. in your list file you should parse the address and then count the number of following bytes and pass both to the ```addAddressLine```.
Calling this function is necessary to associate the label with the address.


## Parsing for Sources

In the second pass the file names and line numbers are associated with the addresses.
This is done in ```parseAllFilesAndLineNumbers```.
It calls ```parseFileAndLineNumber(line: string)``` for each line.

```parseFileAndLineNumber(line: string)``` has to determine the include file start and end by calling ```includeStart(fname)``` and ```includeEnd()```.
And it has to determine the line number in the file.
Note: this is not the line number of the list file.
The list file may include other files. It's the line number of those files we are after.
Call 'setLineNumber' with the line number to set it. Note that source file numbers start at 0.


# Common Format

The parser has to generate this data per list file line:
- address
- file
- line number

Note: For one line multiple such records might be created. E.g. an instruction "LD A,5" consist of 2 bytes but only one line in the list file.

Additionally labels are created. There are normally 2 sources for labels:
- labels at the start of a line. The value is here the current address value.
- labels extracted from EQU assignments. These need to be parsed and evaluated. Evaluation of EQUs can become very complex. Instead you could also query another file, e.g. a map or symbol file which most assemblers produce as well and which contain already calculated labels.

A label contains the following info:
- name
- value (a number)


# WPMEM, ASSERT, LOGPOINT

You don'tneed to take care of those.
These are normally automatically parsed.
Unless you override ```parseAllLabelsAndAddresses```. In that case take care to call ```parseWpmemAssertLogpoint```for every line.


# Testing

For testing you should prepare an project for your assembler that includes

- 2 nested include files
- a macro that is used somewhere
- a normal label (several labels to test all allowed characters/forms)
- a local label (if supported)
- an EQU label
- modules (2 nested modules), if modules are supported

Then generate a list file.
The list file should be stored under src/tests/data/...
Store also the assembler project somewhere there. Although it is not required for testing it might help if you need to re-create the list file some time later.

Create unit tests that:
- check the labels and their values
- check the label locations, both for list ListFile-Mode and Sources-Mode.
	- local labels
	- normal labels
	- module labels (concatenated labels)
	- EQU values
- association of an address to a file, both for list ListFile-Mode and Sources-Mode.
- association of a file/line number to an address, both for list ListFile-Mode and Sources-Mode.


