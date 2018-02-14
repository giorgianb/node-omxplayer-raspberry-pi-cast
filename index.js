'use strict';
const EventEmitter = require('events');
const spawn = require('child_process').spawn;

const dbus = require('dbus-native');
const conn = dbus.createConnection();
const OMXPLAYER_DBUS_PATH = '/org/mpris/MediaPlayer2';
const OMXPLAYER_DBUS_DESTINATION = 'org.mpris.MediaPlayer2.omxplayer';
const OMXPLAYER_DBUS_PROPERTIES_INTERFACE = 'org.freedesktop.DBus.Properties';
const OMXPLAYER_DBUS_PLAYER_INTERFACE = 'org.freedesktop.MediaPlayer2.Player';

function buildArgs(source, givenOutput, loop, initialVolume, showOsd) {
  const ALLOWED_OUTPUTS = ['hdmi', 'local', 'both', 'alsa'];
	let output = '';

	if (givenOutput) {
		if (ALLOWED_OUTPUTS.indexOf(givenOutput) === -1) 
			throw new Error(`Output ${givenOutput} not allowed.`);

		output = givenOutput;

	} else
		output = 'local';

	let osd = false;
	if (showOsd)
		osd = showOsd;

	let args = [
    source, 
    '-o',  output,
    '--blank', 
    osd ? '' : '--no-osd', '',
    '--dbus_name', OMXPLAYER_DBUS_DESTINATION
  ];

	// Handle the loop argument, if provided
	if (loop)
		args.push('--loop');

	// Handle the initial volume argument, if provided
	if (Number.isInteger(initialVolume))
		args.push('--vol', initialVolume);

	return args;
}

class OMXPlayer extends EventEmitter { 
  constructor(source, output, loop, initialVolume, showOsd) {
    super();
    this._omxplayer_player = null;
    this._omxplayer_open = false;

    if (source)
      this._omxplayer_spawnPlayer(source, output, loop, initialVolume, showOsd);
  }

  /* Public Methods */
  newSource(src, out, loop, initialVolume, showOsd) {
    if (this._omxplayer_open) {
      this._omxplayer_player.on('close', () => { 
        this._omxplayer_spawnPlayer(src, out, loop, initialVolume, showOsd); 
      });

      this._omxplayer_player.removeListener('close', this._omxplayer_updateStatus);
      this._omxplayer_writeStdin('q');
    } else
      this._omxplayer_spawnPlayer(src, out, loop, initialVolume, showOsd);
  };

  play() { 
    this._omxplayer_writeStdin('p'); 
  }

  pause() { 
    this._omxplayer_writeStdin('p'); 
  }

  volUp() { 
    this._omxplayer_writeStdin('+'); 
  }

  volDown() { 
    this._omxplayer_writeStdin('-'); 
  }

  fastFwd() { 
    this._omxplayer_writeStdin('>'); 
  }

  rewind() { 
    this._omxplayer_writeStdin('<'); 
  }

  fwd30() { 
    this._omxplayer_writeStdin('\u001b[C'); 
  }

  back30() { 
    this._omxplayer_writeStdin('\u001b[D'); 
  }

  fwd600() { 
    this._omxplayer_writeStdin('\u001b[A'); 
  }

  back600() { 
    this._omxplayer_writeStdin('\u001b[B'); 
  }

  quit() { 
    this._omxplayer_writeStdin('q'); 
  }

  subtitles() { 
    this._omxplayer_writeStdin('s'); 
  }

  info() { 
    this._omxplayer_writeStdin('z'); 
  }

  incSpeed() { 
    this._omxplayer_writeStdin('1'); 
  }

  decSpeed() { 
    this._omxplayer_writeStdin('2'); 
  }

  prevChapter() { 
    this._omxplayer_writeStdin('i'); 
  }

  nextChapter() { 
    this._omxplayer_writeStdin('o'); 
  }

  prevAudio() { 
    this._omxplayer_writeStdin('j'); 
  }

  nextAudio() { 
    this._omxplayer_writeStdin('k'); 
  }

  prevSubtitle() { 
    this._omxplayer_writeStdin('n'); 
  }

  nextSubtitle() { 
    this._omxplayer_writeStdin('m'); 
  }

  decSubDelay() { 
    this._omxplayer_writeStdin('d'); 
  }

  incSubDelay() { 
    this._omxplayer_writeStdin('f'); 
  }

  get running() {
    return this._omxplayer_open;
  }

  /* Private Methods */
  _omxplayer_spawnPlayer(source, output, loop, initialVolume, showOsd) {
    let args = buildArgs(src, out, loop, initialVolume, showOsd);
    let omxProcess = spawn('omxplayer', args);
    this._omxplayer_open = true;

    omxProcess.stdin.setEncoding('utf-8');
    omxProcess.on('close', updateStatus);

    omxProcess.on('error', () => {
      this._omxplayer_emitError('Problem running omxplayer, is it installed?.');
    });

    this._omxplayer_player = omxProcess;
  }

  _omxplayer_writeStdin(value) {
    if (this._omxplayer_open)
      this._omxplayer_player.stdin.write(value);
    else
      throw new Error('Player is closed.');
  }

  _omxplayer_updateStatus() {
    this._omxplayer_open = false
    this.emit('close')
  }

  _omxplayer_emitError() {
    this._omxplayer_open = false
    this.emit('close')
  }
}

module.exports = OMXPlayer;
