
//import * as assert from 'assert';
import { RemoteBreakpoint } from '../remotebase';
import { GenericWatchpoint, GenericBreakpoint } from '../../genericwatchpoint';
import { ZesaruxRemote } from './zesaruxremote';
import { zSocket } from './zesaruxsocket';
//import { Labels } from './labels';
//import { Utility } from './utility';

/**
 * The representation of the Z80 Zesarux machine with extensions (fast breakpoints).
 * It automatically detects if extension are available.
 * If not behavior is exactly like ZesaruxEmulator.
 * If yes a few function from ZesaruxEmulator are exchanged.
 * The new functions use the fast breakpoints and watchpoints.
 */
export class ZesaruxExtRemote extends ZesaruxRemote {
	/// Will be set on initialization if extensions are available.
	protected extensionsAvailable=false;

	/**
	 * Is called right after Zesarux has been connected and the version info was read.
	 * Used to check if the Extensions have been enabled.
	 * If so use the own (fast breakpoint) functions instead of the standard ones.
	 * If not this class behaves exactly as the standard Zesarux.
	 */
	protected zesaruxConnected() {
		zSocket.send('check-extensions', data => {
			if (data=='Extensions available.') {
				this.extensionsAvailable=true;
				// Enable additional features
				ZesaruxExtRemote.prototype.initBreakpoints=ZesaruxExtRemote.prototype.initBreakpointsExt;

				ZesaruxExtRemote.prototype.setWatchpoints=ZesaruxExtRemote.prototype.setWatchpointsExt;
				ZesaruxExtRemote.prototype.enableWPMEM=ZesaruxExtRemote.prototype.enableWPMEMExt;

				ZesaruxExtRemote.prototype.setAssertBreakpoints=ZesaruxExtRemote.prototype.setAssertBreakpointsExt;
				ZesaruxExtRemote.prototype.enableAssertBreakpoints=ZesaruxExtRemote.prototype.enableAssertBreakpointsExt;

				ZesaruxExtRemote.prototype.enableLogpoints=ZesaruxExtRemote.prototype.setLogpointsExt;
				ZesaruxExtRemote.prototype.enableLogpointGroup=ZesaruxExtRemote.prototype.enableLogpointsExt;

				ZesaruxExtRemote.prototype.setBreakpoint=ZesaruxExtRemote.prototype.setBreakpointExt;
				ZesaruxExtRemote.prototype.removeBreakpoint=ZesaruxExtRemote.prototype.removeBreakpointExt;
			}
		});
	}


	/**
	 * Initializes the fast breakpoints.
	 */
	protected initBreakpointsExt() {
		// Clear all zesarux original breakpoints
		zSocket.send('enable-breakpoints');
		this.clearAllZesaruxBreakpoints();

		// Clear fast-breakpoints
		zSocket.send('clear-all-fast-breakpoints');
	}


	/**
	 * Sets the watchpoints in the given list.
	 * Watchpoints result in a break in the program run if one of the addresses is written or read to.
	 * @param watchPoints A list of addresses to put a guard on.
	 * @param handler(bpIds) Is called after the last watchpoint is set.
	 */
	public async setWatchpointsExt(watchPoints: Array<GenericWatchpoint>): Promise<void> {
		// Set watchpoints (memory guards)
		for (let wp of watchPoints) {
			// Create watchpoint
			zSocket.send('set-fast-watchpoint '+wp.address+' '+wp.access+' '+wp.size+' '+wp.condition);
		}

		// Wait on last command
		await zSocket.executeWhenQueueIsEmpty();
	}


	/**
	 * Enables/disables all WPMEM watchpoints set from the sources.
	 * Promise is called when method finishes.
	 * @param enable true=enable, false=disable.
	 */
	public async enableWPMEMExt(enable: boolean): Promise<void> {
		if (enable)
			this.setWatchpointsExt(this.watchpoints);
		else
			for (let wp of this.watchpoints)
				zSocket.send('clear-fast-breakpoint '+wp.address+' '+ + wp.size); // 'clear-fast-breakpoint' is correct

		this.wpmemEnabled=enable;
		await zSocket.executeWhenQueueIsEmpty();
	}


	/**
	 * Sets the assert breakpoints in the given list.
	 * Asserts result in a break in the program run if the PC is hit and
	 * the condition is met.
	 * @param assertBreakpoints A list of addresses to put a guard on.
	 * @param handler(bpIds) Is called after the last watchpoint is set.
	 */
	protected setAssertBreakpointsExt(assertBreakpoints: Array<GenericBreakpoint>, handler?: (assertBreakpoints:Array<GenericBreakpoint>) => void) {
		// Set breakpoints
		for(let abp of assertBreakpoints) {
			// Create breakpoint
			const zesaruxCondition = this.convertCondition(abp.condition) || '';
			zSocket.send('set-fast-breakpoint ' + (abp.address) + ' ' + zesaruxCondition  );
		}

		// Call handler
		if(handler) {
			zSocket.executeWhenQueueIsEmpty().then(() => {
				// Copy array
				const abps = assertBreakpoints.slice(0);
				handler(abps);
			});
		}
	}


