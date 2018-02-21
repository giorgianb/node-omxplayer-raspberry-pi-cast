'use strict';
const EventEmitter = require('events');
const spawn = require('child_process').spawn;
const dbus = require('dbus-native');
const fs = require('fs');
const username = require('username');

const OMXPLAYER_DBUS_PATH = '/org/mpris/MediaPlayer2';
const OMXPLAYER_DBUS_DESTINATION = 'org.mpris.MediaPlayer2.omxplayer';
const OMXPLAYER_DBUS_PROPERTIES_INTERFACE = 'org.freedesktop.DBus.Properties';
const OMXPLAYER_DBUS_PLAYER_INTERFACE = 'org.mpris.MediaPlayer2.Player';

const OMXPLAYER_DBUS_ADDRESS_DIR = "/tmp/";
const OMXPLAYER_DBUS_ADDRESS_FILE = "omxplayerdbus." + username.sync();

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
    this._omxplayer_dbus_ready = false;

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
    this._omxplayer_dbus_session_bus.invoke({
      path: OMXPLAYER_DBUS_PATH,
      interface: OMXPLAYER_DBUS_PLAYER_INTERFACE,
      member: 'Play',
      destination: OMXPLAYER_DBUS_DESTINATION
    }, callback);
  }

  pause(callback) { 
    this._omxplayer_dbus_session_bus.invoke({
      path: OMXPLAYER_DBUS_PATH,
      interface: OMXPLAYER_DBUS_PLAYER_INTERFACE,
      member: 'Pause',
      destination: OMXPLAYER_DBUS_DESTINATION
    }, callback);
  }

  getPlaybackStatus(callback) {
    this._omxplayer_dbus_session_bus.invoke({
      path: OMXPLAYER_DBUS_PATH,
      interface: OMXPLAYER_DBUS_PROPERTIES_INTERFACE,
      member: 'PlaybackStatus',
      destination: OMXPLAYER_DBUS_DESTINATION
    }, callback);
  }

  getVolume(callback) {
    this._omxplayer_dbus_session_bus.invoke({
      path: OMXPLAYER_DBUS_PATH,
      interface: OMXPLAYER_DBUS_PROPERTIES_INTERFACE,
      member: 'Volume',
      destination: OMXPLAYER_DBUS_DESTINATION
    }, callback);
  }

  setVolume(volume, callback) {
    this._omxplayer_dbus_session_bus.invoke({
      path: OMXPLAYER_DBUS_PATH,
      interface: OMXPLAYER_DBUS_PROPERTIES_INTERFACE,
      member: 'Volume',
      signature: 'd',
      body: [volume],
      destination: OMXPLAYER_DBUS_DESTINATION
    }, callback);
  }

  changeVolume(change, callback) {
    this.getVolume((err, res) => {
      if (err)
        callback(err, res);
      this.setVolume(res + change, callback);
    });
  }

  increaseVolume(callback) { 
    this._omxplayer_dbus_session_bus.invoke({
      path: OMXPLAYER_DBUS_PATH,
      interface: OMXPLAYER_DBUS_PLAYER_INTERFACE,
      member: 'Action',
      signature: 'i',
      body: [18],
      destination: OMXPLAYER_DBUS_DESTINATION
    }, callback);
  }
        
  decreaseVolume(callback) { 
    this._omxplayer_dbus_session_bus.invoke({
      path: OMXPLAYER_DBUS_PATH,
      interface: OMXPLAYER_DBUS_PLAYER_INTERFACE,
      member: 'Action',
      signature: 'i',
      body: [17],
      destination: OMXPLAYER_DBUS_DESTINATION
    }, callback);
  }

  fastForward() { 
    this._omxplayer_dbus_session_bus.invoke({
      path: OMXPLAYER_DBUS_PATH,
      interface: OMXPLAYER_DBUS_PLAYER_INTERFACE,
      member: 'Action',
      signature: 'i',
      body: [4],
      destination: OMXPLAYER_DBUS_DESTINATION
    }, callback);

  }

  rewind() { 
    this._omxplayer_dbus_session_bus.invoke({
      path: OMXPLAYER_DBUS_PATH,
      interface: OMXPLAYER_DBUS_PLAYER_INTERFACE,
      member: 'Action',
      signature: 'i',
      body: [3],
      destination: OMXPLAYER_DBUS_DESTINATION
    }, callback);
  }

  seek(offset, callback) {
    this._omxplayer_dbus_session_bus.invoke({
      path: OMXPLAYER_DBUS_PATH,
      interface: OMXPLAYER_DBUS_PLAYER_INTERFACE,
      member: 'Seek',
      signature: 'x',
      body: [offset],
      destination: OMXPLAYER_DBUS_DESTINATION
    }, callback);
  }

  quit(callback) { 
    this._omxplayer_dbus_session_bus.invoke({
      path: OMXPLAYER_DBUS_PATH,
      interface: OMXPLAYER_DBUS_PLAYER_INTERFACE,
      member: 'Action',
      signature: 'i',
      body: [15],
      destination: OMXPLAYER_DBUS_DESTINATION
    }, callback);
  }

  
  showSubtitles(callback) { 
    this._omxplayer_dbus_session_bus.invoke({
      path: OMXPLAYER_DBUS_PATH,
      interface: OMXPLAYER_DBUS_PLAYER_INTERFACE,
      member: 'Action',
      signature: 'i',
      body: [31],
      destination: OMXPLAYER_DBUS_DESTINATION
    }, callback);

  }

  hideSubtitles() { 
    this._omxplayer_dbus_session_bus.invoke({
      path: OMXPLAYER_DBUS_PATH,
      interface: OMXPLAYER_DBUS_PLAYER_INTERFACE,
      member: 'Action',
      signature: 'i',
      body: [30],
      destination: OMXPLAYER_DBUS_DESTINATION
    }, callback);
  } 


  getSpeed(callback) {
    this._omxplayer_dbus_session_bus.invoke({
      path: OMXPLAYER_DBUS_PATH,
      interface: OMXPLAYER_DBUS_PROPERTIES_INTERFACE,
      member: 'Rate',
      destination: OMXPLAYER_DBUS_DESTINATION
    }, callback);
  }

  setSpeed(speed, callback) {
    this._omxplayer_dbus_session_bus.invoke({
      path: OMXPLAYER_DBUS_PATH,
      interface: OMXPLAYER_DBUS_PROPERTIES_INTERFACE,
      member: 'Rate',
      signature: 'd',
      body: [speed],
      destination: OMXPLAYER_DBUS_DESTINATION
    }, callback);
  }

  increaseSpeed() { 
    this._omxplayer_dbus_session_bus.invoke({
      path: OMXPLAYER_DBUS_PATH,
      interface: OMXPLAYER_DBUS_PLAYER_INTERFACE,
      member: 'Action',
      signature: 'i',
      body: [2],
      destination: OMXPLAYER_DBUS_DESTINATION
    }, callback);
  }

  decreaseSpeed() { 
    this._omxplayer_dbus_session_bus.invoke({
      path: OMXPLAYER_DBUS_PATH,
      interface: OMXPLAYER_DBUS_PLAYER_INTERFACE,
      member: 'Action',
      signature: 'i',
      body: [1],
      destination: OMXPLAYER_DBUS_DESTINATION
    }, callback);
  }

  previousChapter(callback) { 
     this._omxplayer_dbus_session_bus.invoke({
      path: OMXPLAYER_DBUS_PATH,
      interface: OMXPLAYER_DBUS_PLAYER_INTERFACE,
      member: 'Previous',
      destination: OMXPLAYER_DBUS_DESTINATION
    }, callback);
  }

  nextChapter() { 
    this._omxplayer_dbus_session_bus.invoke({
      path: OMXPLAYER_DBUS_PATH,
      interface: OMXPLAYER_DBUS_PLAYER_INTERFACE,
      member: 'Previous',
      destination: OMXPLAYER_DBUS_DESTINATION
    }, callback);
  }

  previousAudio() { 
    this._omxplayer_dbus_session_bus.invoke({
      path: OMXPLAYER_DBUS_PATH,
      interface: OMXPLAYER_DBUS_PLAYER_INTERFACE,
      member: 'Action',
      signature: 'i',
      body: [1],
      destination: OMXPLAYER_DBUS_DESTINATION
    }, callback);

  }

  nextAudio() { 
    this._omxplayer_dbus_session_bus.invoke({
      path: OMXPLAYER_DBUS_PATH,
      interface: OMXPLAYER_DBUS_PLAYER_INTERFACE,
      member: 'Action',
      signature: 'i',
      body: [1],
      destination: OMXPLAYER_DBUS_DESTINATION
    }, callback);

  }

  previousSubtitle() { 
    this._omxplayer_dbus_session_bus.invoke({
      path: OMXPLAYER_DBUS_PATH,
      interface: OMXPLAYER_DBUS_PLAYER_INTERFACE,
      member: 'Action',
      signature: 'i',
      body: [10],
      destination: OMXPLAYER_DBUS_DESTINATION
    }, callback);

  }

  nextSubtitle() { 
    this._omxplayer_dbus_session_bus.invoke({
      path: OMXPLAYER_DBUS_PATH,
      interface: OMXPLAYER_DBUS_PLAYER_INTERFACE,
      member: 'Action',
      signature: 'i',
      body: [11],
      destination: OMXPLAYER_DBUS_DESTINATION
    }, callback);

  }

  decreaseSubtitleDelay() { 
    this._omxplayer_dbus_session_bus.invoke({
      path: OMXPLAYER_DBUS_PATH,
      interface: OMXPLAYER_DBUS_PLAYER_INTERFACE,
      member: 'Action',
      signature: 'i',
      body: [13],
      destination: OMXPLAYER_DBUS_DESTINATION
    }, callback);

  }

  increaseSubtitleDelay() { 
    this._omxplayer_dbus_session_bus.invoke({
      path: OMXPLAYER_DBUS_PATH,
      interface: OMXPLAYER_DBUS_PLAYER_INTERFACE,
      member: 'Action',
      signature: 'i',
      body: [14],
      destination: OMXPLAYER_DBUS_DESTINATION
    }, callback);
  }

  get ready() {
    return this._omxplayer_dbus_ready;
  }

  get running() {
    return this._omxplayer_open;
  }

  /* Private Methods */
  _omxplayer_spawnPlayer(source, output, loop, initialVolume, showOsd) {
    this._omxplayer_dbus_ready = false;

    let args = buildArgs(source, output, loop, initialVolume, showOsd);
    let omxProcess = spawn('omxplayer', args);
    this._omxplayer_open = true;

    omxProcess.stdin.setEncoding('utf-8');
    omxProcess.once('close', this._omxplayer_updateStatus);

    omxProcess.once('error', () => {
      this._omxplayer_emitError('Problem running omxplayer, is it installed?.');
    });

    this._omxplayer_player = omxProcess;
    const exists = fs.exists(OMXPLAYER_DBUS_ADDRESS_DIR + OMXPLAYER_DBUS_ADDRESS_FILE, (exists) => {
      if (exists) {
        this._omxplayer_initialize_dbus();
      } else {
        let closed = false;
        // in case created between previous exists call and watcher intialization
        setTimeout(() => {
          if (fs.existsSync(OMXPLAYER_DBUS_ADDRESS_DIR + OMXPLAYER_DBUS_ADDRESS_FILE) && !closed) {
            if (!closed) {
              watcher.close();
              closed = true;
              this._omxplayer_initialize_dbus();
            }
          }
        }, 100);

        let watcher = fs.watch(OMXPLAYER_DBUS_ADDRESS_DIR, (eventType, fileName) => {
          if (fileName == OMXPLAYER_DBUS_ADDRESS_FILE && eventType == "change") {
            watcher.close();
            closed = true;
            this._omxplayer_initialize_dbus();
          }
        }); 
      }
    });
  }

  _omxplayer_initialize_dbus() {
    const sessionBus = dbus.sessionBus({
      busAddress: String(fs.readFileSync(OMXPLAYER_DBUS_ADDRESS_DIR + OMXPLAYER_DBUS_ADDRESS_FILE, 'ascii')).trim()
    });

    if (!sessionBus)
      throw new Error("Could not connect to the DBus session bus.");

    this._omxplayer_dbus_session_bus = sessionBus;
    this._omxplayer_dbus_ready = true;
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
