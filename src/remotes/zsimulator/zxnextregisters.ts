import {SimulatedMemory} from "./simulatedmemory";
import {Z80Cpu} from "./z80cpu";
import {Z80Ports} from "./z80ports";
import {ZxBeeper} from "./zxbeeper";


/** The ZX Next (tbblue) registers.
 * See https://wiki.specnext.dev/TBBlue_Register_Select and
 * https://wiki.specnext.dev/TBBlue_Register_Access
 *
 * Only a few registers are simulated:
 * - 0x07: CPU speed (REG_TURBO_MODE)
 * - 0x50-0x57: Memory management slots
 * The registers are added with the 'add...' methods, afterwards the ports are
 * installed with 'installPorts'.
 */
export class ZxNextRegisters {
	// The selected register (written to port 0x243B).
	protected registerSelectValue = 0;

	// Maps function handlers to registers (the key). As key the registerSelectValue is used.
	protected registerWriteHandler = new Map<number, (value: number) => void>();

	// Maps function handlers to registers (the key). As key the registerSelectValue is used.
	protected registerReadHandler = new Map<number, () => number>();

	// The programmed cpu speed (0-3), see cpuSpeedWrite.
	protected cpuSpeed = 0;

	// Used to change the cpu speed.
	protected z80Cpu: Z80Cpu;

	// Is informed about cpu speed changes. Optional.
	protected zxBeeper?: ZxBeeper;

	// Used for the memory management slots.
	protected memory: SimulatedMemory;


	/** Adds the cpu speed register (0x07, REG_TURBO_MODE).
	 * @param z80Cpu The cpu whose frequency is changed.
	 * @param zxBeeper (Optional) The beeper is also informed about frequency changes.
	 */
	public addCpuSpeedRegister(z80Cpu: Z80Cpu, zxBeeper?: ZxBeeper) {
		this.z80Cpu = z80Cpu;
		this.zxBeeper = zxBeeper;
		this.registerWriteHandler.set(0x07, this.cpuSpeedWrite.bind(this));
		this.registerReadHandler.set(0x07, this.cpuSpeedRead.bind(this));
	}


	/** Adds the memory management slot registers (0x50-0x57) for bank switching.
	 * @param memory The memory whose slots are changed.
	 */
	public addMemoryManagementSlotRegisters(memory: SimulatedMemory) {
		this.memory = memory;
		for (let register = 0x50; register <= 0x57; register++) {
			this.registerWriteHandler.set(register, this.memoryManagementSlotsWrite.bind(this));
			this.registerReadHandler.set(register, this.memoryManagementSlotsRead.bind(this));
		}
	}


	/** Installs the ports 0x243B (register select) and 0x253B (register access).
	 * Nothing is installed if no register has been added.
	 * @param ports The ports to register at.
	 */
	public installPorts(ports: Z80Ports) {
		if (this.registerWriteHandler.size === 0 && this.registerReadHandler.size === 0)
			return;
		// Register out port 0x243B
		ports.registerSpecificOutPortFunction(0x243B, this.registerSelect.bind(this));
		// Register out port 0x253B
		ports.registerSpecificOutPortFunction(0x253B, this.registerWriteAccess.bind(this));
		// Register in port 0x253B
		ports.registerSpecificInPortFunction(0x253B, this.registerReadAccess.bind(this));
	}


	/** Selects active port for TBBlue/Next feature configuration.
	 * See https://wiki.specnext.dev/TBBlue_Register_Select
	 * The value is just stored, no further action.
	 * @param port The written port. (0x243B)
	 * @param value The tbblue register to select.
	 */
	protected registerSelect(port: number, value: number) {
		this.registerSelectValue = value;
	}


	/** Writes the selected TBBlue control register.
	 * See https://wiki.specnext.dev/TBBlue_Register_Access
	 * Acts according the value and registerSelectValue,
	 * i.e. calls the mapped function for the selected register.
	 * @param port The port.
	 * @param value The value to write.
	 */
	protected registerWriteAccess(port: number, value: number) {
		const func = this.registerWriteHandler.get(this.registerSelectValue);
		if (func)
			func(value);
	}


	/** Reads the selected TBBlue control register.
	 * See https://wiki.specnext.dev/TBBlue_Register_Access
	 * Acts according the value and registerSelectValue,
	 * i.e. calls the mapped function for the selected register.
	 * @param port The port.
	 */
	protected registerReadAccess(port: number): number {
		const func = this.registerReadHandler.get(this.registerSelectValue);
		if (!func)
			return 0;
		// Get value
		const value = func();
		return value;
	}


	/** Changes the tbblue slot/bank association for slots 0-7.
	 * See https://wiki.specnext.dev/Memory_management_slot_0_bank
	 * registerSelectValue contains the register (0x50-0x57) respectively the
	 * slot.
	 * @param value The bank to map.
	 */
	protected memoryManagementSlotsWrite(value: number) {
		const slot = this.registerSelectValue & 0x07;
		if (value == 0xFF) {
			// Handle ROM specially
			if (slot >= 2)
				return;	// not allowed
		}
		else if (value > 223)
			return;	// not existing bank

		// Change the slot/bank
		this.memory.setSlot(slot, value);
	}


	/** Reads the tbblue slot/bank association for slots 0-7.
	 * See https://wiki.specnext.dev/Memory_management_slot_0_bank
	 * registerSelectValue contains the register (0x50-0x57) respectively the
	 * slot.
	 */
	protected memoryManagementSlotsRead(): number {
		const slot = this.registerSelectValue & 0x07;
		// Change the slot/bank
		let bank = this.memory.getSlots()[slot];
		return bank;
	}


	/** Changes the cpu speed.
	 * @param value Last 2 bits = the new speed:
	 * b00 = 3.5MHz, b01 = 7MHz, b10 = 14MHz, b11 = 28MHz.
	 * Note: 28Mhz will add an extra NOP for each instruction.
	 * NOT IMPLEMENTED.
	 */
	protected cpuSpeedWrite(value: number) {
		const cpuSpeed = value & 0b11;
		// Set the cpu frequency
		const cpuFrequency = (1 << cpuSpeed) * 3500000;	// 3.5MHz, 7MHz, 14MHz, 28Mhz
		const extraTcycle = (cpuSpeed == 3) ? 1 : 0;
		this.z80Cpu.setExtraTstatesPerInstruction(extraTcycle);
		this.z80Cpu.setCpuFreq(cpuFrequency);
		// Update also the ZXBeeper
		this.zxBeeper?.setCpuFrequency(cpuFrequency);
		// Remember the speed
		this.cpuSpeed = cpuSpeed;
	}


	/** Reads the tbblue cpu speed.
	 * The real port read makes a difference between programmed and actual speed.
	 * This function here does not.
	 * @returns Bit 4-5: current speed, bits 0-1: programmed speed.
	 * b00 = 3.5MHz, b01 = 7MHz, b10 = 14MHz, b11 = 28MHz.
	 */
	protected cpuSpeedRead(): number {
		const cpuSpeed = this.cpuSpeed;
		const cpuSpeedBoth = (cpuSpeed << 4) | cpuSpeed;
		return cpuSpeedBoth;
	}
}
