
import * as assert from 'assert';
import { ZesaruxCpuHistory, DecodeZesaruxHistoryInfo } from '../remotes/zesarux/zesaruxcpuhistory';
import { ZesaruxRemote } from '../remotes/zesarux/zesaruxremote';
import { Z80RegistersClass, Z80Registers } from '../remotes/z80registers';
import { ZesaruxSocket, zSocket } from '../remotes/zesarux/zesaruxsocket';
import { RefList } from '../reflist';
import { CallStackFrame } from '../callstackframe';
import { DecodeZesaruxRegisters } from '../remotes/zesarux/decodezesaruxdata';


suite('ZesaruxEmulator', () => {

	setup(() => {
		Z80RegistersClass.Init();
	});




});

