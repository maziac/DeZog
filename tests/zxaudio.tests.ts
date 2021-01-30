import * as assert from 'assert';
import {ZxAudio} from '../src/remotes/zsimulator/zsimwebview/zxaudio';
import {BeeperBuffer} from '../src/remotes/zsimulator/zxbeeper';



// Mock for testing.
class ZxAudioMock extends ZxAudio {
	// Declare everything publicly accessible for testing:
	public MIN_LATENCY: number;
	public MAX_LATENCY: number;
	public ctx: AudioContext;
	public volume: number;
	public lastBeeperSample: number;
	public sampleRate: number;
	public audioCtxStartTime: number;
	public z80TimeOffset: number;

	protected createAudioContext(sampleRate: number): AudioContext {
		return new AudioContextMock(sampleRate) as any;
	}

	get ctxMock(): AudioContextMock {
		return this.ctx as any;
	}
}

// Mock audio context.
class AudioContextMock {
	public sampleRate: number;
	public channelBuffer: Array<Float32Array>;
	public sourceBuffer: Array<number>;
	public audioBufferSourceNodeMock: AudioBufferSourceNodeMock;
	public currentTimeMock = 0;
	constructor(sampleRate: number) {
		this.sampleRate = sampleRate;
	}
	get currentTime () {
		return this.currentTimeMock;
	}
	public createBuffer(numberOfChannels: number, length: number, sampleRate: number): AudioBuffer {
		this.channelBuffer = new Array<Float32Array>(numberOfChannels);
		for (let i = 0; i < numberOfChannels; i++)
			this.channelBuffer[i] = new Float32Array(length);
		return new AudioBufferMock(this.channelBuffer) as any;
	}
	public createBufferSource(): AudioBufferSourceNode {
		this.audioBufferSourceNodeMock = new AudioBufferSourceNodeMock();
		return this.audioBufferSourceNodeMock as any;
	}
	get frameStartTime() {
		return this.audioBufferSourceNodeMock.frameStartTime;
	}
}

// Mock audio buffer.
class AudioBufferMock {
	protected channelBuffer: Array<Float32Array>;
	constructor(channelBuffer: Array<Float32Array>) {
		this.channelBuffer = channelBuffer;
	}
	public getChannelData(channel: number): Float32Array {
		return this.channelBuffer[channel];
	}
}

// Mock audio source buffer.
class AudioBufferSourceNodeMock {
	public frameStartTime: number|undefined;
	public connect(destinationNode: AudioNode, output?: number, input?: number): AudioNode {
		return destinationNode;
	}
	public start(when?: number, offset?: number, duration?: number) {
		this.frameStartTime = when;
	}
}



