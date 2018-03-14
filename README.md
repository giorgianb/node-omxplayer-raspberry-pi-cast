# node-omxplayer-raspberry-pi-cast

Modern node library for controlling omxplayer with D-Bus, specifically built for the [raspberry-pi-cast](https://gitlab.com/raspberry-pi-cast).

## Get Started

```js

// Import the module.
const OMXPlayer = require('node-omxplayer-raspberry-pi-cast');

// Create an instance of the player with the source, looping it and without showing an on screen display
const player = new OMXPlayer({ source: 'my-video.mp4', loop: true, noOsd: true });

// Control video/audio playback.
player.play((err) => { console.log(err); });
player.increaseVolume((err) => { console.log(err); });
player.getVolume((err, vol) => { if (err) console.log(err); else console.log(vol); });
player.quit();
```

**Warning**: If you quit node before quitting the player, there is a chance of a zombie process being created, which will persist until the current audio/video track ends.

## Installation

```
npm install node-omxplayer-raspberry-pi-cast
```

This module relies on omxplayer being installed. On the default version of Raspbian it is installed by default, but on the Lite version you will have to install it:

```
sudo apt-get install omxplayer
```

## API

### OMXPlayer({ *source: [source]*, *output: [output]*, *loop: [loop]*, *initalVolume: [initialVolume]*, *noOsd: [noOsd]* })

The constructor method, used to launch omxplayer with a source.

- `source` (optional): The playback source, any audio or video file (or stream) that omxplayer is capable of playing. If left blank, the player will initialise and wait for a source to be added later with the `newSource` method.

- `output` (optional): The audio output, if left blank will default to 'local', can be one of:
    + local - the analog output (3.5mm jack).
    + hdmi - the HDMI port audio output.
    + both - both of the above outputs.
    
- `loop` (optional): Loop state, if set to true, will loop file if it is seekable. If left blank will default to false.

    **Warning**: As stated above, if you quit node before quitting the player, a zombie process may be created. If this occurs when the loop option is in place, the `omxplayer` process may run indefinitely.

- `initialVolume` (optional): The initial volume, omxplayer will start with this value (in millibels). If left blank will default to 0.
- `noOsd` (optional): If true, disables OMXPlayer's on-screen display. False by default.

### player.newSource({ *source: [source]*, *output: [output]*, *loop: [loop]*, *initalVolume: [initialVolume]*, *noOsd: [noOsd]* })

Starts playback of a new source, the arguments are identical to those of the `Omx` constructor method described above. If a file is currently playing, ends this playback and begins the new source.

### player.play()

Resumes playback.

### player.pause()

Pauses playback.

### player.increaseVolume()

Increases the volume.

### player.decreaseVolume()

Decreases the volume.

### player.fastForward()

Fast forwards playback.

### player.rewind()

Rewinds playback.

### player.quit()

Quits the player.

### player.subtitles()

Toggle subtitles.

### player.info()

Provides info on the currently playing file.

### player.increaseSpeed()

Increases playback speed.

### player.decreaseSpeed()

Decreases playback speed.

### player.previousChapter()

Skips to previous chapter.

### player.nextChapter()

Skips to next chapter.

### player.previousAudio()

Skips to previous audio stream.

### player.nextAudio()

Skips to next audio stream.

### player.previousSubtitle()

Skips to previous subtitle stream.

### player.nextSubtitle()

Skips to next subtitle stream.

### player.decreaseSubtitleDelay()

Decrease subtitle delay by 250ms.

### player.increaseSubtitleDelay()

Increase subtitle delay by 250ms.

### player.running

Boolean giving the playback status, `true` if the player is still active, `false` if it has ended or the player has quit.

### player.ready

Boolean giving whether the player is ready to accept commands, `true` if the player is ready, `false` otherwise.

## Events

### 'close'

Fired when playback has finished.

### 'error'

Occurs when there is a problem with omxplayer. Includes a message with more information about the error.

## Errors

### 'Output <foo> not allowed.'

Incorrect audio output type passed to the player, see `Omx` in the API section above. Can occur for the `Omx` constructor and the `newSource` method.

### 'Player is closed.'

An attempt has been made to send a command to the player after it has closed. Prevent this from happening by checking if it is still running using the `running` getter method. Can occur for any of the player methods except `newSource`.
