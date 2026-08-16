import {DzrpDezogIfRemote} from './dzrpdezogifremote';
import {WithSocket} from './transportsocketmixin';


/**
 * A ZX Next remote that is connected via a socket instead of the serial
 * interface, e.g. through the ZX Next's ESP8266 WiFi module.
 *
 * Everything above the transport is identical to the serial connection:
 * the same DZRP commands and the same breakpoint handling
 * (CMD_SET_BREAKPOINTS/CMD_RESTORE_MEM) are used. Therefore only the
 * transport specific methods are overridden here.
 *
 * This needs a program on the ZX Next that serves DZRP through the WiFi
 * module. 'dezogif' (https://github.com/maziac/dezogif) is serial only;
 * 'dezogif_ng' (https://github.com/jorgegv/dezogif_ng) is a fork of it
 * that adds a WiFi build beside the serial one, and is what this was
 * developed against.
 */
export class ZxNextSocketRemote extends WithSocket(DzrpDezogIfRemote) {
}
