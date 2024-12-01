import {Labels} from "./labels/labels";
import {Utility} from "./misc/utility";
import {Remote} from "./remotes/remotebase";


/** The breakpoint format returned to the debug adapter / vscode.
 */
export interface ExceptionBreakpointInfo {
	// The name of the breakpoint e.g. "ASSERTIONs"
	name: string,

	// A description
	description: string,

	// Function to return whether the remote supports this kind of breakpoint.
	funcSupported: () => boolean,

	// The enable/disable state of the exception group.
	enabled: boolean,

	// What condition the breakpoint supports. undefined if the breakpoint does not support a condition.
	// Used for the logpoint groups.
	conditionString?: string,

	// The function to call to enable/disable the breakpoint.
	funcEnable: (enable: boolean, conditionString?: string) => Promise<string>
}


/**
 * Beginning with DeZog 3.0 the enabling/disabling of the breakpoints used for assertions (ASSERT),
 * memory guards (WPMEM) ad logpoints (LOGPOINT) are now handled through the vscode UI and the debug adapter
 * protocol.
 * The creation of these breakpoints is not changed, i.e. they are still inserted through the asm source code.
 * However, additionally to the WPMEM watchpoint there is also a data breakpoint which.
 * The data breakpoint is not handled here.
 *
 * Functionality:
 * In order to use exception breakpoints in vscode the breakpoints are configured in vscode in initRequest
 * through 'response.body.exceptionBreakpointFilters'.
 * These breakpoints are shown in the BREAKPOINTS pane and cannot be changed anymore.
 * But it is possible through the vscode UI to enable/disable them. Additionally for the LOGPOINTs the user can
 * add a string that consists of the logpoint groups that should be enabled.
 * If one of the breakpoints gets selected/deselected vscode calls the 'setExceptionBreakPointsRequest' with all
 * selected breakpoints.
 * The ExceptionBreakpoints class then checks which state has changed (i.e. which breakpoint has been
 * selected/deselected) and enables/disables the corresponding breakpoint.
 *
 * The Dezog 2.x functionality of enabling/disabling these breakpoints in the DEBUG CONSOLE has been removed.
 */
export class ExceptionBreakpoints {

	// A list of all exception breakpoints and their state.
	public breakpoints: ExceptionBreakpointInfo[];


	/** Constructor.
	 */
	constructor() {
		this.breakpoints = [{
			name: 'ASSERTION',
			description: 'ASSERTIONs are given as comments in the assembler sources. e.g. "; ASSERTION ..."',
			funcSupported: () => Remote.supportsASSERTION,
			enabled: false,
			funcEnable: this.enableASSERTIONs
		},
		{
			name: 'WPMEM',
			description: 'WPMEM are memory guards given as comments in the assembler sources. e.g. "; WPMEM ..."',
			funcSupported: () => Remote.supportsWPMEM,
			enabled: false,
			funcEnable: this.enableWPMEMs
		},
		{
			name: 'LOGPOINT',
			description: 'LOGPOINTs are given as comments in the assembler sources. e.g. "; LOGPOINT [group] ..."\nAdd the groups of logpoints you want to enable as a comma or space separated list.',
			funcSupported: () => Remote.supportsLOGPOINT,
			enabled: false,
			conditionString: '',
			funcEnable: this.enableLOGPOINTs
		},
		{
			name: 'Break on Interrupt',
			description: 'Break when entering an interrupt.',
			funcSupported: () => Remote.supportsBreakOnInterrupt,
			enabled: false,
			funcEnable: this.enableBreakOnInterrupt
		}];
	}


	/** Sets the exception breakpoints.
	 * @param exceptionMap The breakpoints to enable (not given breakpoints will be removed).
	 * @returns A tuple: [string, boolean[], string[]]:
	 * - A string with human readable output to be displayed in the debug console. The breakpoint status.
	 * - An array with verification status of the breakpoints. I.e. some Remotes
	 * do not support certain breakpoint types, e.g. CSpect does not support WPMEM.
	 * In that case an un-verified status is returned.
	 * Important: The order of the returned array is the same as the passed 'exceptionMap'.
	 * - An array of strings of exception breakpoint names that should be enabled but are not supported.
	 */
	public async setExceptionBreakPoints(exceptionMap: Map<string, string>): Promise<[string, boolean[], string[]]> {
		let output = '';

		// Check which breakpoint was enabled/disabled
		const notSupported: string[] = [];
		for (const bp of this.breakpoints) {
			const entry = exceptionMap.get(bp.name);
			const entryEnabled = (entry != undefined);
			const entryChanged = (entryEnabled != bp.enabled);
			const conditionChanged = ((bp.conditionString ?? '') != (entry ?? ''));	// entry is also used for the condition string.
			if (entryChanged || (conditionChanged && entryEnabled)) {
				if (bp.funcSupported()) {
					// Change state
					output += await bp.funcEnable(entryEnabled, entry);
				}
				else {
					// Not supported.
					// Check if enabled (although not supported)
					if (entryEnabled)
						notSupported.push(bp.name);
				}
				// Remember
				bp.enabled = entryEnabled;
				if (bp.conditionString != undefined)
					bp.conditionString = entry ?? '';
			}
		}

		// Check which breakpoints are supported by the remote
		const bpsSupport: boolean[] = [];
		for (const [bpName,] of exceptionMap) {
			const bp = this.breakpoints.find(bp => bp.name == bpName)!;
			const supported: boolean = bp?.funcSupported();
			bpsSupport.push(supported);
		}

		return [output, bpsSupport, notSupported];
	}


