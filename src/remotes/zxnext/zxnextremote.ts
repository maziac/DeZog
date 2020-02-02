//import * as assert from 'assert';
import {ZesaruxExtRemote } from '../zesarux/zesaruxextremote';
import {MemoryPage} from '../remoteclass';



/**
 * The representation of the ZX Next HW.
 * It receives the requests from the DebugAdapter and communicates with
 * the USB serial conenction with the ZX Next HW.
 */
export class ZxNextRemote extends ZesaruxExtRemote {


	/**
	 * Reads the memory pages, i.e. the slot/banks relationship from zesarux
	 * and converts it to an arry of MemoryPages.
	 * @returns A Promise with an array with the available memory pages.
	 */
	/*
	public async getMemoryPages(): Promise<MemoryPage[]> {
		return [];
	}
	*/
}

