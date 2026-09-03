import {DzrpTransportRemote as DzrpTransportRemote} from './dzrptransportremote';
import {WithSocket} from './transportsocketmixin';
import {WithSerial} from './transportserialmixin';


/** A generic implementation of a DZRP remote.
 * Both, serial and socket implementations are provided.
 * These generic classes can support all DZRP commands.
 * The DzrpGenericRemote basically is configured through the
 * DZRP CMF_GET_SUPPORTED_COMMANDS command.
 * I.e. the remote needs to support >= DZRP 2.2, implementing the CMD_GET_SUPPORTED_COMMANDS.
 */
class DzrpGenericRemote extends DzrpTransportRemote {
}

export class DzrpGenericSocketRemote extends WithSocket(DzrpGenericRemote) {
	protected override logName = 'DzrpGenericSocketRemote';
}

export class DzrpGenericSerialRemote extends WithSerial(DzrpGenericRemote) {
	protected override logName = 'DzrpGenericSerialRemote';
}