	/**
	 * ASSERTION. Enable/disable.
	 * @param enable true = enable, false = disable.
	 */
	protected async enableASSERTIONs(enable: boolean): Promise<string> {
		let result: string;
		const abps = Remote.getAllAssertionBreakpoints();

		// Check if there are any assertion breakpoints
		if (abps.length == 0) {
			// No ASSERTIONs
			result = 'No ASSERTION breakpoints defined.';
		}
		else {
			// Enable or disable all ASSERTION breakpoints
			await Remote.enableAssertionBreakpoints(enable);

			// Show enable status of all ASSERTION breakpoints
			const realEnable = Remote.assertionBreakpointsEnabled;
			const enableString = (realEnable) ? 'enabled' : 'disabled';
			result = 'ASSERTION breakpoints are ' + enableString + '.\n';
			if (realEnable) {
				// Also list all assertion breakpoints
				for (const abp of abps) {
					result += Utility.getLongAddressString(abp.longAddress);
					const labels = Labels.getLabelsForLongAddress(abp.longAddress);
					if (labels.length > 0) {
						const labelsString = labels.join(', ');
						result += ' (' + labelsString + ')';
					}
					// Condition, remove the brackets
					result += ', Condition: ' + Utility.getAssertionFromCondition(abp.condition) + '\n';
				}
			}
		}
		// Output
		result += '\n';
		return result;
	}


	/**
	 * WPMEM. Enable/disable.
	 * @param enable true = enable, false = disable.
	 */
	protected async enableWPMEMs(enable: boolean): Promise<string> {
		// Enable or disable all WPMEM watchpoints
		await Remote.enableWPMEM(enable);

		// Show enable status of all WPMEM watchpoints
		const realEnable = Remote.wpmemEnabled;
		const enableString = (realEnable) ? 'enabled' : 'disabled';
		let result = 'WPMEM watchpoints are ' + enableString + '.\n';
		if (realEnable) {
			// Also list all watchpoints
			const wps = Remote.getAllWpmemWatchpoints();
			for (const wp of wps) {
				result += Utility.getLongAddressString(wp.longOr64kAddress);
				const labels = Labels.getLabelsForLongOr64kAddress(wp.longOr64kAddress);
				if (labels.length > 0) {
					const labelsString = labels.join(', ');
					result += ' (' + labelsString + ')';
				}
				// Condition, remove the brackets
				result += ', size=' + wp.size + '\n';
			}
			if (wps.length == 0)
				result += 'No WPMEM watchpoints defined.\n';
		}
		// Output
		result += '\n';
		return result;
	}


	/**
	 * LOGPOINTS. Enable/disable.
	 * @param enable true = enable, false = disable.
	 * @param conditionString A string with all groups that should be enabled.
	 * Only evaluated if enable == true. If enabled == false all logpoints are disabled.
	 * If enabled == true and no conditionString or an empty conditionString is given, all
	 * logpoints are enabled.
	 */
	protected async enableLOGPOINTs(enable: boolean, conditionString?: string): Promise<string> {
		// Convert condition string into groups
		let groupsString = (conditionString ?? '').replace(/[,;]/g, ' ');
		groupsString = groupsString.replace(/\s+/g, ' ').trim();
		const groups = (groupsString.length > 0) ? groupsString.split(' ') : [];

		// Check if groups have been set by the user or if state should be changed to 'disabled'
		const prevEnableMap = Remote.logpointsEnabled;
		if (groups.length == 0 || !enable) {
			// No groups are given: Use all groups
			for (const [group, enabled] of prevEnableMap) {
				if (enabled != enable) {
					// Change state: Enable/disable
					await Remote.enableLogpointGroup(group, enable);
				}
			}
		}
		else {
			// groups.length > 0 && enable == true.
			// Check status of groups and change accordingly.
			for (const [group, enabled] of prevEnableMap) {
				const enableGroup = groups.includes(group);
				if (enableGroup != enabled) {
					await Remote.enableLogpointGroup(group, enableGroup);
				}
			}
		}

		// Always show enable status of all Logpoints
		let result: string;
		const enableMap = Remote.logpointsEnabled;
		if (enableMap.size == 0)
			result = 'No LOGPOINTs defined';
		else {
			result = 'LOGPOINT groups:';
			for (const [group, enabled] of enableMap) {
				result += '\n  ' + group + ': ' + ((enabled) ? 'enabled' : 'disabled');
				if (enabled) {
					// List log breakpoints
					const lps = Remote.getLogpointsForGroup(group);
					for (const lp of lps) {
						result += '\n    ' + Utility.getLongAddressString(lp.longAddress);
						const labels = Labels.getLabelsForLongAddress(lp.longAddress);
						if (labels.length > 0) {
							const labelsString = labels.join(', ');
							result += ' (' + labelsString + ')';
						}
					}
				}
			}
		}

		result += '\n';
		// Check if some groups might not exist
		const groupsNotExist: string[] = [];
		for (const group of groups) {
			if (Remote.logpointsEnabled.get(group) === undefined)
				groupsNotExist.push(group);
		}
		if (groupsNotExist.length > 0) {
			result += 'Note: These groups do not exist: ' + groupsNotExist.join(', ') + '\n';
		}

		// Output
		result += '\n';
		return result;
	}


	/**
	 * Break on interrupt. Enable/disable.
	 * @param enable true = enable, false = disable.
	 */
	protected async enableBreakOnInterrupt(enable: boolean): Promise<string> {
		// Enable or disable 'break on interrupt' (oly zsim)
		const enabled = await Remote.enableBreakOnInterrupt(enable);

		const result = "Break on interrupt: " + ((enabled) ? 'enabled' : 'disabled') + ".\n";

		return result;
	}
}
