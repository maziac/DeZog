
//import * as assert from 'assert';
import { CallSerializer } from '../callserializer';

suite('CallSerializer', () => {

/*
	setup( () => {
		return dc.start();
	});

	teardown( () => dc.disconnect() );
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