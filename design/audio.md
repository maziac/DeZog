# Audio

The audio implementation of the internal Z80 simulator ("zsim") allows to use the ZX Spectrum Beeper.

It is based on the "HTML5 "Web Audio API" because I didn't find any working cross platform node package to use otherwise.
The "Web Audio API" should work on all platforms.

One drawback of this approach is that the audio data needs to get to the web view.
The data is serialized in between so not the full audio samples are sent but instead the differential beeper data. I.e. only the length (in samples) up to the next beeper state change is stored in the "BeeperBuffer".

The ZSimulationView transfers the data to the web view at about the "updateFrequency".

In ZxAudio it is decoded and audio frame buffer with the sampels are created and started at the right timing.


# Overview

~~~
┌──────────────────────────────┐
│ZSimRemote                    │
│ ┌────────────────────────┐   │
│ │ZxBeeper                │   │
│ │  ┌──────────────────┐  │   │
│ │  │   BeeperBuffer   │  │   │
│ │  └──────────────────┘  │   │
│ │            │           │   │
│ └────────────┼───────────┘   │  "updateFrequency"
└──────────────┼───────────────┘           │
               │                           │
               ▼                           ▼
      ┌───────────────────────────────────────┐
      │            ZSimulationView            │
      └───────────────────────────────────────┘
                          │
                          │ Serialization
      ┌───────────────────┼───────────────────┐
      │WebView            ▼                   │
      │        ┌─────────────────────┐        │
      │        │        Main         │        │
      │        └─────────────────────┘        │
      │                   │                   │
      │                   ▼                   │
      │        ┌─────────────────────┐        │
      │        │       ZxAudio       │        │
      │        └─────────────────────┘        │
      │                   │                   │
      │                   ▼                   │
      │        ┌────────────────────┐         │      ┌───────────┐
      │        │   Web Audio api    │─────────┼─────▶│Loudspeaker│
      │        └────────────────────┘         │      └───────────┘
      └───────────────────────────────────────┘
~~~


# Latency

Latency is quite high, about 100-200ms. I.e. it is noticeable.
This is for one due to the design (update at "updateFrequency", collecting data in BeeperBuffer) but also due to the "Web Audio API" which is well suited for games in general but not so much for emulation.
I.e. the "Web Audio API" requires an exact start time for each sample. With 'long' samples representing a complete sound this is no problem, but for exact timings within frames it is not optimal. One big problem here is the accuracy of the floating point values used for the start time. It is not accurate enough for sample precise timings.


# BeeperBuffer Encoding

If "zxBeeper" is enabled the simulation installs an outport at address 0x1E, or better: at all even out addresses.
When a new different value is written to the beeper (bit 4) an entry is generated in the BeeperBuffer containing the length (in samples) to the last beeper state.


# ZSimulationView

The ZSimualtionView starts a timer with "updateFrequency".

This timer is used to
- update the display
- update the audio

For the audio the data is read from the BeeperBuffer and transferred to the webview.

The update frequency is more a "hint" rather than an exact time. In order to reduce display flickering the ZSimulationView tries to sync with the vertical interrupt.
In reality that means that ZSimulationview will do an update in a shorter period than the updateFrequency.
I.e. it uses the last vertical interrupt before the updateFrequency time would elapse.
If there did not happen any vertical interrupt before the updateFrequence time would elapse then the update happens at the updateFrequency time.


# Main

Main is just a dispatcher. All messages that arrive here (e.g. display, audio) are sent to the right functions.

Audio data is sent to ZxAudio.


# ZxAudio

ZxAudio receives the BeeperBuffer data and decodes it into samples and complete audio frames.
Because of the problems with the floating point accuracy in "Web Audio API" the ZxAudio works with fixed frame sizes.
This also means that a received BeeperBuffer may not fill a complete audio frame or could also fill more than 1 audio frame.

When an audio frame is completely filled up is is enqueued for playing. This simply means it is started with a start time in the near future.

If an audio frame is not filled up yet the ZxAudio simply waits for the next BeeperBuffer.


## Overfill

The Z80 simulator time and the host system time are not synchronized. For audio you should leave the "limitSpeed" enabled (the default state). So that the simulation speed and the timing of the audio is at least similar.
But still they are not fully synchronized.

If the simulator runs too fast it will produce more samples then the host system can play.
In this case frames are dropped.

Therefore the buffered time is measured and if bigger than MAX_LATENCY the audio frame is simply dropped by not creating one (see writeBeeperSamples).


## Underfill

If the simulator speed is slower than the host system there are not enough samples to play. I.e. gaps happen.

The gap is an audio frame with all values equal to the last played sample to prevent that a clicking sound is hearable.

If audio data is already present in the prepared audio frame then only the rest of the audio frame is filled with same data.

The 'startGapFiller' is called when an audio frame ends and the buffered time is less or equal to one frame time.


# Simulator Breaks

While running the simulator there are frequent breaks. E.g. when a breakpoint is hit or when you step-over an instruction (simulation starts and stops immediately).

The audio design tries to avoid frequent audio clicks while stepping. It furthermore pauses audio frame generation in the breaks in order to lower the overall host system load.

The problem to solve here is: if the last beeper value was a 1 and then the audio is paused this would mean there is a hearable change from 1 to 0.
With the simulation the beeper value is again set to 1, so another hearable change from 0 to 1 and so forth.

To avoid this a "trick" is used.

The beeper value can be 1 or 0. These values are not mapped to 1 and -1 but instead to 1 and 0 or depending on the situation to 0 and -1.

When the simulator detects a user break it sends a "cpuStopped" command to the audio which in turn will react with fading the gain (to avoid a click) and afterwards not creating any gap fillers anymore.
This will stop the audio activity.

Audio activityis restarted by the next 'writeBeeperSamples' coming from the simulator.

This also means that from now one a beeper value of 1 is output as 0 in the host audio system. If the beeper value changes to 0 the host output will change to -1.


# Load Measurements

Some CPU load measurements done on a mac mini (late 2018) for a ZX 48K Spectrum simulation at normal speed ("limitSpeed" = true).

|     | Without Simulation | Simulation without Display and Audio | Simulation with Display | Simulation with Audio | Simulation with Display and Audio |
|---|:-:|:-:|:-:|:-:|:-:|
| User  | 2% | 25% | 32% | 38% | 47% |
|System | 2% |  3% |  4% |  5% |  8% |











