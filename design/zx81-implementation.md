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


# References - games/graphics mode
- Standard graphics: ["Battlestar Galactica"](https://archive.org/details/Battlestar_Galactica_1982_Ch._Zwerschke)
- Pseudo hires, chroma81: ["Against The Elements"](http://www.fruitcake.plus.com/Sinclair/ZX81/NewSoftware/AgainstTheElements.htm])
- CHR$128, chroma81: [Alien Attack](https://sinclairzxworld.com/viewtopic.php?t=5427)
- True hires: [Forty Niner](https://archive.org/details/Forty_Niner_19xx_Cosmic_Cockerel)
- WRX: [Bowling](https://www.rwapsoftware.co.uk/zx81/zx81_software.html)
- ARX: [arx_hangman, arx_sampler.zip](https://www.sinclairzxworld.com/viewtopic.php?t=5448&start=20)
