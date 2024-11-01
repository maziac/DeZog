# ZX81
This document describes how the ZX81 "zsim" configuration can be used.

# zsim
The internal simulator "zsim" can be used for the ZX81.
The easiest thing to do so is by using a "preset", e.g.
~~~json
"zsim": {
	"preset": "zx81"
	...
}
~~~

This will configure an 56k ZX81, i.e. a ZX81 with all available RAM, so that it can also show ARX graphics.
What it does is to set the following zsim properties:
~~~json
	"memoryModel": "ZX81-56K",
	"cpuFrequency": 3250000,
	"defaultPortIn": 0xFF,
	"zxKeyboard": "zx81",
	"ulaScreen": "zx81",
	"ulaOptions": {
		"hires": true,
        "borderSize": 10,
        "chroma81": {
            "available": true,
            "enabled": false,
            "mode": 0,
            "borderColor": 15
        },
        "debug": false
  	},
    "zx81LoadOverlay": true
~~~

If you use the preset you can easily override the defaults, e.g. to define a 16k ZX81 use:
~~~json
	"preset": "zx81",
	"memoryModel": "ZX81-16K",
~~~

# Boot the ROM
If you want to start the ZX81 without any program, i.e. just turn it on, don't use any "load..." properties. Instead set the "execAddress" to 0.
~~~json
"execAddress": "0"
~~~

![](images/zx81-zsim/boot.jpg)

Note:
- The "execAddress" property is a general property, so it is outside "zsim".
- In fact you could even skip the "execAddress" property, as it's default is 0 anyway.

# Load a program
DeZog can load .p, .p81 and .81 files (which are more or less the same anyway) with the "load" property, e.g:
~~~json
"load": "Galactica.p"
~~~
Additionally you can also load raw data with the "loadObjs" property.

You can as well load a file by entering `LOAD "<filename>"` in the ZX81.
This is only enabled if "zx81LoadOverlay" is set to true (which is the default for "preset": "zx81").
In that case the CPU's program counter is checked. When it tries to load from tape the loading from file is injected.

For clarification: if you load with "load" in the launch.json the "zx81LoadOverlay" functionality is not used and you don't need to have the flag enabled.

If you use "load" any successing `LOAD` of a .p file will be done from the same folder as you used for "load".
If you don't use "load" the `LOAD` will search for the file in the workspace of vscode.

It is also possible to use folders within the `LOAD` command and you can give the filename with or without extension, e.g. `LOAD "FOLDER/GAME"` would load the file `GAME.P` from `FOLDER`.
If you do not enter a filename, e.g. `LOAD ""` then the first (.p) file in the folder will be loaded.

You can also use globbing/wildcards. E.g. `LOAD "WR*/**/BOW*"` can result in loading the file from path "wrx/sub/bowling.p".

Note:
- Globbing is done for `LOAD "..."` but not for "load" in launch.json.
- `LOAD` also supports the load-address syntax. E.g. `LOAD "MUNCHER.UDG;8192"` will load the raw data file MUNCHER.UDG to address 8192.
- If you try to `LOAD` data into ROM. The LOAD routine will not fail but the ROM is unchanged. This is different from using "load" in "launch.json". The "load" is run in debugger context whereas the LOAD is from inside the ZX81 simulation and there ROM is read-only.
- The file pattern matching is case insensitive.

# Saving
From the zsim/ZX81 you can save data by using the ZX BASIC SAVE command.
E.g.
~~~
SAVE "MYPROGRAM"
~~~
This will save the basic program to the file "MYPROGRAM.P". I.e. if you omit an extension ".P" is added.
The file is saved into the same folder you used in "load". If you haven't used "load" in "launch.json" then the file is save in the workspace folder.
If a file with the same name already exists it will be renamed with a suffix that consists of a number counting up.
E.g. "MYPROGRAM.P.1"

You can not only save basic programs but also memory areas. The syntax is:
~~~
SAVE "MYDATA.DAT;<address>,<length>"
~~~

Eg. `SAVE "THEROM.DAT;0,8192` will save the ZX81 ROM to file "THEROM.DAT".

Note: To save a memory area you can achieve very much the same by using the "DEBUG CONSOLE" and entering `-ms <address> <size> <filename>` which saves the memory block into the temp directory.


