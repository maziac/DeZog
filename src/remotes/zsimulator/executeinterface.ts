import {ZSimRemote} from "./zsimremote";

/** Interface for all components that should be called during a
 * CPU instruction execute.
 * Called by ZSimRemote.
 * */
export interface ExecuteInterface {
	execute(zsim: ZSimRemote);
}
