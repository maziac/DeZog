var suiteStack = new Array();
suiteStack.push({name: 'root', children: new Array()});
var curSuite = suiteStack[0];


function suite(name, func) {
	const newSuite = {name, func, parent: curSuite, children: new Array(), funcSetup: undefined};
	curSuite.children.push(newSuite);
	const rememberSuite = curSuite;
	curSuite = newSuite;
	func();
	curSuite = rememberSuite;
}


function setup(func) {
	curSuite.funcSetup = func;
}


function test(name, func) {
	curSuite.children.push({name, func, parent: curSuite});
}


suite('MySuite1', () => {

	setup(() => {
	});

	tespt('test1', () => {
	});
	suite('MySubSuite1b', () => {
		test('test1b1', () => {
		});
		test('test1b2', () => {
		});
	});
	test('test2', () => {
	});
});


module.exports = {
      suiteStack
};
