import {DzrpTransportRemote} from './dzrptransportremote';
import {Settings} from '../../settings/settings';
import {WithSocket} from './transportsocketmixin';



/** The CSpect Remote.
 * It connects via socket with CSpect.
 * Or better: with the DeZog plugin for CSpect.
 * The CSpect DeZog plugin internally communicates with the
 * CSpect debugger.
 */
export class CSpectRemote extends WithSocket(DzrpTransportRemote) {
	protected override logName = 'CSpectRemote';


	/** Unfortunaely I didn't get info from Mike how to use the
	 * PeekPhysical or PeekPhysicalULA and especially how to read
	 * the ROMs.
	 * So, I try to do the best here and check the slots first:
	 * If the ROM is selected in a slot, a normal 64k read will be done instead.
	 */
	protected sendDzrpCmdReadBankMem(bank: number, offset: number, size: number): Promise<Uint8Array> {
		if (bank === 0xFF /* ROM */) {
			// Check if slot is paged in
			const slots = this.getSlots();
			if ((slots[0] === 0xFF && offset < 0x2000)
				|| (slots[1] === 0xFF && offset > 0x2000)
			) {
				// ROM is paged in, do a normal 64k read
				return this.sendDzrpCmdReadMem(offset, size);
			}
		}
		// Do a banked read
		return super.sendDzrpCmdReadBankMem(bank, offset, size);
	}


	/** ZX81 is not supported.
	 */
	protected async loadBinZx81(filePath: string): Promise<number | undefined> {
		throw Error("File extension in '" + filePath + "' not supported with remoteType:'" + Settings.launch.remoteType + "'.");
	}
}
