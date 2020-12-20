# Building DeZog

## Clone

Clone e.g. via http:
~~~bash
git clone https://github.com/maziac/DeZog.git
cd DeZog
~~~


## Build

Open folder 'DeZog' in vscode (>= 1.50).
Open a terminal and install all required packages.
~~~bash
npm i
~~~

Run the build task
~~~bash
npm run watch
~~~

This can be accomplished also by running it from the menu ("Terminal->Run build task ...").
The build task is setup for incremental building and watches any file changes.
I.e. you don't need to compile manually everytime.

(Alternatively ```nmp run compile``` should also do.)


# Creating a vsix package

Run
~~~bash
vsce package
~~~


# Publish to Microsoft Store

1. Increase the version number in package.json.
2. Update change description
	- Update CHANGELOG.md if not yet done.
	- Update 'Dezog/src/whatsnew/whatsnewprovider.ts'.
3. Run ```npm i```
4. [Build](#build)
5. Push sources to github:
	- ```git commit```
	- ```git pull``` (just in case)
	- ```git push```
6. Release on github
	- Upload release ("Draft a new release"), use 'vsce package' to create it.
	- Use the version number from package.json, e.g. "v2.0.0", as tag
	- Add the changes from the CHANGELOG.md as description.
7. Pull (```git pull```) to be clean
8. To publish in Microsoft store run
	~~~bash
	sudo npm install -g vsce # update vsce
	vsce publish # or vsce publish -p <token>
	~~~
9. Add published releases (vsix file) also to 'releases' directory and commit/push them.


