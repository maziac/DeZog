# Building DeZog

## Clone

Clone e.g. via http:
~~~bash
git clone https://github.com/maziac/DeZog.git
cd DeZog
~~~


## Build

Open folder 'DeZog' in vscode (>= 1.74).
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

### Build Comments

Since DeZog 3.3 esbuild is used for packaging.
I.e. only the npm scripts ```esbuild-node``` and ```esbuild-browser``` (for the webviews) would be required.
However I was not able to install ```jest``` for unit testing because of circular dependencies in several modules (especially the disassembler, z80 registers and the memory model).
Jest is very sensitive on circular dependencies, more than esbuild.
So I was forced to keep also the old build environment with ```tsc```for Mocha.
This is used in npm script ```watch-tsc```. All watch scripts (```watch-node```, ```watch-browser``` and ```watch-tsc```) are activated together through the tasks (tasks.json) ```watch```.

All builds are happening in the ```out``` directory but the packaging exludes the ```out/sc``` and ```out/tests``` folders which are created for Mocha.

Having ```watch-tsc```running all the time has another advantage: I found that esbuild does not report an error if e.g. a function of a class is used in another module that has not been defined.
It does not even report a runtime error.
With tsc this errors should be captured.


# Creating a vsix package

## Creating a full package

The package that is used for releasing. It contains most of the images as they are required for the DeZog help.
Is about 70 MB in size.

Run
~~~bash
vsce package
~~~

or the npm script

~~~bash
npm run package
~~~


## Creating small package

This package removes most of the pictures so that the resulting size is < 20 MB.
The file can be attached directly to vscode issues for testing.

Run
~~~bash
vsce package --ignoreFile .vscodeignore_small
~~~

or the npm script

~~~bash
npm run package:small
~~~



# Publish to Microsoft Store

1. Increase the version number in package.json.
2. Update change description
	- Update CHANGELOG.md if not yet done.
	- Update 'Dezog/html/whatsnew_changelog.html' and maybe '...whatsnew.html'.
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


