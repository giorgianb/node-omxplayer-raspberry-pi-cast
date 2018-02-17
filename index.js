'use strict';
const EventEmitter = require('events');
const spawn = require('child_process').spawn;
const dbus = require('dbus-native');
const fs = require('fs');
const username = require('username');

const OMXPLAYER_DBUS_PATH = '/org/mpris/MediaPlayer2';
const OMXPLAYER_DBUS_DESTINATION = 'org.mpris.MediaPlayer2.omxplayer';
const OMXPLAYER_DBUS_PROPERTIES_INTERFACE = 'org.freedesktop.DBus.Properties';
const OMXPLAYER_DBUS_PLAYER_INTERFACE = 'org.freedesktop.MediaPlayer2.Player';

const OMXPLAYER_DBUS_ADDRESS_DIR = "/tmp/";
const OMXPLAYER_DBUS_ADDRESS_FILE = "omxplayer." + username.sync();

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
  }

  play(callback) { 
//    this._omxplayer_writeStdin('p'); 
    this._omxplayer_dbus_player.Play(callback);
  }

  pause(callback) { 
//    this._omxplayer_writeStdin('p'); 
    this._omxplayer_dbus_player.Pause(callback);
  }

  getPlayStatus(callback) {
    this._omxplayer_dbus_properties.Get(OMXPLAYER_DBUS_DESTINATION, "PlayStatus", callback);
  }

  getVolume(callback) {
    this._omxplayer_dbus_properties.Get(OMXPLAYER_DBUS_DESTINATION, "Volume", callback);
  }

  setVolume(volume, callback) {
    this._omxplayer_dbus_properties.Set(OMXPLAYER_DBUS_DESTINATION, "Volume", volume, callback);
  }

  changeVolume(change, callback) {
    this.getVolume(callback);
  }

  volUp(callback) { 
//    this._omxplayer_writeStdin('+'); 
    this.changeVolume(3 * 10^6, callback);
  }
        
  volDown(callBack) { 
//    this._omxplayer_writeStdin('-'); 
    this.changeVolume(-3 * 10-6, callback);
  }

  /*
  fastFwd() { 
    this._omxplayer_writeStdin('>'); 
  }

  rewind() { 
    this._omxplayer_writeStdin('<'); 
  }*/

  seek(offset, callback) {
    this._omxplayer_dbus_player.Seek(offset, callback);
  }

  fwd30(callback) { 
    this.seek(30 * 10^6, callback);
  }

  back30(callback) { 
    this.seek(-30 * 10^6, calback);
  }

  fwd600(callback) { 
//    this._omxplayer_writeStdin('\u001b[A'); 
    this.seek(600 * 10^6, callback);
  }

  back600(callback) { 
//    this._omxplayer_writeStdin('\u001b[B'); 
    this.seek(-600 * 10^6, callback);
  }

  quit(callback) { 
//    this._omxplayer_writeStdin('q'); 
    this._omxplayer_dbus_player.Quit(callback);
  }

  showSubtitles(callback) { 
//    this._omxplayer_writeStdin('s'); 
    this._omxplayer_dbus_player.ShowSubtitles(callback);
  }

  hideSubtitles() { 
//    this._omxplayer_writeStdin('s'); 
    this._omxplayer_dbus_player.HideSubtitles(callback);
  }


  /*
  info() { 
    this._omxplayer_writeStdin('z'); 
  }*/

  getSpeed(callback) {
    this._omxplayer_dbus_properties.Get(OMXPLAYER_DBUS_DESTINATION, "Rate", callback);
  }

  setSpeed(speed, callback) {
    this._omxplayer_dbus_properties.Set(OMXPLAYER_DBUS_DESTINATION, "Rate", speed, callback);
  }

  /*
  incSpeed() { 
    this._omxplayer_writeStdin('1'); 
  }

  decSpeed() { 
    this._omxplayer_writeStdin('2'); 
  }*/

  prevChapter(callback) { 
//    this._omxplayer_writeStdin('i'); 
    this._omxplayer_dbus_player.Previous(callback);
  }

  nextChapter() { 
//    this._omxplayer_writeStdin('o'); 
    this._omxplayer_dbus_player.Skip(callback);
  }

  /*
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
  }*/

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
    fs.exists(OMXPLAYER_DBUS_ADDRESS_DIR + OMXPLAYER_DBUS_ADDRESS_FILE, (exists) => {
      if (exists)
        this._omxplayer_initialize_dbus();
      else {
        let watcher = fs.watch(OMXPLAYER_DBUS_ADDRESS_DIR, (eventType, fileName) => {
          if (fileName == OMXPLAYER_DBUS_ADDRESS_FILE && eventType == "change") {
            watcher.close();
            this._omxplayer_initialize_dbus();
          }
        }); 
      }
    });
  }

  _omxplayer_initialize_dbus() {
    const sessionBus = dbus.sessionBus({
      busAddress: fs.readFileSync(OMXPLAYER_DBUS_ADDRESS_DIR + OMXPLAYER_DBUS_ADDRESS_FILE)
    });

    if (!sessionBus)
      throw new Error("Could not connect to the DBus session bus.");

    const service = sessionBus.getService(OMXPLAYER_DBUS_DESTINATION);
    service.getInterface(OMXPLAYER_DBUS_PATH, OMXPLAYER_PROPERTIES_INTERFACE, (err, iface) => {
      if (err)
        throw new Error("Could not request properties interface");

      this._omxplayer_dbus_properties = iface;
    });
    service.getInterface(OMXPLAYER_DBUS_PATH, OMXPLAYER_DBUS_PLAYER_INTERFACE, (err, iface) => { 
      if (err) 
        throw new Error("Could not request properties interface"); 
      this._omxplayer_dbus_player = iface;
    });
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
