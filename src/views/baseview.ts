import * as vscode from 'vscode';
import {Utility} from '../misc/utility';



/**
 * A Webview that serves as base class for other views like the MemoryDumpView or the
 * ZxNextSpritesView.
 */
export class BaseView {

	// STATIC:

	/// Holds a list of all derived view classes.
	/// Used to call the static update functions.
	public static staticViewClasses: Array<any>;

	/// Holds a list of all open views.
	protected static staticViews: Array<BaseView>;


	/**
	 * Initializes the static variables.
	 * Called at launchRequest.
	 */
	public static staticInit() {
		BaseView.staticViewClasses=new Array<any>();
		BaseView.staticViews=new Array<BaseView>();
	}


	/**
	 * Is called on 'update' event.
	 * First calls the static update functions.
	 * Afterwards the update functions of all views.
	 * @param reason The reason is a data object that contains additional information.
	 * E.g. for 'step' it contains { step: true };
	 */
	public static async staticCallUpdateFunctions(reason?: any): Promise<void> {
		// Loop all view classes
		for(const viewClass of BaseView.staticViewClasses) {
			await viewClass.staticUpdate(reason);
		}
		// Loop all views
		for(const view of BaseView.staticViews) {
			await view.update(reason);
		}
	}


	/**
	 * Closes all opened views.
	 * Is called when the debugger closes.
	 */
	public static staticCloseAll() {
		// Copy view array
		const views = BaseView.staticViews.map(view => view);
		// Dispose/close all views
		for (const view of views) {
			view.vscodePanel.dispose();
			view.vscodePanel=undefined as any;
		}
		BaseView.staticViews.length=0;
	}


	/**
	 * Returns a list of all open views for a given class.
	 * @param viewClass A classname.
	 * @return All open views for the given class.
	 */
	public static staticGetAllViews(viewClass: any) {
		// Get all views of the given class
		const views = BaseView.staticViews.filter(view => view instanceof viewClass);
		return views;
	}


	/**
	 * Calls the registers function (debug adapter) to inform about
	 * a change. I.e. the user changed a memory value.
	 * The DebugAdapter/vscode uses this to update e.g. the WATCHes.
	 */
	public static sendChangeEvent = () => {};

	/**
	 * Registers the sendChangeEvent function.
	 * @param func The function to register.
	 */
	public static onChange(func: () => void) {
		this.sendChangeEvent = func;
	}

	// DYNAMIC:

	/// A panel (containing the webview).
	protected vscodePanel: vscode.WebviewPanel;


	/**
	 * Creates the basic view.
	 * @param addToStaticViews Adds the view to the static views list so that
	 * it will get an update event. This is the default for debug windows.
	 * Other (independent) views can set this to false.
	 */
	constructor(addToStaticViews = true) {
		// Add to view list
		if (addToStaticViews)
			BaseView.staticViews.push(this);

		// Create vscode panel view
		this.vscodePanel = vscode.window.createWebviewPanel('', '', {preserveFocus: true, viewColumn: vscode.ViewColumn.Nine}, {enableScripts: true, enableFindWidget: true, retainContextWhenHidden: true});

		// Handle messages from the webview
		this.vscodePanel.webview.onDidReceiveMessage(message => {
			//console.log("webView command '"+message.command+"':", message);
			this.webViewMessageReceived(message);
		});

		// Handle closing of the view
		this.vscodePanel.onDidDispose(() => {
			// Call overwritable function
			this.disposeView();
		});

	}


	/**
	 * Dispose the view (called e.g. on close).
	 * Use this to clean up additional stuff.
	 * Normally not required.
	 */
	public disposeView() {
		const index = BaseView.staticViews.indexOf(this);
		if (index >= 0) {
			BaseView.staticViews.splice(index, 1);
		}
		// Do not use panel anymore
		this.vscodePanel=undefined as any;
	}


	/**
	 * The web view posted a message to this view.
	 * @param message The message. message.command contains the command as a string.
	 * This needs to be created inside the web view.
	 */
	protected webViewMessageReceived(message: any) {
		// Overwrite
		Utility.assert(false);
	}


	/**
	 * A message is posted to the web view.
	 * @param message The message. message.command should contain the command as a string.
	 * This needs to be evaluated inside the web view.
	 * @param baseView The webview to post to. Can be omitted, default is 'this'.
	 */
	protected sendMessageToWebView(message: any, baseView: BaseView=this) {
		baseView.vscodePanel.webview.postMessage(message);
	}


	/**
	 * Retrieves the memory content and displays it.
	 * @param reason The reason is a data object that contains additional information.
	 * E.g. for 'step' it contains { step: true };
	 */
	public async update(reason?: any): Promise<void> {
		// Overwrite this.
	}


	/**
	 * Put webview to the foreground.
	 */
	public reveal() {
		this.vscodePanel.reveal();
	}
}