# ULA (The screen display)
The ULA was the Hw/chip that, together with the CPU, was responsible for the video generation.
It worked closely together with the Z80 CPU to generate the video signal.
For details here are some references:
- https://k1.spdns.de/Vintage/Sinclair/80/Sinclair%20ZX80/Tech%20specs/Wilf%20Rigter%27s%20ZX81%20Video%20Display%20Info.htm
- https://8bit-museum.de/heimcomputer-2/sinclair/sinclair-scans/scans-zx81-video-display-system/
- https://oldcomputer.info/8bit/zx81/ULA/ula.htm

The simulator is capable of 2 different systems to display video.
Both simulate the timing as much as possible enabling the simulator to display hires graphics.
You can choose between modes by setting "hires" to true or false (default is true).
~~~json
"ulaOptions": {
	"hires": true/false
}
~~~
You can simulate pseudo-hires, chr%64/chr$128, hires (wrx, arx) and non-hires games/programs with "hires" set to "true".
Setting "hires" to false can be an advantage when debugging/developing non-hires games.
If "hires" is false the dfile (the video screen) is decoded by "zsim" directly.
The advantage is that any change in the screen is immediately visible as soon as the byte is added to the dfile.
I.e. you can see the changes while your code is writing to the dfile and you are stepping through it.
If "hires" is true, any changes would become visible only when the Z80 software takes care of the video generation.

