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
					message: `<b>New architecture for parsing list files. This will make it easier to add new assemblers in the future.</b>`
				}
			},
			{
				kind: ChangeLogKind.CHANGED, detail: {
					message: `<b>Related changes to launch.json:
					<ul>
					<li> - "listFiles" keyword removed. <\li>
					<li> - Instead a configuration for each assembler: "sjasmplus", "z80asm" and "z88dk" added with overworked parameters. </li>
					</ul>
					You will need to adjust your launch.json config files, please consult the <a href="https://github.com/maziac/DeZog/blob/master/documentation/Usage.md#assembler-configuration">Usage.md chapter "Assembler Configuration"</a>.</b>`
				}
			},
			{
				kind: ChangeLogKind.CHANGED, detail: {
					message: `z88dk:
					<ul>
					<li> - Renamed "z88dkMapFile" to "mapFile". </li>
					<li> - "addOffset" removed for z88dk. Use "mapFile" instead. </li>
					<li> - "mapFile" is mandatory now. </li>
					</ul>
					Please adjust your launch.json configs.`
				},
			}
		]);
		return changeLog;
	}

	provideSponsors(): Sponsor[] {
		return [];
	}

}
