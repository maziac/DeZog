import * as OrigPath from 'path';



//export const UnifiedPath=OrigPath;
//export const UnifiedPath=OrigPath.posix;


const redirectedPath=OrigPath.posix;

/**
 * Works only on unix style paths regardless on which operating system
 * DeZog is running on.
 * Unix style path (i.e. forward slashes) are recognized by Windows as well.
 * So it is still compatible.
 * Does not provide all functionality of 'path'
 * only the used functions.
 * Use this class everywhere instead of path directly.
 */
export class UnifiedPath {

	// Just pass these functions:
	public static basename=redirectedPath.basename;
	public static dirname=redirectedPath.dirname;
	public static join=redirectedPath.join;

	/**
	 * Needs to check posix and windows.
	 * Required because a path could now start with "c:/..." instead of "/".
	 */
	public static isAbsolute(path: string): boolean {
		if(OrigPath.posix.isAbsolute(path))
			return true;
		if(OrigPath.win32.isAbsolute(path))
			return true;
		return false;
	}


	/**
	 * Changes all Windows backslashes "\" into forward slashes "/".
	 * I.e. it creates a unified path.
	 * @param fpath The file path. MAy contain "/" or "\" even both.
	 * @return The same path but all '\' converted to '/'.
	 * If fpath is undefined an undefined value is returned.
	 */
	public static getUnifiedPath(fpath: string|undefined): string {
		if (!fpath)
			return undefined as any;
		const uPath=fpath.replace(/\\/g, '/');
		return uPath;
	}


	/**
	 * Same as getUnifiedPath but works on an array of strings.
	 * @param fpaths Array of path strings.
	 * @return An array of path strings but all '\' converted to '/'.
	 * May return undefined if fpaths is undefined.
	 */
	public static getUnifiedPathArray(fpaths: string[]): string[] {
		if (!fpaths)
			return undefined as any;
		const uPath=fpaths.map(fpath =>
			((fpath) ? fpath.replace(/\\/g, '/') : undefined) as string);
		return uPath;
	}

}

