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
- assertions
- and logpoints


# Two Modes

To make it even more complicated there exist two modes when parsing a list file:
1. ListFile-Mode: The list file is the source. I.e. when stepping through a program the list file itself is shown and you are stepping through the list file no matter from what sources the list file was generated
2. Sources-Mode: The list file is used to find the association between the source files (your assembler files) with the step addresses. When you step through the code you step through your source files.

The mode is determined by the "srcDirs" launch.json parameter. This is an array which contains the directories where source file can be located. If the array has length 0 (is empty) ListFile-Mode is assumed. If directories are given Sources-Mode is assumed.


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


# WPMEM, ASSERTION, LOGPOINT

You don't need to take care of those.
These are normally automatically parsed.
Unless you override ```parseAllLabelsAndAddresses```. In that case make sure to call ```parseWpmemAssertionLogpoint```for every line.

If your assembler allows other one-line comment identifiers than ";", e.g. "//", then you need to override ```getComment```.


# Long Addresses

DeZog can handle ['long addresses'](../documentation/Usage.md#long-addresses-explanation).
Long addresses contain the address information 0x0000-0xFFFF plus the banking information (if there is one).

If your assembler has no special banking support you don't have to take of this.
But if it is capable you should store the addresses with banking information.

DeZog uses a very simply format to store the banking information inside the address:
~~~
longAddress == ((bank+1) << 16) + address
~~~

I.e. an address < 0x10000 is always an address without banking information.
Everything >= 0x10000 contains banking information.

So if your assembler gives you the information what bank an address is you should use it.
Use the 'createLongAddress' to create a long address from bank and address.


# Make DeZog aware of the new Assembler

Implementing the new label parser class is not enough to take the new assembler parsing into use.
It is also necessary to adjust some code to make sure that the new classes are used.
And you might also use special parameters for your assembler, so you need to provide those, too.

setting.ts:
- Add a new interface for your assembler e.g. have a look at SjasmplusConfig, Z80asmConfig or Z88dkConfig.
The interface need to be derived from AsmConfigBase which provide the basic information available to all assemblers.
- Add the new interface to SettingsParameters. Just beneath the other assemblers.
- In SettingsParameters.Init make sure that all of your parameters are initialized with some default value. I.e. everything that the user left undefined should get a reasonable default here.
- Update the ```GetAllAssemblerListFiles```function with the new assembler.
- Make sure that all paths are converted to absolute paths. I.e. use ```Utility.getAbsFilePath(string)``` to convert from relative path to absolute.
- If you have special settings that should be defined by the user (e.g. for z88dk the 'mapFile') then you can check in ```CheckSettings```. Note: the list file 'path' is already checked automatically.


package.json:
All of your assembler parameters (declared in setting.ts) should also get a description in the package.json.
You also need to define the base parameters from AsmConfigBase here.


# Testing

For testing you should prepare a project for your assembler that includes

- 2 nested include files
- a macro that is used somewhere
- a normal label (several labels to test all allowed characters/forms)
- a local label (if supported)
- an EQU label
- modules (2 nested modules), if modules are supported
- lines with WPMEM, ASSERTION and LOGPOINT. Although you normally you don't need to implement something special to support these keywords it needs to be tested at least that the keywords are correctly found.

Then generate a list file.

Create unit tests that:
- checks the labels and their values
- checks the label locations, both for list ListFile-Mode and Sources-Mode.
	- local labels
	- normal labels
	- module labels (concatenated labels)
	- EQU values
- checks the association of an address to a file, both for list ListFile-Mode and Sources-Mode.
- checks the association of a file/line number to an address, both for list ListFile-Mode and Sources-Mode.
- checks occurrence of at least one WPMEM
- checks occurrence of at least one ASSERTION
- checks occurrence of at least one LOPGPOINT


Although only a list file is required for testing it is best to store the whole assembler project so that it easier to re-create the list file e.g. if you want to extend the test.
The different assembler projects are store here:
.../tests/data/labels/projects
Your project will generate a list file which is then referenced in your test.
The project and the list file will stored to git.

The actual tests for each assembler are found here:
.../tests/labelsXXX.tests.ts
where XXX is the name of your assembler.


## macOs/Linux/Windows

Please test parsing/debugging on macOs (or Linux) and on Windows.
Reason is the different line endings used in both. macOs/Linux uses "\\n" whereas Windows uses "\\r\\n".
Sometimes this generates trouble.

Internally DeZog will use only forward slashes as forward slashes are correctly interpreted by Windows as well.
However the outside world (vscode, launch.json, the asm-files) might use Windows backslash convention.
Therefore every path coming from those should be converted first. This is done with the ```UnifiedPath.getUnifiedPath``` function.
For include file names this already happens if you use the ```includeStart```method.
Communication with vscode is also handled.
The only thing you still need to take care are the paths in the launch.json file.
Make sure to convert all of the paths (e.g. 'path') in your assembler settings with the ```getUnifiedPath``` function.



# Don't forget the documentation

Document the new assembler configuration inside [Usage.md](../documentation/Usage.md) in the chapter "Assembler Configuration".
Please also don't forget to update the table in "Assemblers and Labels".

