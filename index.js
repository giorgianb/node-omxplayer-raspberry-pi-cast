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

/*
 * opts = {
 * source,
 * output,
 * loop,
 * initialVolume,
 * noOsd
 * } 
 * */

function buildArgs(opts) {
  const ALLOWED_OUTPUTS = ['hdmi', 'local', 'both', 'alsa'];
	let output = '';

	if (opts.output) {
		if (ALLOWED_OUTPUTS.indexOf(opts.output) === -1) 
			throw new Error(`Output ${opts.output} not allowed.`);

		output = opts.output;

	} else
		output = 'local';

	let args = [
    opts.source, 
    '-o',  output,
    '--blank', 
    opts.noOsd ? '--no-osd' : '',
    '--dbus_name', OMXPLAYER_DBUS_DESTINATION
  ];

	// Handle the opts.loop argument, if provided
	if (opts.loop)
		args.push('--loop');

	// Handle the initial volume argument, if provided
	if (Number.isInteger(opts.initialVolume))
		args.push('--vol', opts.initialVolume);

	return args;
}

class OMXPlayer extends EventEmitter { 
  constructor(opts, callback) {
    super();
    this._omxplayer_player = null;
    this._omxplayer_open = false;
    this._omxplayer_dbus_ready = false;

    if (opts.source)
      this._omxplayer_spawnPlayer(opts, callback);
  }

  /* Public Methods */
  newSource(opts, callback) {
    if (this.running) {
      this._omxplayer_player.on('close', () => { 
        this._omxplayer_spawnPlayer(opts, callback);
      });

      this._omxplayer_player.removeListener('close', this._omxplayer_updateStatus);
      this.quit();
    } else
      this._omxplayer_spawnPlayer(opts, callback);
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

  getDuration(callback) {
    this._omxplayer_dbus_session_bus.invoke({
      path: OMXPLAYER_DBUS_PATH,
      interface: OMXPLAYER_DBUS_PROPERTIES_INTERFACE,
      member: 'Duration',
      destination: OMXPLAYER_DBUS_DESTINATION
    }, callback);
  }

  getPosition(callback) {
    this._omxplayer_dbus_session_bus.invoke({
      path: OMXPLAYER_DBUS_PATH,
      interface: OMXPLAYER_DBUS_PROPERTIES_INTERFACE,
      member: 'Position',
      destination: OMXPLAYER_DBUS_DESTINATION
    }, callback);
  }

  setPosition(position, callback) {
    this._omxplayer_dbus_session_bus.invoke({
      path: OMXPLAYER_DBUS_PATH,
      interface: OMXPLAYER_DBUS_PLAYER_INTERFACE,
      member: 'SetPosition',
      signature: 'ox',
      body: ['/not/used', position],
      destination: OMXPLAYER_DBUS_DESTINATION
    }, callback);
  }

  getMetadata(callback) {
    this._omxplayer_dbus_session_bus.invoke({
      path: OMXPLAYER_DBUS_PATH,
      interface: OMXPLAYER_DBUS_PROPERTIES_INTERFACE,
      member: 'Metadata',
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
  _omxplayer_spawnPlayer(opts, callback) {
    this._omxplayer_dbus_ready = false;

    let args = buildArgs(opts);
    let omxProcess = spawn('omxplayer', args);
    this._omxplayer_open = true;

    omxProcess.stdin.setEncoding('utf-8');
    let self = this;
    /* EventEmitter overwrites 'this' */
    this._omxplayer_updateStatus = () => {
      if (self.running) {
        self._omxplayer_open = false
        self.emit('close')
      }
    }

    omxProcess.on('close', this._omxplayer_updateStatus);
    omxProcess.on('error', this._omxplayer_updateStatus);

    this._omxplayer_player = omxProcess;
    const exists = fs.exists(OMXPLAYER_DBUS_ADDRESS_DIR + OMXPLAYER_DBUS_ADDRESS_FILE, (exists) => {
      if (exists) {
        this._omxplayer_initialize_dbus(callback);
      } else {
        let closed = false;
        // in case created between previous exists call and watcher intialization
        setTimeout(() => {
          if (fs.existsSync(OMXPLAYER_DBUS_ADDRESS_DIR + OMXPLAYER_DBUS_ADDRESS_FILE) && !closed) {
            if (!closed) {
              watcher.close();
              closed = true;
              this._omxplayer_initialize_dbus(callback);
            }
          }
        }, 100);

        let watcher = fs.watch(OMXPLAYER_DBUS_ADDRESS_DIR, (eventType, fileName) => {
          if (fileName == OMXPLAYER_DBUS_ADDRESS_FILE && eventType == "change") {
            watcher.close();
            closed = true;
            this._omxplayer_initialize_dbus(callback);
          }
        }); 
      }
    });
  }

  _omxplayer_initialize_dbus(callback) {
    const sessionBus = dbus.sessionBus({
      busAddress: String(fs.readFileSync(OMXPLAYER_DBUS_ADDRESS_DIR + OMXPLAYER_DBUS_ADDRESS_FILE, 'ascii')).trim()
    });

    if (!sessionBus)
      throw new Error("Could not connect to the DBus session bus.");

    this._omxplayer_dbus_session_bus = sessionBus;
    this._omxplayer_dbus_ready = true;

    if (callback)
      setTimeout(callback, 500);
  }
}

module.exports = OMXPlayer;
