import {Z80Registers} from '../z80registers';
import {Z80_REG} from '../z80registers';
import {MameGdbRemote} from '../mame/mamegdbremote';
import {MemoryModelAmstradPCW} from './pcwmemorymodels';
import {MameType} from '../../settings/settings';
import {MemBlock} from '../remotebase';
import {GenericBreakpoint} from '../../genericwatchpoint';
import {DzrpRemote} from '../dzrp/dzrpremote';
import {HexFormat} from '../../misc/hexformat';
import {Z80RegistersStandardDecoder} from '../z80registersstandarddecoder';
import {Z80RegisterAmaliaDecoder} from './z80registersamaliadecoder';

export class AmaliaGdbRemote extends MameGdbRemote {
	constructor(settingsMameType: MameType) {
		super(settingsMameType);
	}

	/** Override to create the Amalia-specific decoder.
	 */
	protected createZ80RegistersDecoder(): Z80RegistersStandardDecoder {
		return new Z80RegisterAmaliaDecoder();
	}

    /** Call this from 'doInitialization' when a successful connection
	 * has been opened to the Remote.
	 * @emits this.emit('initialized') or this.emit('error', Error(...))
	 */
	protected async onConnect(): Promise<void> {
		try {
			// Init
			//const qReply =
			//await this.sendPacketData('?'); // Reply is ignored
			const qXmlReply = await this.sendPacketData('qXfer:features:read:target.xml:00,FFFF');	// Enable 'g', 'G', 'p', and 'P commands

			// Check the XML
			this.parseXml(qXmlReply);

			// Load executable
			await this.load();

			Z80Registers.decoder = this.createZ80RegistersDecoder();

			this.memoryModel = new MemoryModelAmstradPCW()
			this.memoryModel.init();

			// Ready
			this.emit('initialized', 'Amalia connected!')
		}
		catch (err) {
			try {
				this.emit('error', err);
			}
			catch {};
		}
	}     


	/** The Amalia gdbstub has no qRcmd 'print', so each block is read with 'm'.
	 */
	protected async sendDzrpCmdReadMem(blocks: MemBlock[]): Promise<Uint8Array[]> {
		const result: Uint8Array[] = [];
		for (const {addr64k, size} of blocks)
			result.push(await this.readMemWithM(addr64k, size));
		return result;
	}


	/** The Amalia gdbstub has no qRcmd 'print', the registers are read with 'g'.
	 */
	public async getRegistersFromEmulator(): Promise<void> {
		const regs = await this.sendPacketData('g');
		Z80Registers.setCache(regs);
	}


	/** The Amalia gdbstub has no qRcmd, the registers are written with 'P'.
	 * @param regIndex E.g. Z80_REG.BC or Z80_REG.A2
	 * @param value A 1 byte or 2 byte value.
	 */
	public async sendDzrpCmdSetRegister(regIndex: Z80_REG, value: number): Promise<void> {
		// DeZog register order -> Amalia 'g' packet order
		const permut = [
			0x0B,	// PC
			0x0A,	// SP
			0x00,	// AF
			0x01,	// BC
			0x02,	// DE
			0x03,	// HL
			0x08,	// IX
			0x09,	// IY
			0x04,	// AF2
			0x05,	// BC2
			0x06,	// DE2
			0x07	// HL2
		];

		// Word registers
		if (regIndex <= Z80_REG.HL2) {
			value &= 0xFFFF;
			const cmd = 'P' + permut[regIndex].toString(16) + '=' + HexFormat.getHexWordStringLE(value);
			await this.sendPacketDataOk(cmd);
			return;
		}

		// Byte registers: read-modify-write the containing word register
		if (regIndex >= Z80_REG.F && regIndex <= Z80_REG.H2) {
			value &= 0xFF;
			const byteRegIndex = regIndex - Z80_REG.F;
			const dwordIndex = Math.floor(byteRegIndex / 2) + Z80_REG.AF;
			let dword = Z80Registers.getRegValue(dwordIndex);
			if (byteRegIndex % 2)
				dword = (dword & 0xFF) + 256 * value;	// Upper half, e.g. B of BC
			else
				dword = (dword & 0xFF00) + value;	// Lower half, e.g. C of BC
			const cmd = 'P' + permut[dwordIndex].toString(16) + '=' + HexFormat.getHexWordStringLE(dword);
			await this.sendPacketDataOk(cmd);
			return;
		}

		this.emit('warning', "Amalia: Changing register " + Z80_REG[regIndex] + " is not supported.");
	}


	/** The Amalia gdbstub has no qRcmd 'bpset', breakpoints are set with 'Z0'.
	 */
	public async sendDzrpCmdAddBreakpoint(bp: GenericBreakpoint): Promise<void> {
		const address64k = bp.longAddress & 0xFFFF;	// Long addresses not supported
		await this.sendPacketDataOk('Z0,' + address64k.toString(16) + ',0');
		bp.bpId = 1;	// Removal is by address, so any non-zero id will do.
	}


	/** The Amalia gdbstub has no qRcmd 'bpclear', breakpoints are cleared with 'z0'.
	 */
	public async sendDzrpCmdRemoveBreakpoint(bp: GenericBreakpoint): Promise<void> {
		const address64k = bp.longAddress & 0xFFFF;	// Long addresses not supported
		await this.sendPacketDataOk('z0,' + address64k.toString(16) + ',0');
	}


	/** Skips the MAME-only qRcmd workaround that steps a NOP after loading.
	 */
	public async loadBin(filePath: string): Promise<number> {
		return DzrpRemote.prototype.loadBin.call(this, filePath);
	}
}
