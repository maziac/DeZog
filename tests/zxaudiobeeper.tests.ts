import * as assert from 'assert';
import {ZxAudioBeeper} from '../src/remotes/zsimulator/zsimwebview/zxaudiobeeper';
import {BeeperBuffer} from '../src/remotes/zsimulator/zxbeeper';



// Mock for testing.
class ZxAudioMock extends ZxAudioBeeper {
	// Declare everything publicly accessible for testing:
	public MIN_LATENCY: number;
	public MAX_LATENCY: number;
	public ctx: AudioContext;
	public volume: number;
	public sampleRate: number;
	public audioCtxStartTime: number;
	public nextFrameIndex: number;
	public fixedFrameLength: number;
	public nextFrame: Float32Array;

	constructor(sampleRate: number) {
		super(sampleRate);
		AudioBufferSourceNodeMock.mockClear();
	}
	protected createAudioContext(sampleRate: number): AudioContext {
		return new AudioContextMock(sampleRate) as any;
	}
	protected updateVisualBeeper() {
		//
	}
	get ctxMock(): AudioContextMock {
		return this.ctx as any;
	}
}

// Mock the GainNode.
class GainNodeMock {
	public gain = {value: 0};

	public connect(destinationNode: AudioNode, output?: number, input?: number): AudioNode {
		return destinationNode;
	}
	public linearRampToValueAtTime(value: number, endTime: number): AudioParam {
		return undefined as any;
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
	protected createGain(): GainNode {
		return new GainNodeMock() as any;
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
	public frameStartTime: number | undefined;
	public buffer: AudioBuffer | undefined;
	constructor() {
		AudioBufferSourceNodeMock.sourceNodes.push(this);
	}
	public connect(destinationNode: AudioNode, output?: number, input?: number): AudioNode {
		return destinationNode;
	}
	public start(when?: number, offset?: number, duration?: number) {
		this.frameStartTime = when;
	}
	public addEventListener(event: string, func: any) {
	}

	// Test functions.
	public static sourceNodes: Array<AudioBufferSourceNodeMock>;
	public static mockClear() {
		this.sourceNodes = new Array<AudioBufferSourceNodeMock>();
	}
}



suite('ZxAudioBeeper', () => {

	test('constructor', () => {
		const zxAudio = new ZxAudioMock(22000);
		assert.equal(zxAudio.volume, 0.75);
		assert.notEqual(zxAudio.ctx, undefined);
		assert.equal(zxAudio.ctx.sampleRate, 22000);
		assert.equal(zxAudio.sampleRate, 22000);
		assert.equal(zxAudio.audioCtxStartTime, 0);
	});


	suite('writeBeeperSamples', () => {

		test('basics', () => {
			const zxAudio = new ZxAudioMock(22000);
			assert.equal(zxAudio.audioCtxStartTime, 0);

			// Buffer length 0
			let beeperBuffer: BeeperBuffer = {
				totalLength: 0,
				startValue: true,
				buffer: new Uint16Array(0),
				bufferLen: 0
			};
			zxAudio.writeBeeperSamples(beeperBuffer);
			assert.equal(zxAudio.audioCtxStartTime, 0);
			assert.equal(zxAudio.nextFrameIndex, 0);
			assert.equal(AudioBufferSourceNodeMock.sourceNodes.length, 2);

			// lengths = [10]
			beeperBuffer = {
				totalLength: 10,
				startValue: false,
				buffer: new Uint16Array([10]),
				bufferLen: 1
			};
			zxAudio.writeBeeperSamples(beeperBuffer);
			assert.equal(zxAudio.audioCtxStartTime, 0);
			assert.equal(zxAudio.nextFrameIndex, 10);

			// A length bigger than 1 frame
			beeperBuffer = {
				totalLength: zxAudio.fixedFrameLength + 5,
				startValue: true,
				buffer: new Uint16Array([zxAudio.fixedFrameLength + 5]),
				bufferLen: 1
			};
			AudioBufferSourceNodeMock.mockClear();
			zxAudio.writeBeeperSamples(beeperBuffer);
			assert.equal(zxAudio.nextFrameIndex, 10 + 5);
			assert.equal(AudioBufferSourceNodeMock.sourceNodes.length, 1);

			// A length bigger than 2 frames
			beeperBuffer = {
				totalLength: 2*zxAudio.fixedFrameLength,
				startValue: true,
				buffer: new Uint16Array([zxAudio.fixedFrameLength, zxAudio.fixedFrameLength]),
				bufferLen: 2
			};
			AudioBufferSourceNodeMock.mockClear();
			zxAudio.writeBeeperSamples(beeperBuffer);
			assert.equal(zxAudio.nextFrameIndex, 10 + 5);
			assert.equal(AudioBufferSourceNodeMock.sourceNodes.length, 2);
		});

		test('startValue', () => {
			const zxAudio = new ZxAudioMock(22000);
			zxAudio.volume = 1;
			assert.equal(zxAudio.audioCtxStartTime, 0);

			// startValue = true
			let beeperBuffer: BeeperBuffer = {
				totalLength: 3,
				startValue: true,
				buffer: new Uint16Array([3]),
				bufferLen: 1
			};
			zxAudio.writeBeeperSamples(beeperBuffer);
			assert.equal(zxAudio.nextFrameIndex, 3);
			for (let i = 0; i < 3; i++) {
				assert.equal(zxAudio.nextFrame[i], 1.0);
			}

			// startValue = false
			beeperBuffer = {
				totalLength: 4,
				startValue: false,
				buffer: new Uint16Array([4]),
				bufferLen: 1
			};
			zxAudio.writeBeeperSamples(beeperBuffer);
			assert.equal(zxAudio.nextFrameIndex, 7);
			for (let i = 3; i < 7; i++) {
				assert.equal(zxAudio.nextFrame[i], 0.0);
			}
		});
	});

});


