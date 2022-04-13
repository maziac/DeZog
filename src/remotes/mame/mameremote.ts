import {GenericBreakpoint} from '../../genericwatchpoint';
import {DzrpRemote} from '../dzrp/dzrpremote';
import {Z80_REG} from '../z80registers';



/**
 * The representation of a MAME remote.
 * Can handle the MAME gdbstub but only for Z80.
 */
export class MameRemote extends DzrpRemote {


	/// Constructor.
	constructor() {
		super();
	}


	/// Initializes the machine.
	/// When ready it emits this.emit('initialized') or this.emit('error', Error(...));
	/// The successful emit takes place in 'onConnect' which should be called
	/// by 'doInitialization' after a successful connect.
	public async doInitialization(): Promise<void> {
		// Ready
		this.emit('initialized')
	}

	/**
	 * Stops the simulator.
	 * Called e.g. when vscode sends a disconnectRequest
	 * @param handler is called after the connection is disconnected.
	 */
	public async disconnect(): Promise<void> {
		this.emit('closed')
	}


	/**
	 * Sets a specific register value.
	 * @param reg E.g. Z80_REG.PC or Z80_REG.A
	 * @param value The value to set.
	 */
	protected setRegValue(reg: Z80_REG, value: number) {
		// Set register in z80 cpu
		switch (reg) {	// NOSONAR
			case Z80_REG.PC:
				break;
			case Z80_REG.SP:
				break;
			case Z80_REG.AF:
				break;
			case Z80_REG.BC:
				break;
			case Z80_REG.DE:
				break;
			case Z80_REG.HL:
				break;
			case Z80_REG.IX:
				break;
			case Z80_REG.IY:
				break;
			case Z80_REG.AF2:
				break;
			case Z80_REG.BC2:
				break;
			case Z80_REG.DE2:
				break;
			case Z80_REG.HL2:
				break;

			case Z80_REG.IM:
				break;

			case Z80_REG.F:
				break;
			case Z80_REG.A:
				break;
			case Z80_REG.C:
				break;
			case Z80_REG.B:
				break;
			case Z80_REG.E:
				break;
			case Z80_REG.D:
				break;
			case Z80_REG.L:
				break;
			case Z80_REG.H:
				break;
			case Z80_REG.IXL:
				break;
			case Z80_REG.IXH:
				break;
			case Z80_REG.IYL:
				break;
			case Z80_REG.IYH:
				break;

			case Z80_REG.F2:
				break;
			case Z80_REG.A2:
				break;
			case Z80_REG.C2:
				break;
			case Z80_REG.B2:
				break;
			case Z80_REG.E2:
				break;
			case Z80_REG.D2:
				break;
			case Z80_REG.L2:
				break;
			case Z80_REG.H2:
				break;
			case Z80_REG.R:
				break;
			case Z80_REG.I:
				break;
		}
	}


	/**
	 * Executes a few zsim specific commands, e.g. for testing the custom javascript code.
	 * @param cmd E.g. 'out 0x9000 0xFE', 'in 0x8000', 'tstates set 1000' or 'tstates add 1000'.
	 * @returns A Promise with a return string, i.e. the decoded response.
	 */
	public async dbgExec(cmd: string): Promise<string> {
		try {
			let response = '';
			const tokens = cmd.split(' ');
			const cmd_name = tokens.shift();
			if (cmd_name == "help") {
				// Add this to the help text
				response = `zsim specific commands:
out port value: Output 'value' to 'port'. E.g. "zsim out 0x9000 0xFE"
in port: Print input value from 'port'. E.g. "zsim in 0x8000"
tstates set value: set t-states to 'value', then create a tick event. E.g. "zsim tstastes set 1000"
tstates add value: add 'value' to t-states, then create a tick event. E.g. "zsim tstastes add 1000"
`;
			}
			else if (cmd_name == "out") {
			}
			// Otherwise pass to super class
			response += await super.dbgExec(cmd);
			return response;
		}
		catch (e) {	// NOSONAR: is here for debugging purposes to set a breakpoint
			// Rethrow
			throw e;
		}
	}


	//------- Send Commands -------

	/**
	 * Sends the command to get all registers.
	 * @returns An Uint16Array with the register data. Same order as in
	 * 'Z80Registers.getRegisterData'.
	 */
	public async sendDzrpCmdGetRegisters(): Promise<Uint16Array> {
		return new Uint16Array();
	}


	/**
	 * Sends the command to set a register value.
	 * @param regIndex E.g. Z80_REG.BC or Z80_REG.A2
	 * @param value A 1 byte or 2 byte value.
	 */
	public async sendDzrpCmdSetRegister(regIndex: Z80_REG, value: number): Promise<void> {

	}


	/**
	 * Sends the command to continue ('run') the program.
	 * @param bp1Address The address of breakpoint 1 or undefined if not used.
	 * @param bp2Address The address of breakpoint 2 or undefined if not used.
	 */
	public async sendDzrpCmdContinue(bp1Address?: number, bp2Address?: number): Promise<void> {

	}


	/**
	 * Sends the command to pause a running program.
	 */
	public async sendDzrpCmdPause(): Promise<void> {
	}


	/**
	 * Adds a breakpoint.
	 * @param bp The breakpoint. sendDzrpCmdAddBreakpoint will set bp.bpId with the breakpoint
	 * ID.
	 */
	public async sendDzrpCmdAddBreakpoint(bp: GenericBreakpoint): Promise<void> {
	}


	/**
	 * Removes a breakpoint.
	 * @param bp The breakpoint to remove.
	 */
	public async sendDzrpCmdRemoveBreakpoint(bp: GenericBreakpoint): Promise<void> {
		//
	}


	/**
	 * Sends the command to add a watchpoint.
	 * @param address The watchpoint long address.
	 * @param size The size of the watchpoint. address+size-1 is the last address for the watchpoint.
	 * @param access 'r', 'w' or 'rw'.
	 */
	public async sendDzrpCmdAddWatchpoint(address: number, size: number, access: string): Promise<void> {
	}


	/**
	 * Sends the command to remove a watchpoint for an address range.
	 * @param address The watchpoint long address.
	 * @param size The size of the watchpoint. address+size-1 is the last address for the watchpoint.
	 * @param access 'r', 'w' or 'rw'.
	 */
	protected async sendDzrpCmdRemoveWatchpoint(address: number, size: number, access: string): Promise<void> {
	}


	/**
	 * Sends the command to retrieve a memory dump.
	 * @param address The memory start address.
	 * @param size The memory size.
	 * @returns A promise with an Uint8Array.
	 */
	public async sendDzrpCmdReadMem(address: number, size: number): Promise<Uint8Array> {
		return new Uint8Array();
	}


	/**
	 * Sends the command to write a memory dump.
	 * @param address The memory start address.
	 * @param dataArray The data to write.
	  */
	public async sendDzrpCmdWriteMem(address: number, dataArray: Buffer | Uint8Array): Promise<void> {
	}

}

