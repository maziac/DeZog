Z80.js
======
This is an emulator for the Z80 processor, written in JavaScript. It is developed to serve as a component of an emulator for a larger system which incorporates a Z80 as its CPU.

The emulation is highly complete, with a very few minor caveats. Specifically, the emulator completes ZEXALL with a single failure; see Known Issues below.

Using the emulator is fairly simple; just call the Z80 constructor, passing it an argument which is an object I call the emulator core. This object should contain the following functions:

    mem_read(address)

This function should return the byte at the specified memory address.

    mem_write(address, value)

This function should write the specified byte to the specified address.

    io_read(port)

This function should return a byte read from the given I/O port.

    io_write(port, value)

This function should write the specified byte to the specified I/O port.

There are no requirements placed on this object except that those four functions exist, and there are no other parameters required from you in order to set up the emulator.

The constructor will return an object containing the following functions, which are the entire public interface to the Z80:

    reset()

Resets the processor. This need not be called at power-up, but it can be.

    run_instruction()

Runs the instruction the program counter is currently pointing at, and advances the program counter to the next instruction, then returns the number of T cycles (time cycles, as opposed to machine or M cycles) that instruction took. If an interrupt was triggered during this instruction, the cycles used to handle it will be included.

    interrupt(non_maskable, data)

Triggers an interrupt. non_maskable should be true if the interrupt is a non-maskable interrupt (surprising, I know), and data should contain the value being placed on the data bus, if any (not needed if only NMI's or interrupt mode 1 are being used).

    getState()

Returns an object representing the internal state of the Z80. This can be used as part of an emulator state save routine, a debugger, or anything else that needs to see what's up inside the CPU. The properties of the state object are pretty self-explanatory if you're familiar with the Z80 architecture.

    setState(state)

Replaces the entire internal state of the Z80 with the given state object, in the format returned by getState.

And that's all you need to know about how to use the emulator. Feel free to contact me with any questions.

Known Issues
============
The undocumented flags, sometimes called the X and Y flags, or the 3 and 5 flags, will most likely take on incorrect values as the result of a BIT n, (HL) instruction.

Memory refresh is not emulated. The R register exists and should maintain the correct value, but it isn't used in any way aside from the LD A, R instruction.

Those are the only problems I'm aware of; let me know if you find any others.

License
=======
This code is copyright Molly Howell and contributors and is made available under the MIT license. The text of the MIT license can be found in the LICENSE.md file in this repository.
