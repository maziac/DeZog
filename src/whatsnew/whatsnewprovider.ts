import {ChangeLogItem, ChangeLogKind, ContentProvider, Header, Image, Sponsor /*, IssueKind*/} from "../3rdparty/vscode-whats-new/src/ContentProvider";

// Provide "Whatsnew" data
export class WhatsNewContentProvider implements ContentProvider {

	provideHeader(logoUrl: string): Header {
		return <Header>{
			logo: <Image>{src: logoUrl, height: 50, width: 50},
			message: `<b>DeZog<b> is an Integrated Development Environment for the Z80 processor. It supports various assemblers and remote debugging. Especially for, but not limited to, ZX Spectrum devices.`};
	}

	provideChangeLog(): ChangeLogItem[] {
		let changeLog: ChangeLogItem[]=[];
		changeLog.push(...[
			{
				kind: ChangeLogKind.NEW, detail: {
					message: `<b>Support for the 'zxnext' remote type. This allows <a href="https://github.com/maziac/DeZog/blob/master/documentation/Usage.md#zx-next--serial-interface"><b>remote debugging via a serial cable directly on a ZX Next device</b></a>.</b>`
				}
			},
			{
				kind: ChangeLogKind.CHANGED, detail: {
					message: `<b>Changed to DZRP 1.6. I.e. if you are using CSpect <a href="https://github.com/maziac/DeZogPlugin/releases"><b>you need to update the DeZog CSpect Plugin</b></a>.
					The same time you should update <a href="http://dailly.blogspot.com">CSpect to (at least) version 2.12.34</a>,</b>`
				}
			},
			{
				kind: ChangeLogKind.NEW, detail: {
					message: `<b>sjasmplus: support for additional '--lstlab' option. Simply add '--lstlab' to the samsplus assembler options. DeZog will automatically extract the extra infromation from the list file to improve label recognition.</b>`
				},
			},
			{
				kind: ChangeLogKind.NEW, detail: {
					message: `New debugger console command '-dasm': Allows to do a brute force disassembly for a given address.`
				}
			},
			{
				kind: ChangeLogKind.NEW, detail: {
					message: `Introduced TC_END to Unit tests. With this macro a Z80 unit test is successfully ended`
				}
			},
			{
				kind: ChangeLogKind.CHANGED, detail: {
					message: `Formatting of the Z80 flags changed.`
				}
			},
		]);
		return changeLog;
	}

	provideSponsors(): Sponsor[] {
		return [];
	}

}
