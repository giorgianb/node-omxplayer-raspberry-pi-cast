'use strict';
const EventEmitter = require('events');
const spawn = require('child_process').spawn;

/*
In preparation for the move to DBus
const dbus = require('dbus-native');
const conn = dbus.createConnection();
const OMXPLAYER_DBUS_PATH = '/org/mpris/MediaPlayer2';
const OMXPLAYER_DBUS_DESTINATION = 'org.mpris.MediaPlayer2.omxplayer';
const OMXPLAYER_DBUS_PROPERTIES_INTERFACE = 'org.freedesktop.DBus.Properties';
const OMXPLAYER_DBUS_PLAYER_INTERFACE = 'org.freedesktop.MediaPlayer2.Player';
*/

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

	let args = [source, '-o', output, '--blank', osd ? '' : '--no-osd'];

	// Handle the loop argument, if provided
	if (loop)
		args.push('--loop');

	// Handle the initial volume argument, if provided
	if (Number.isInteger(initialVolume))
		args.push('--vol', initialVolume);

	return args;
}

/* TODO: Once class is migrated to D-Bus and well tested, rename to OMXPlayer */
class OMXPlayer extends EventEmitter {
  constructor(source, givenOutput, loop, initalVolume, showOsd) {
    super();
    let player = null
    let open = false

    /* Functions with access to private variables */
    function updateStatus() {
      open = false
      this.emit('close')
    }
    
    function emitError(message) {
      open = false;
      this.emit('error', message);

    }

    function spawnPlayer(src, out, loop, initialVolume, showOsd) {
      let args = buildArgs(src, out, loop, initialVolume, showOsd);
      let omxProcess = spawn('omxplayer', args);
      open = true;

      omxProcess.stdin.setEncoding('utf-8');
      omxProcess.on('close', updateStatus);

      omxProcess.on('error', () => {
        emitError('Problem running omxplayer, is it installed?.');
      });

      return omxProcess;
    }

    function writeStdin (value) {
      if (open)
        player.stdin.write(value);
      else
        throw new Error('Player is closed.');
    }

    this.newSource = (src, out, loop, initialVolume, showOsd) => {
      if (open) {
        player.on('close', () => { player = spawnPlayer(src, out, loop, initialVolume, showOsd); });
        player.removeListener('close', updateStatus);
        writeStdin('q');
      } else
        player = spawnPlayer(src, out, loop, initialVolume, showOsd);
    };

    this.play = () => { writeStdin('p'); };
    this.pause = () => { writeStdin('p'); };
    this.volUp = () => { writeStdin('+'); };
    this.volDown = () => { writeStdin('-'); };
    this.fastFwd = () => { writeStdin('>'); };
    this.rewind = () => { writeStdin('<'); };
    this.fwd30 =() => { writeStdin('\u001b[C'); };
    this.back30 = () => { writeStdin('\u001b[D'); };
    this.fwd600 = () => { writeStdin('\u001b[A'); };
    this.back600 = () => { writeStdin('\u001b[B'); };
    this.quit = () => { writeStdin('q'); };
    this.subtitles = () => { writeStdin('s'); };
    this.info = () => { writeStdin('z'); };
    this.incSpeed = () => { writeStdin('1'); };
    this.decSpeed = () => { writeStdin('2'); };
    this.prevChapter = () => { writeStdin('i'); };
    this.nextChapter = () => { writeStdin('o'); };
    this.prevAudio = () => { writeStdin('j'); };
    this.nextAudio = () => { writeStdin('k'); };
    this.prevSubtitle = () => { writeStdin('n'); };
    this.nextSubtitle = () => { writeStdin('m'); };
    this.decSubDelay = () => { writeStdin('d'); };
    this.incSubDelay = () => { writeStdin('f'); };

    Object.defineProperty(this, 'running', {
      get: () => { return open; }
    });
  }
}

module.exports = OMXPlayer;
