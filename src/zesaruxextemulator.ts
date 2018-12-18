
//import * as assert from 'assert';
import { EmulatorBreakpoint } from './emulator';
import { GenericWatchpoint } from './genericwatchpoint';
import { ZesaruxEmulator } from './zesaruxemulator';
import { zSocket } from './zesaruxSocket';
//import { Labels } from './labels';
//import { Utility } from './utility';

/**
 * The representation of the Z80 Zesarux machine with extensions (fast breakpoints).
 * It automatically detects if extension are available.
 * If not behaviour is exactly like ZesaruxEmulator.
 * If yes a few function from ZesaruxEmulator are exchanged.
 * The new functions use the fast bbreakpoints and watchpoints.
 */
export class ZesaruxExtEmulator extends ZesaruxEmulator {
	/// Will be set on initialization if extensions are available.
	protected extensionsAvailable = false;

	/**
	 * Is called right after Zesarux has been connected and the version info was read.
	 * Used to check if the Extensions have been enabled.
	 * If so use the own (fast breakpoint) functions instead of the standard ones.
	 * If not this class behaves exactly as the standard Zesarux.
	 */
	protected zesaruxConnected() {
		zSocket.send('check-extensions', data => {
			if(data == 'Extensions available.') {
				this.extensionsAvailable = true;
				// Enable additional features
				ZesaruxExtEmulator.prototype.initBreakpoints = ZesaruxExtEmulator.prototype.initBreakpointsExt;

				ZesaruxExtEmulator.prototype.setWatchpoints = ZesaruxExtEmulator.prototype.setWatchpointsExt;
				ZesaruxExtEmulator.prototype.enableWPMEM = ZesaruxExtEmulator.prototype.enableWPMEMExt;

				ZesaruxExtEmulator.prototype.setAssertBreakpoints = ZesaruxExtEmulator.prototype.setAssertBreakpointsExt;
				ZesaruxExtEmulator.prototype.enableAssertBreakpoints = ZesaruxExtEmulator.prototype.enableAssertBreakpointsExt;

				ZesaruxExtEmulator.prototype.setBreakpoint = ZesaruxExtEmulator.prototype.setBreakpointExt;
				ZesaruxExtEmulator.prototype.removeBreakpoint = ZesaruxExtEmulator.prototype.removeBreakpointExt;

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
	protected setWatchpointsExt(watchPoints: Array<GenericWatchpoint>, handler?: (watchpoints:Array<GenericWatchpoint>) => void) {
		// Set watchpoints (memory guards)
		for(let wp of watchPoints) {
			// Create watchpoint
			zSocket.send('set-fast-watchpoint ' + wp.address + ' ' + wp.access + ' ' + wp.size + ' ' + wp.conditions  );
		}

		// Call handler
		if(handler) {
			zSocket.executeWhenQueueIsEmpty(() => {
				// Copy array
				const wps = watchPoints.slice(0);
				handler(wps);
			});
		}
	}


	/**
	 * Enables/disables all WPMEM watchpoints set from the sources.
	 * @param enable true=enable, false=disable.
	 * @param handler Is called when ready.
	 */
	public enableWPMEMExt(enable: boolean, handler: () => void) {
		if(enable)
			this.setWatchpointsExt(this.watchpoints);
		else
			for(let wp of this.watchpoints)
				zSocket.send('clear-fast-breakpoint ' + wp.address + ' ' + + wp.size); // 'clear-fast-breakpoint' is correct

		this.wpmemEnabled = enable;
		zSocket.executeWhenQueueIsEmpty(handler);
	}


		/**
	 * Sets the watchpoints in the given list.
	 * Watchpoints result in a break in the program run if one of the addresses is written or read to.
	 * @param watchPoints A list of addresses to put a guard on.
	 * @param handler(bpIds) Is called after the last watchpoint is set.
	 */
	protected setAssertBreakpointsExt(assertBreakpoints: Array<GenericWatchpoint>, handler?: (assertBreakpoints:Array<GenericWatchpoint>) => void) {
		// Set breakpoints
		for(let abp of assertBreakpoints) {
			// Create breakpoint
			zSocket.send('set-fast-breakpoint ' + abp.address + ' ' + abp.size + ' ' + abp.conditions  );
		}
		this.assertBreakpoints = assertBreakpoints;

		// Call handler
		if(handler) {
			zSocket.executeWhenQueueIsEmpty(() => {
				// Copy array
				const abps = assertBreakpoints.slice(0);
				handler(abps);
			});
		}
	}


	/**
	 * Enables/disables all assert breakpoints set from the sources.
	 * @param enable true=enable, false=disable.
	 * @param handler Is called when ready.
	 */
	public enableAssertBreakpointsExt(enable: boolean, handler: () => void) {
		if(enable) {
			this.setAssertBreakpointsExt(this.assertBreakpoints, ()=>{});
		}
		else {
			// Remove breakpoints
			for(let wp of this.assertBreakpoints) {
				zSocket.send('clear-fast-breakpoint ' + wp.address + ' ' + + wp.size);
			}
		}
		this.assertBreakpointsEnabled = enable;
		zSocket.executeWhenQueueIsEmpty(handler);
	}


	/*
	 * Sets breakpoint in the zesarux debugger.
	 * Breakpoint ID (bp.bpId) is not used.
	 * @param bp The breakpoint.
	 * @returns The internal breakpoint ID. (Just the index to the array).
	 */
	protected setBreakpointExt(bp: EmulatorBreakpoint): number {
		// set the breakpoint
		const zesaruxCondition = this.convertCondition(bp.condition) || '';
		zSocket.send('set-fast-breakpoint ' + bp.address + ' ' + zesaruxCondition);
		// Add to list
		this.breakpoints.push(bp);
		bp.bpId = this.breakpoints.length;	// use index as breakpoint ID
		// return
		return bp.bpId;
	}


	/**
	 * Clears one breakpoint.
	 */
	protected removeBreakpointExt(bp: EmulatorBreakpoint) {
		// remove the breakpoint
		zSocket.send('clear-fast-breakpoint ' + bp.address);
		// Remove from list
		var index = bp.bpId-1;
		this.breakpoints.splice(index, 1);
	}

}


