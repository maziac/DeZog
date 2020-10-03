
import * as assert from 'assert';
import {Utility} from '../misc/utility';

/**
 * The tests here are not really unit tests but meant to check some
 * functionality or to do performance tests.
 */

suite('Miscellaneous', () => {

	suite('Performance', () => {

		test('Array vs Map', () => {
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

	});

});

