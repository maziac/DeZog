
import * as assert from 'assert';
import {Utility} from '../misc/utility';
import {DecodeZesaruxRegisters} from '../remotes/zesarux/decodezesaruxdata';

/**
 * The tests here are not really unit tests but meant to check some
 * functionality or to do performance tests.
 */

// Please rename a test 'suite' to 'suite_hide' so that it will
// not appear on the sidebar.
// To make it available again rename to 'suite'.
function suite_hide(name: string, func: () => void) {
}
suite_hide;

// Similar for 'test'.
function test_hide(name: string, func: () => void) {
}
test_hide;

suite_hide('Miscellaneous', () => {

	suite('Performance', () => {

		test_hide('Array vs Map', () => {
			const itemCount=65536*10;
			const accessCount=10000000;
			const step=20;

			// Initialize big dense array
			const denseArr=new Array<any>(itemCount);
			for (let i=0; i<itemCount; i++) {
				denseArr[i]=new Object();
			}
			// Measure access
			let k=0;
			const timeDenseArr=Utility.measure(() => {
				denseArr[k];
				k+=step;
				if (k>=itemCount)
					k==0;
			}, accessCount);
			// Output
			console.log('\nPerformance: Array vs. Map');
			console.log('itemCount='+itemCount+', accessCount='+accessCount);
			console.log('Dense Array: '+timeDenseArr+'ms');


			// Initialize big sparse array
			const sparseArr=new Array<any>();
			for (let i=0; i<itemCount; i+=step) {
				sparseArr[i]=new Object();
			}

			// Measure access, accessing holes
			k=1;
			const timeSparseArrHoles=Utility.measure(() => {
				sparseArr[k];
				k+=step;
				if (k>=itemCount)
					k==0;
			}, accessCount);
			// Output
			console.log('Sparse Array, accessing holes: '+timeSparseArrHoles+'ms');

			// Measure access, accessing no holes
			k=0;
			const timeSparseArrNoHoles=Utility.measure(() => {
				sparseArr[k];
				k+=step;
				if (k>=itemCount)
					k==0;
			}, accessCount);
			// Output
			console.log('Sparse Array, no holes: '+timeSparseArrNoHoles+'ms');

			// Measure access, accessing both
			k=0;
			const step2=step/2;
			const timeSparseArrBoth=Utility.measure(() => {
				sparseArr[k];
				k+=step2;
				if (k>=itemCount)
					k==0;
			}, accessCount);
			// Output
			console.log('Sparse Array, both: '+timeSparseArrBoth+'ms');


			// Initialize big map
			const map=new Map<number, any>();
			for (let i=0; i<itemCount; i++) {
				map.set(i, new Object());
			}
			// Measure access
			k=0;
			const timeMap=Utility.measure(() => {
				map.get(k);
				k+=10;
				if (k>=itemCount)
					k==0;
			}, accessCount);
			// Output
			console.log('Map: '+timeMap+'ms');

			assert.ok(true);

			/*
			 Result:
			 Dense Array:	3ms
			 Sparse Array:	50ms
			 Map:			6ms

			 Comment: A sparse array may get a similar speed as a map if there are less holes.

			 Conclusion: It makes no sense to use a sparse array over a map.
			 */
		});


		test('Performance decode register', () => {
			const count=300000;
			const decoder=new DecodeZesaruxRegisters(8);
			const line="PC=812c SP=8418 AF=03ff BC=02ff HL=99a2 DE=ffff IX=ffff IY=5c3a AF'=0044 BC'=174b HL'=107f DE'=0006 I=00 R=2c  F=SZ5H3PNC F'=-Z-- -P-- MEMPTR=0000 IM0 IFF-- VPS: 0 MMU=80008001000a000b0004006400000001";

			// Measure access for DE (middle)
			const timeWithIndexDE=Utility.measure(() => {
				decoder.parseDE(line);
			}, count);
			// Output
			console.log('\nPerformance: decode register');
			console.log('parseDE: WithIndex='+timeWithIndexDE+'ms');

			// Measure access for PC (first)
			const timeWithIndexPC=Utility.measure(() => {
				decoder.parseDE(line);
			}, count);
			// Output
			console.log('parsePC: WithIndex='+timeWithIndexPC+'ms');


			// Measure access for DE (middle)
			const timeWithSearchDE=Utility.measure(() => {
				(decoder as any).deIndex=-1;
				decoder.parseDE(line);
			}, count);
			// Output
			console.log('parseDE: WithSearch='+timeWithSearchDE+'ms');

			// Measure access for PC (first)
			const timeWithSearchPC=Utility.measure(() => {
				(decoder as any).pcIndex=-1;
				decoder.parsePC(line);
			}, count);
			// Output
			console.log('parsePC: WithSearch='+timeWithSearchPC+'ms');



			assert.ok(true);

			/*
			 Result:
			 parseDE: WithIndex=80ms
			 parsePC: WithIndex=83ms

			 parseDE: WithSearch=107ms
			 parsePC: WithSearch=100ms

			 Conclusion: With index is 20% faster.
			 With search: Depending on the position the search might be a bit slower.
			 */
		});

	});

});


