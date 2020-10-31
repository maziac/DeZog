import {Utility} from '../misc/utility';




/// For StepHistory this is the register data only.
/// For full cpu history the memory content at PC (the instruction)
/// and the content at SP (the potential return address)
/// will be added.
export type HistoryInstructionInfo=any;


/**
 * Use similar data as DecodeRegisterData but with data extension.
 * This extension is read and parsed as well.
 * To get the opcodes at the pc and the contents at (SP).
 * This is required only for true cpu history (not for lite/step history).
 */
export class DecodeHistoryInfo {
	/**
	 * Retrieves the opcodes from the HistoryInstructionInfo.
	 * @param line One line of history.
	 * @returns 4 bytes (the opcodes) in one number. little endian,
	 * i.e. the opcode at PC is at the lowest 8 bits.
	 */
	public getOpcodes(line: HistoryInstructionInfo): number {
		// Override this
		Utility.assert(false);
		return 0;
	}


	/**
	 * Reads the SP content from a given opcode string.
	 * @param line One line of history. E.g. "IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=3f R=06 IM1 IFF-- (PC)=e52a785c (SP)=a2bf"
	 * @returns The (sp), e.g. 0xA2BF
	 */
	public getSpContent(line: HistoryInstructionInfo): number {
		// Override this
		Utility.assert(false);
		return 0;
	}

}

