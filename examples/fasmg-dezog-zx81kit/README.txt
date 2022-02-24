
Simple demo program to show assembly and debug process: 

1. Install ZEsarUX (https://github.com/chernandezba/zesarux/releases), VSCode and install DeZog extension inside VSCode

2. In order to compile the example program use the “./fasmg simple-zx81-example.asm”, the output will be the “.p” executable and the “.sld” listing file for DeZog

3. In the example directory launch ZesarUX with the command line “zesarux --enable-remoteprotocol --remoteprotocol-port 10000 --machine ZX81 --tape simple-zx81-example.p”

4. Run VSCode and open the directory of the example program, load the “simple-example.asm” and set a breakpoint for example before writing the screen (after label “displaychar:”), and then “Run with Debug” inside VSCode and after program start press the "Run" in order to allow execution until breakpoint

5. Now if you go to ZEsarUX and press a key you’ll notice that the program will stop inside VSCode on the set breakpoint (note: do not click inside the zesarux window since it will stop execution, probably in the ROM display routinies, but select window with title bar or “alt-tab”)

6. Other than standard VSCode facilities, DeZog offer additional ones as for example the memory inspector with "-mv 0x4009 1024" in the debug console. Please refer to documentation for full features description https://github.com/maziac/DeZog

    
Additional notes: 

- These instructions and the kit itself have been tested on Linux, even if they should for the most part be the same or very similar with other compatible platform available for the tools used

- FasmG and Z80 scripts have been included for convenience but are available here https://flatassembler.net/download.php and here https://github.com/jacobly0/fasmg-z80 . For the same convenience some include useful files with character set, rom addresses, etc. have also been provided
