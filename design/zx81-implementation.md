# ZX81


# Supported Graphics Modes
zsim supports number of different ZX81 graphics mode. Apart from the chroma81 all others don't require any flag to be set.

## standard graphics
The standard graphics mode. I=0x1E. A character is taken from the ROM.
Each char is defined by 8 bytes from the ROM.
The ula line counter addresses low the 0-7 address lines, so that each character is made of 8 bytes.

## pseudo hires
The pseudo hires mode. I is switched to point to somewhere in the ROM (high 7 bits).
The ula line counter is set to 0 every line by a (too) short vsync signal.
I.e. efectively each displayed "character" is only 1 pixel high.
Otherwise the same as 'standard graphics'.

## arx
I points to RAM in area 0x2000-0x3FFF. Requires 56k RAM pack. Otherwise like 'standard'.
Was used be defining a different charset every 2 lines (every 64 bytes).

## udg (or chr$64)
I points to area 0x2000-0x3FFF. Otherwise like 'standard'.
Requires additional HW add on with RAM/ROM for the charsets.

## chr$128
I points to area 0x2000-0x3FFF.
Like 'standard graphics' or 'chr$64' but if bit 0 of I is set and bit 7 of the character code (the inverse bit) then 2 * 256 is added to the address to address the upper half of the character set with the inverse characters.
Requires additional HW add on that checks for bit 0 of the I register.

## wrx
The true hires mode. I is outside the ROM area.
The byte is taken from the RAM (I*256+R).
A (simple) HW modification was required.

## chroma 81
Was a HW expansion to colorize the output.

video_addr: Executed address.
character_code = [video_addr & 0x7FFF] & 0x3F

- standard graphic:
    - mode 0: [$C000 + character_code * 8 + ULA_line_counter]
    - mode 1: [video_addr] (The dfile size and the color attributes size is: 24 * 32)
- pseudo hires:
    - mode 0: [$C000 + character_code * 8]
    - mode 1: [video_addr] (The dfile size and the color attributes size is: 192 * 32)
- wrx:
	- displayed_addr = i * 256 + r, not used by chroma81
    - mode 0: [$C000 + character_code * 8]
    - mode 1:  [video_addr] (The dfile size and the color attributes size is usually just 32)

# Implementation of Graphic Modes
There are 2 graphic generators.
One for character graphics (the standard graphics output) and one for pixel graphics.
The first one simply takes the dfile from memory and outputs in on screen.
It does not exactly simulate the video output and the timings.
But as long as only standard graphics are used the output is good enough.

As soon as the ZX81 software uses some "tricks" to get higher resolution graphics this will lead to wrong output.
For this a more accurate simulation of the ZX81 video signal creation exists which supports e.g. pseudo-hires or WRX.

The reason why the simpler mode exists is that it can be advantageous in case of debugging.
In this mode the onscreen characters can be seen as soon as they are placed in the dfile.
In the other mode they would become visible not before the video signal is created.

# Timings
Standard width x height = 256 x 192

The ZX81 has typically around 300 lines (of course, not all are used).
And 207*2=414 pixels in width, including the horizontal blank.
Without hor. blank it is 192*2=384 pixels of which 256 (32*8) are used in standard mode.
Then the left and right borders are 64 pixels each.
For a CRT there were also some areas around the HSYNC pulse that were
not visible. These seem to have been 16-32 pixels. (From youtube videos.)
As default I have chosen a border of 8 pixels around the "normal" screen (x:64-319, y:56-247):
firstX=56, lastX=327, firstY=48, lastY=255.

# References - games/graphics mode
- Standard graphics: ["Battlestar Galactica"](https://archive.org/details/Battlestar_Galactica_1982_Ch._Zwerschke), 16-56k
- Pseudo hires, chroma81: ["Against The Elements"](http://www.fruitcake.plus.com/Sinclair/ZX81/NewSoftware/AgainstTheElements.htm]), 56k
- Pseudo hires: [Forty Niner](https://archive.org/details/Forty_Niner_19xx_Cosmic_Cockerel), 16-56k
- CHR$128, chroma81: [Alien Attack](https://sinclairzxworld.com/viewtopic.php?t=5427), 56k
- WRX: [Bowling](https://www.rwapsoftware.co.uk/zx81/zx81_software.html), 1k
- ARX: [arx_hangman, arx_sampler.zip](https://www.sinclairzxworld.com/viewtopic.php?t=5448&start=20), 56k
