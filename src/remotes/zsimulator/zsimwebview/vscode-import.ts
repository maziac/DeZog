import {WebviewApi} from 'vscode-webview';

// Set 'vscode' for easy access in other modules.
export const vscode: WebviewApi<string> = acquireVsCodeApi();
