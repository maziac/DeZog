
import * as assert from 'assert';
import {Mutex} from '../src/misc/mutex';



suite('Mutex', () => {

	suite('lock/unlock', () => {

		test('normal: 1', async () => {
			const mtx = new Mutex();
			await mtx.lock();
			mtx.unlock();
		});

		test('2 locks', async () => {
			return new Promise<void>((resolve, reject) => {
				(async () => {
					const mtx = new Mutex();
					await mtx.lock();
					setTimeout(() => {
						// Everything fine if we run into a timeout
						resolve();
					}, 10);
					await mtx.lock();
					reject();	// Should not reach here
				})();
			});
		});

		test('2 uses', async () => {
			return new Promise<void>((resolve, reject) => {
				(async () => {
					const mtx = new Mutex();
					await mtx.lock();
					let sequence = 0;
					setImmediate(() => {
						(async () => {
							// Other lock
							if (sequence++ !== 0) reject();
							await mtx.lock();	// Should block
							// Unlock 2nd (all) locks
							if (sequence++ !== 2) reject();
							mtx.unlock();
							// Lock again (should not lock)
							await mtx.lock();
							resolve();
						})();
					});
					setImmediate(() => {
						(async () => {
							// Free first lock
							if (sequence++ !== 1) reject();
							mtx.unlock();
						})();
					});
				})();
			});
		});

	});
});


