import {ChangeLogItem, ChangeLogKind, ContentProvider, Header, Image, Sponsor /*, IssueKind*/} from "../3rdparty/vscode-whats-new/src/ContentProvider";

// Provide "Whatsnew" data
export class WhatsNewContentProvider implements ContentProvider {

	provideHeader(logoUrl: string): Header {
		return <Header>{
			logo: <Image>{src: logoUrl, height: 50, width: 50},
			message:
`<b>DeZog<b> is an Integrated Development Environment for the Z80 processor. It supports various assemblers and remote debugging. Especially for, but not limited to, ZX Spectrum devices.
<p>
The step from 1.5 to 2.0 was huge. A lot of things changed under the hood to support 'long addresses'.
I.e. DeZog is now aware of banking information. It can distinguish sources that share same addresses but reside on different banks. The same for breakpoints. E.g. a breakpoint set to address 0xA000 and bank 7 will not break if address 0xA000 has been executed in bank 8.
<p>
To use the feature you need the newest version of <u>sjasmplus (>=1.18.0)</u> and let sjasmplus create a SLD file instead of a list file. I.e. <u>you need to change your build command and the launch.json</u>, please see the migration document.
<p>
The other bigger feature that has been added is the "custom code" that you can provide to the internal simulator. With "custom code" you can implement your own peripherals inside zsim. I.e. you can provide code that acts on writing to or reading from a port or that generates interrupts.
<p>
And, of course, a lot of smaller changes and bug fixes.
<p>
There is a <u>migration document</u> that should serve as help to change your projects for usage with the new DeZog. Please find it <a href="https://github.com/maziac/DeZog/blob/master/documentation/Migration.md">here</a>.

`};
	}

	provideChangeLog(): ChangeLogItem[] {
		let changeLog: ChangeLogItem[]=[];
		changeLog.push(...[
			{
				kind: ChangeLogKind.NEW, detail: {
					message: `<br><b>Support for 'long addresses', memory banking.</b>`
				}
			},
			{
				kind: ChangeLogKind.NEW, detail: {
					message: `<br><b>"Custom Code" for implementation of peripherals in zsim, see <a href="https://github.com/maziac/DeZog/blob/master/documentation/zsimPeripherals.md">zsimPeripherals.md</a>.</b>`
				}
			},
			{
				kind: ChangeLogKind.NEW, detail: {
					message: `<br><b>"Help included. Enter "dezog: Show the DeZog help page" (or short "dezog help") in the command palette. It shows the Usage.md page with table of contents for easy navigation inside vscode.`
				}
			},
			{
				kind: ChangeLogKind.CHANGED, detail: {
					message: `<br><b>Unit Tests have been simplified internally and now make use of ASSERTION keywords instead of the various test macros.</b>`
				},
			},
			{
				kind: ChangeLogKind.CHANGED, detail: {
					message: `<br>The 'launch.json' parameters have been changed. Please see the new description in the <a href="https://github.com/maziac/DeZog/blob/master/documentation/Usage.md">Usage.md</a> document.`
				},
			},
			{
				kind: ChangeLogKind.FIXED, detail: {
					message: `<br>Various fixes.`
				},
			},
		]);
		return changeLog;
	}

	provideSponsors(): Sponsor[] {
		return [];
	}

}
