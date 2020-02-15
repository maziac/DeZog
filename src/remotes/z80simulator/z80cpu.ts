import * as Z80js from 'z80js';
import {ZxMemory} from './zxmemory';
import {ZxPorts} from '../z80simulator/zxports';


export class Z80Cpu extends Z80js {

	/// Constructor.
	constructor(memory: ZxMemory, ports: ZxPorts, debug = false) {
		super(memory, ports, debug);
	}

}