	/**
	 * Enables/disables all assert breakpoints set from the sources.
	 * @param enable true=enable, false=disable.
	 */
	public async enableAssertBreakpointsExt(enable: boolean): Promise<void> {
		if(enable) {
			this.setAssertBreakpointsExt(this.assertBreakpoints);
		}
		else {
			// Remove breakpoints
			for(let wp of this.assertBreakpoints) {
				zSocket.send('clear-fast-breakpoint ' + wp.address + ' 1');
			}
		}
		this.assertBreakpointsEnabled = enable;
		await zSocket.executeWhenQueueIsEmpty();
	}


	/*
	 * Sets breakpoint in the zesarux debugger.
	 * Breakpoint ID (bp.bpId) is not used.
	 * @param bp The breakpoint.
	 * @returns The internal breakpoint ID. (Just the index to the array).
	 */
	public async setBreakpointExt(bp: RemoteBreakpoint): Promise<number> {
		// Get condition
		const zesaruxCondition = this.convertCondition(bp.condition);
		if(zesaruxCondition == undefined) {
			this.emit('warning', "Breakpoint: Can't set condition: " + (bp.condition || ''));
			// set to unverified
			bp.address = -1;
			return 0;
		}

		// set the breakpoint
		let logMsg = '';
		if(bp.log)
			logMsg = ',' + bp.log;
		zSocket.send('set-fast-breakpoint ' + bp.address + ' ' + zesaruxCondition + logMsg, data => {
			// Check for error:
			if(data.startsWith('Error')) {
				// Error (in logpoint message)
				bp.address = -1;	// Not verified.
			}
		});
		// Add to list
		this.breakpoints.push(bp);
		bp.bpId = this.breakpoints.length;	// use index as breakpoint ID
		// return
		return bp.bpId;
	}


	/**
	 * Clears one breakpoint.
	 */
	protected async removeBreakpointExt(bp: RemoteBreakpoint): Promise<void> {
		// remove the breakpoint
		zSocket.send('clear-fast-breakpoint ' + bp.address);
		// Remove from list
		var index = bp.bpId-1;
		this.breakpoints.splice(index, 1);
	}


	/**
	 * Sets the log points in the given list.
	 * Logpoints print a log instead of stopping the execution.
	 * @param logpoints A list of addresses to put a guard on.
	 * @param enable Enable or disable the logpoints.
	 * @returns A promise that is called after the last watchpoint is set.
	 */
	public async setLogpointsExt(logpoints: Array<GenericBreakpoint>, enable: boolean): Promise<void> {
		return new Promise<void>(resolve => {
			// Set logpoints
			if (enable) {
				for (let lp of logpoints) {
					// Create logpoint (normally there is no condition)
					const zesaruxCondition=this.convertCondition(lp.condition)||'';
					let logMsg='';
					if (lp.log)
						logMsg=','+lp.log;
					zSocket.send('set-fast-breakpoint '+(lp.address)+' '+zesaruxCondition+logMsg);
				}
			}
			else {
				for (let lp of logpoints) {
					zSocket.send('clear-fast-breakpoint '+lp.address+' 1');
				}
			}
			// Call handler
			zSocket.executeWhenQueueIsEmpty().then(resolve);
		});
	}


	/**
	 * Enables/disables all logpoints for a given group.
	 * Throws an exception if the group is unknown.
	 * Promise is called all logpoints are set.
	 * @param group The group to enable/disable. If undefined: all groups.
	 * @param enable true=enable, false=disable.
	 * @param handler Is called when ready.
	 */
	public async enableLogpointsExt(group: string, enable: boolean): Promise<void> {
		let lPoints;

		// Check if one group or all
		if (group) {
			// 1 group:
			const array=this.logpoints.get(group);
			if (!array)
				throw Error("Group '"+group+"' unknown.");
			lPoints=new Map<string, GenericBreakpoint[]>([[group, array]]);
		}
		else {
			// All groups:
			lPoints=this.logpoints;
		}

		// Loop over all selected groups
		for (const [grp, arr] of lPoints) {
			// Add logpoints
			await this.setLogpointsExt(arr, enable);
			// Set group state
			this.logpointsEnabled.set(grp, enable);
		}
	}

}


