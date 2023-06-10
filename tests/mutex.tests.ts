
import * as assert from 'assert';
import {Mutex} from '../src/misc/mutex';



suite('Mutex', () => {

	async function pause(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

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
							if (sequence++ !== 0) {
								reject();
								return;
							}
							await mtx.lock();	// Should block
							// Unlock 2nd (all) locks
							if (sequence++ !== 2) {
								reject();
								return;
							}
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

	suite('timeout', () => {

		test('unlock not called', async () => {
			return new Promise<void>((resolve, reject) => {
				(async () => {
					await (async () => {
						const mtx = new Mutex(10) as any;
						let exceptionthrown = false;
						mtx.throwError = (text: string) => {
							exceptionthrown = true;
						};
						await mtx.lock();
						if (mtx.locks.length === 0) {
							reject();
							return;
						}
						await pause(40);
						// Check that array has been cleared and exception was thrown
						if (mtx.locks.length === 0 && exceptionthrown)
							resolve();
						else
							reject();
					})();
				})();
			})
		});

		test('exception in the other lock', async () => {
			return new Promise<void>((resolve, reject) => {
				(async () => {
					await (async () => {
						const mtx = new Mutex(10) as any;
						let exceptionthrown = false;
						mtx.throwError = (text: string) => {
							exceptionthrown = true;
						};
						await mtx.lock();
						let sequence = 0;
						setImmediate(() => {
							(async () => {
								// Other lock
								if (sequence++ !== 0) {
									reject();
									return;
								}
								await mtx.lock();	// is never unlocked -> times out
							})();
						});
						setImmediate(() => {
							(async () => {
								// Second lock
								if (sequence++ !== 1) {
									reject();
									return;
								}
								try {
									await mtx.lock();
								}
								catch {
									if (sequence++ !== 2) {
										reject();
										return;
									}
									// An exception is OK
									if (exceptionthrown)
										resolve();
									else
										reject();
									return;
								}
								// No exception is an error
								reject();
							})();
						});
					})();
				})();
			})
		});
	});
});
