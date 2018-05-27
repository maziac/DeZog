
//import assert = require('assert');
import { CallSerializer } from '../callserializer';

suite('CallSerializer', () => {

/*
	setup( () => {
		return dc.start();
	});

	teardown( () => dc.stop() );
*/

	suite('execAll', () => {

		test('1 func', (done) => {
			CallSerializer.execAll(
				cs => {
					cs.endExec();
					done();
				}
			);
		});

		test('2 funcs', (done) => {
			CallSerializer.execAll(
				cs => {
					cs.endExec();
				},
				cs => {
					cs.endExec();
					done();
				}
			);
		});

	});

});