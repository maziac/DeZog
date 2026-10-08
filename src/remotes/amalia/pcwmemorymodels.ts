import {MemoryModel, /*, BankInfo*/} from "../MemoryModel/memorymodel";
import { CustomMemoryBank } from "../../settings/settingscustommemory";


/** Contains the predefined memory model for the Amstrad PCW.
 */


/** The Amstrad PCW memory model:
    https://github.com/Zigazou/amstrad-pcw-technical-info/blob/master/memory-map-cpm/README.md
 */
export class MemoryModelAmstradPCW extends MemoryModel {
    constructor() {
        // Shared bank catalog: define once, reuse across all slots.
        const ALL_BANKS: CustomMemoryBank[] = [
            { index: 0, name: 'BIOS', shortName: 'BIOS_0' },
            { index: 1, name: 'BIOS/Screen', shortName: 'BIOS_1' },
            { index: 2, name: 'Screen', shortName: 'SCRN_2' },
            { index: 3, name: 'BDOS/BIOS', shortName: 'BDOS_3' },
            { index: [4, 7] as [number, number], name: 'TPA ${index}', shortName: 'TPA__${index}' },
            { index: 8, name: 'CCP/DATA', shortName: 'CCPD_8' },            
            { index: [9, 127] as [number, number], name: 'M: ${index}', shortName: 'MDSK_${index}' }
        ];

        super({
            slots: [
                {
                    range: [0x0000, 0x3FFF],
                    initialBank: 4,
                    banks: ALL_BANKS
                },
                {
                    range: [0x4000, 0x7FFF],
                    initialBank: 5,
                    banks: ALL_BANKS
                },
                {
                    range: [0x8000, 0xBFFF],
                    initialBank: 6,
                    banks: ALL_BANKS
                },
                {
                    range: [0xC000, 0xFFFF],
                    initialBank: 7,
                    banks: ALL_BANKS
                }
            ]
        });
        this.name = 'AmstradPCW';
    }

    /** Returns the bank for a given address.
     * @param longAddress The long address.
     * @returns The bank. Undefined if longAddress is < 0x10000 or if there is only 1
     * bank for the slot.
     */

/*
    public getBankForAddress(longAddress: number): BankInfo | undefined {
        // Check for long address
        const bankNr = (longAddress >>> 16) - 1;
        if (bankNr < 0)
            return undefined;

        //Overide as this was not returing a bank for 7 as its a single bank slot
        // Check for switched banks
        //  const addr64k = longAddress & 0xFFFF;
        //  const banks = this.getBanksFor(addr64k);
        //  if (banks.size == 1)
        //      return undefined;	// Just 1 bank
        
        // Return bank
        return this.banks[bankNr];
    }
*/
}