To visualize this a little bit, here is a screenshot of the hires game ["Against The Elements"](http://www.fruitcake.plus.com/Sinclair/ZX81/NewSoftware/AgainstTheElements.htm]):
![](images/against-write-total.jpg)
The current write position is where the bottom black line ends.
When single stepping this changes as more bytes are written one by one:
![](images/against-write-1.jpg)
![](images/against-write-2.jpg)
![](images/against-write-3.jpg)
![](images/against-write-4.jpg)
![](images/against-write-5.jpg)

If "hires" is set to false you will always see a standard screen independent of the exact vertical and horizontal timing.

So it depends:
If you are developing a standard graphics game then `"hires": false` is the recommended choice.
If you are developing a hires game you have to use `"hires": true`, of course.

Note: To simulate ARX hires graphics you need to use a memory model that enables RAM in the area 0x2000-0x3FFF, i.e. "ZX81-56K".

## ulaOptions
"ulaOptions":
~~~json
  {
    "hires": true,
    "borderSize": 10,
    "screenArea": {
        "firstX": 54,
        "lastX": 330,
        "firstY": 46,
        "lastY": 258
    },
    "lines": [
        {
            "x1": 0,
            "x2": 1000,
            "y1": 55,
            "y2": 55,
            "color": "green"
        }
    ],
    "showStandardLines": true,
    "chroma81": {
        "available": true,
        "enabled": false,
        "mode": 0,
        "borderColor": 15,
        "colourizationFile": ""
    },
    "debug": false
  }
~~~

Please note that you cannot use "borderSize" and "screenArea" together. For tandard programs the "borderSize" might be easier to use. If you need more fine-grained control use the "screenArea".

### "hires"
If true the generation of the screen output by the cpu is simulated. This allows to display hires programs. If false the ZX81 dfile is converted directly into screen graphics. This can be an advantage when debugging a non-hires game.

Defaults to true.

### "debug"
If true a gray background is shown for the screen areas without output. Makes a difference for collapsed dfiles, i.e. only for ZX81 with 1-2k memory. If "chroma81" is selected it also initializes the chroma81 RAM (0xC000-0xFFFF) to 2 colors. Otherwise you might not see anything initially if ink and paper color are equal (i.e. 0).

Defaults to false.

#### Collapsed dfile
In a ZX81 with 1-2k RAM the dfile is collapsed, i.e. it uses only the full width of a line if necessary. If the line does not contain anything no RAM is used for it.
In zsim this can be visualized (in standard and hires mode) with the "debug" option.
If "debug" is true, everything that is not output to the screen is gray.

Here is the display of a ZX81 with only 1k RAM:
![](images/collapsed-dfile.jpg).

# borderSize
Select the pixel size you would like to see around a standard ZX81 display.
"Standard" means a display that you would get from the ZX81 BASIC. I.e. without any tricks to achieve higher quality graphics like arx, wrx or using different timings.
The "standard" position and size used is:
(x=64, y=56, w=256, y=192)
So, by setting "borderSize" you get (x=64-borderSize, y=56-borderSize, w=256+borderSize, y=192+borderSize)

Defaults to 10.

# screenArea
With "screenArea" you can set the displayed screen area.
You have more fine-grained control as with "borderSize" as you can change each parameter independently of the others.

Here is a screenArea that shows everything, also the data written during a HSYNC.
~~~json
    "screenArea": {
        "firstX": 0,
        "lastX": 413,
        "firstY": 0,
        "lastY": 300
    }
~~~

Defaults to:
~~~json
    "screenArea": {
        "firstX": 54,
        "lastX": 330,
        "firstY": 46,
        "lastY": 258
    }
~~~

# lines
This is a debugging feature.
It allows to draw fixed lines on top of the screen area.
You can use to mark a position and to easily verify that your program's output is matching.
To position a vertical and a horizontal line for the center, use:
~~~json
    "lines": [
        {
            "x1": 0,
            "x2": 1000,
            "y1": 152,
            "y2": 152,
            "color": "red"
        },
        {
            "x1": 192,
            "x2": 192,
            "y1": 0,
            "y2": 1000,
            "color": "red"
        }
    ]
~~~

![](images/lines-crosshair.jpg)

Defaults to [] (empty).

# showStandardLines
If enabled and if "hires" is enabled a few standard lines are drawn.
Example ([25thanni.p](https://bodo4all.fortunecity.ws/zx/25thanni.html)):
![](images/standard-lines.jpg)

The yellow lines show the standard border. The red line shows the start of the HSYNC pulse.


### Chroma 81 support
"chroma81": Supports the chroma81 (see [Chroma 81 Interface](http://www.fruitcake.plus.com/Sinclair/ZX81/Chroma/ChromaInterface.htm)).
    - "available": Attaches the chroma81. Now it can be enabled/disabled via port 0x7FEF.
        - "enabled": The initial state of the chroma81.
        - "mode": The initial color mode (0/1) of the chroma81.
        - "borderColor": The initial border color: 0-15 (like spectrum colors). Defaults to 15 (bright white).
        - "colourizationFile": You can enter here the file path of your colourization file. See [Colors with a colourization file](#colors-with-a-colourization-file).

# Modding
Although not directly related to debugging you can use DeZog very easily to mod the graphics of ZX81 games.
Here as an example "Battlestar Galactica":

The game with normal graphics, using the standard ZX81 charset:
![](images/galactica-standard-charset.jpg)

Here with a modded, custom charset:
![](images/galactica-custom-charset.jpg)

And here with added colors:
![](images/galactica-custom-charset-colored.jpg)


Of course, the changes you can do with this are limited as characters are re-used for other purposes (e.g. the "O" in "SCORE" which is also a meteor in the game).
But on the other hand it is a very easy change.

For the character set changes the only thing you need to do is to overwrite the ROM charset with your custom one.
You do it with a "loadObjs" like this:
~~~json
"loadObjs": [
	{	// Overwrite the charset in ROM
		"path": "galactica_chars.bin",
		"start": "0x1E00"
	}
]
~~~

As the ROM can be easily overwritten by DeZog it replaces all original bytes (characters) with that from galactica_chars.bin.

To create galactica_chars.bin you can use a e.g. a hex editor, it's size should not exceed 512 bytes.

More comfortable you could also use an assembler like sjasmplus to generate the bin file.

Here is the full [launch.json](extra/launch.json) for "Battlestar Galactica".

## Generate a custom charset with sjasmplus
[galactica_chars.asm](extra/galactica_chars.asm) holds the assembler code for a modified charset.
Use
~~~
sjasmplus --raw=galactica_chars.bin [galactica_chars.asm](extra/galactica_chars.bin)
~~~
to convert it into a a binary galactica_chars.bin.

You can use it (as shown above) in "loadObjs".

The assembler code for the original charset can be found here: [zx81-standard-chars.asm](extra/zx81-standard-chars.asm).

Here is the example for the modified "I" which is turned into a rocket:
~~~asm
; 0x2E: 'I', modified: Rocket
        DEFB    00001000b
        DEFB    00011100b
        DEFB    00011100b
        DEFB    00011100b
        DEFB    00011100b
        DEFB    00111110b
        DEFB    00101010b
        DEFB    00101010b
~~~
Original:
~~~asm
; 0x2E: 'I'
        DEFB    00000000b
        DEFB    00111110b
        DEFB    00001000b
        DEFB    00001000b
        DEFB    00001000b
        DEFB    00001000b
        DEFB    00111110b
        DEFB    00000000b
~~~

## Generate custom colors
### Colors with "loadObjs"
[galactica_colors.asm](extra/galactica_colors.asm) holds the assembler code for a custom colors for "Battlestar Galactica".
Use
~~~
sjasmplus --raw=galactica_colors.bin galactica_colors.asm
~~~
to convert it into a a binary [galactica_colors.bin](extra/galactica_colors.bin).

You can use it in "loadObjs".
~~~json
"loadObjs": [
    ...,
	{	// Write colors to RAM
		"path": "galactica_colors.bin",
		"start": "0xC000"   // Chroma 81 address
	}
]
~~~

Furthermore you need to enable the Chroma 81:
~~~json
"loadObjs": [
    "ulaOptions": {
        "chroma81": {
            "available": true,
            "enabled": true,
            "mode": 0,
            "borderColor": 15
        }
    }
]
~~~

Examplarily here is the color code for the rocket:
~~~asm
; $2E - Character: 'I' / Rocket         CHR$(46)
    DEFB $F9,$F9,$F9,$F9,$F9,$F9,$F9,$F9    ; blue on white
~~~

You define 8 colors for the 8 bytes a character is made of.
In this example all are the same.
The upper 4 bits are the background (PAPER) color, F = bright white.
The lower 4 bits are the foreground (INK) color, 9 = bright blue.

### Colors with a colourization file
You can get a lot of colourization files [here](http://www.fruitcake.plus.com/Sinclair/ZX81/Chroma/ChromaInterface_Software_ColourisationDefinitions.htm)
To use them you need to enable the Chroma 81:
~~~json
"loadObjs": [
    "ulaOptions": {
        "chroma81": {
            "available": true,
            "enabled": true,
            "mode": 0,
            "borderColor": 15,
    		"colourizationFile": "ZX80_Kong.col"
        }
    }
]
~~~

In this setup the DeZog will enable the Chroma81 and will also load the colourization file.
You don't need a ZX81 loader program for this to work.

# CPU frequency
The original ZX81 runs at 3.25 Mhz.
This is also the default in zsim if `"preset": "zx81"` is chosen.
However, if you have a fast computer then you can adjust the frequency and get a faster simulation.
E.g.
~~~json
	"cpuFrequency": 30000000,
~~~
will set the frequency to 30 Mhz.
Of course, if the simulator is able to reach the speed depends on the capabilities of your computer.
With a mac mini M2 you can expect to achieve around 7 Mhz at least.
I.e. you can double the speed of the ZX81.
Sometimes this can be handy, if computation in the ZX81 takes a long time.
All the ULA timing depends on the t-states only, i.e. it works independent of the cpu frequency.
Thus also the video output simply happens faster.

Another way to let the simulator run faster is to use the general "limitSpeed" property.
This is true by default and limits the execution speed to the Z80 cpu frequency.

If "limitSpeed" is set to false, the simulation will always run at maximum speed.

Note: If the simulation speed is not able to cope anymore with the cpu frequency the CPU Load indication will turn to yellow.
![](images/cpuload-yellow.jpg)

# The Keyboard
Set
~~~json
	"zxKeyboard": "zx81"
~~~
to show the keyboard:
![](../../html/images/zx81_kbd.svg)

The keys on the keyboard can be turned on/off by clicking with the mouse.
You can also just use you real keyboard to simulate keypresses (note: the simulator view nees to have focus to receive keypresses, i.e. click once inside the simulator view so that it has focus).

The Shift key is mapped to the left Alt key.
But many real key combinations do work as well, e.g. a Shift-2 will generate the ZX81 key sequence Shift-P to create the quote character ".

# Joysticks
To simulate any joystick you can use the "customJoystick".
It will map the keys of a joystick attached to your computer to ports/bits in the ZX81.
Please refer to the description in [Usage.md](../Usage.md).
For "Battlestar Galactica" you could use:
~~~jsonc
    "customJoy": {
        // ZX81: Battlestar Galactica
        "down": { // 6
            "portMask": "0x0801",
            "port": "0x00",
            "bit": "0x10"
        },
        "up": { // 7
            "portMask": "0x0801",
            "port": "0x00",
            "bit": "0x08"
        },
        "fire": { // 0
            "portMask": "0x0801",
            "port": "0x00",
            "bit": "0x01"
        },
        "fire2": { // 9
            "portMask": "0x0801",
            "port": "0x00",
            "bit": "0x02"
        }
    }
~~~
Please note that "Battlestar Galactica" only uses a partial address decoding.


# Attribution
Many thanks to the authors of the shown games/programs:
- ["Against The Elements"](http://www.fruitcake.plus.com/Sinclair/ZX81/NewSoftware/AgainstTheElements.htm]), Paul Farrow
- "Battlestar Galactica", Ch. Zwerschke
- ["25th Anniversary"](https://bodo4all.fortunecity.ws/zx/25thanni.html) (25thanni.p), Bodo Wenzel
