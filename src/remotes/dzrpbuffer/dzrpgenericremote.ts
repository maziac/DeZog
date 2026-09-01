import {DzrpTransportRemote as DzrpTransportRemote} from './dzrptransportremote';
import {WithSocket} from './transportsocketmixin';
import {WithSerial} from './transportserialmixin';
import {DZRP} from '../dzrp/dzrpremote';


/** A generic implementation of a DZRP remote.
 * Both, serial and socket implementations are provided.
 * These generic classes can support all DZRP commands.
 * The user can choose which commands are supported by using the
 * 'supportedCommands' property of "dzrp" in launch.json.
 * Per default only the dezogif specific commands are disabled.
 * I.e. CMD_SET_BREAKPOINTS and CMD_RESTORE_MEM.
 */
class DzrpGenericRemote extends DzrpTransportRemote {
	protected defaultUnsupportedCommands = [
		DZRP.CMD_SET_BREAKPOINTS, DZRP.CMD_RESTORE_MEM
	];
}

export class DzrpGenericSocketRemote extends WithSocket(DzrpGenericRemote) {
	protected override logName = 'DzrpGenericSocketRemote';
}

export class DzrpGenericSerialRemote extends WithSerial(DzrpGenericRemote) {
	protected override logName = 'DzrpGenericSerialRemote';
}