suite('ZxAudio', () => {

	test('constructor', () => {
		const zxAudio = new ZxAudioMock(22000);
		assert.equal(zxAudio.volume, 1.0);
		assert.notEqual(zxAudio.ctx, undefined);
		assert.equal(zxAudio.ctx.sampleRate, 22000);
		assert.equal(zxAudio.ctx.sampleRate, 22000);
		assert.equal(zxAudio.lastBeeperSample, 1);
		assert.ok(zxAudio.z80TimeOffset > zxAudio.MIN_LATENCY);
		assert.ok(zxAudio.z80TimeOffset < zxAudio.MAX_LATENCY);
		assert.equal(zxAudio.audioCtxStartTime, undefined);
	});


	suite('writeBeeperSamples', () => {

		test('basics', () => {
			const zxAudio = new ZxAudioMock(22000);
			assert.equal(zxAudio.audioCtxStartTime, undefined);

			// Buffer length 0
			let beeperBuffer: BeeperBuffer = {
				time: 0,
				totalLength: 0,
				startValue: true,
				buffer: new Uint16Array(0),
				bufferLen: 0
			};
			zxAudio.writeBeeperSamples(beeperBuffer);
			assert.equal(zxAudio.audioCtxStartTime, undefined);

			// length = 1, 10
			beeperBuffer = {
				time: 0,
				totalLength: 10,
				startValue: true,
				buffer: new Uint16Array(1),
				bufferLen: 1
			};
			beeperBuffer.buffer[0] = 10;
			zxAudio.writeBeeperSamples(beeperBuffer);
			assert.notEqual(zxAudio.audioCtxStartTime, undefined);
			assert.equal(zxAudio.ctxMock.channelBuffer[0].length, 10);

			// Several different lengths
			// length = 5,7,2,5,1
			beeperBuffer = {
				time: 0,
				totalLength: 0,
				startValue: false,
				buffer: undefined as any,
				bufferLen: 0
			};
			const lengths = [5, 7, 2, 5, 1];
			for (const l of lengths)
				beeperBuffer.totalLength += l;
			beeperBuffer.buffer = new Uint16Array(lengths);
			beeperBuffer.bufferLen = beeperBuffer.buffer.length;
			let value = (beeperBuffer.startValue) ? 1.0 : -1.0;
			zxAudio.writeBeeperSamples(beeperBuffer);
			let frame = zxAudio.ctxMock.channelBuffer[0];
			let k = 0;
			for (const l of lengths) {
				for (let i=0; i < l; i++) {
					assert.equal(frame[k++], value);
				}
				value *= -1;
			}
		});

		test('startValue', () => {
			const zxAudio = new ZxAudioMock(22000);
			assert.equal(zxAudio.audioCtxStartTime, undefined);

			// startValue = true
			let beeperBuffer: BeeperBuffer = {
				time: 0,
				totalLength: 3,
				startValue: true,
				buffer: new Uint16Array(1),
				bufferLen: 1
			};
			beeperBuffer.buffer[0] = 3;
			zxAudio.writeBeeperSamples(beeperBuffer);
			let frame = zxAudio.ctxMock.channelBuffer[0];
			assert.equal(frame.length, beeperBuffer.totalLength);
			for (let i = 0; i < frame.length; i++) {
				assert.equal(frame[i], 1.0);
			}

			// startValue = false
			beeperBuffer = {
				time: 0,
				totalLength: 3,
				startValue: false,
				buffer: new Uint16Array(1),
				bufferLen: 1
			};
			beeperBuffer.buffer[0] = 3;
			zxAudio.writeBeeperSamples(beeperBuffer);
			frame = zxAudio.ctxMock.channelBuffer[0];
			assert.equal(frame.length, beeperBuffer.totalLength);
			for (let i = 0; i < frame.length; i++) {
				assert.equal(frame[i], -1.0);
			}
		});

		test('volume', () => {
			const zxAudio = new ZxAudioMock(22000);
			assert.equal(zxAudio.audioCtxStartTime, undefined);

			// volume = 0.4
			zxAudio.volume = 0.4;
			let beeperBuffer: BeeperBuffer = {
				time: 0,
				totalLength: 5,
				startValue: true,
				buffer: new Uint16Array(2),
				bufferLen: 2
			};
			beeperBuffer.buffer[0] = 2;
			beeperBuffer.buffer[1] = 3;
			zxAudio.writeBeeperSamples(beeperBuffer);
			let frame = zxAudio.ctxMock.channelBuffer[0];
			assert.equal(frame.length, beeperBuffer.totalLength);
			const q = 0.0000001;
			for (let i = 0; i < 2; i++) {
				assert.ok(Math.abs(frame[i] - 0.4) < q);
			}
			for (let i = 2; i < 5; i++) {
				assert.ok(Math.abs(frame[i] - (-0.4)) < q);
			}
		});

		test('start time', () => {
			let zxAudio = new ZxAudioMock(22000);
			assert.equal(zxAudio.audioCtxStartTime, undefined);
			const startZ80Offset = zxAudio.z80TimeOffset;

			// Simple length, time = 0
			let beeperBuffer: BeeperBuffer = {
				time: 0,
				totalLength: 1,
				startValue: true,
				buffer: new Uint16Array([1]),
				bufferLen: 1
			};
			zxAudio.writeBeeperSamples(beeperBuffer);
			let startFrameTime = zxAudio.ctxMock.frameStartTime;
			assert.equal(zxAudio.audioCtxStartTime, 0);
			assert.equal(startFrameTime, startZ80Offset);

			// Simple length, time = 10.5
			zxAudio = new ZxAudioMock(22000);
			beeperBuffer = {
				time: 10.5,
				totalLength: 1,
				startValue: true,
				buffer: new Uint16Array([1]),
				bufferLen: 1
			};
			zxAudio.writeBeeperSamples(beeperBuffer);
			startFrameTime = zxAudio.ctxMock.frameStartTime;
			assert.equal(zxAudio.audioCtxStartTime, 0);
			assert.equal(startFrameTime, startZ80Offset+10.5);

			// Simple length, time = 10, ctx offset = 100
			zxAudio = new ZxAudioMock(22000);
			beeperBuffer = {
				time: 10.0,
				totalLength: 1,
				startValue: true,
				buffer: new Uint16Array([1]),
				bufferLen: 1
			};
			zxAudio.ctxMock.currentTimeMock = 100.0;
			zxAudio.writeBeeperSamples(beeperBuffer);
			assert.equal(zxAudio.audioCtxStartTime, 100.0);
			startFrameTime = zxAudio.ctxMock.frameStartTime;
			assert.equal(startFrameTime, startZ80Offset + 110.0);
		});
	});

});


