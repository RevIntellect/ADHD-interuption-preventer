/**
 * SpeakAware — Audio Detection Module
 * Uses Web Audio API to detect when the user is speaking via microphone volume levels.
 */

class AudioDetector {
  constructor() {
    this.audioContext = null;
    this.analyser = null;
    this.microphone = null;
    this.stream = null;
    this.dataArray = null;
    this.isRunning = false;
    this.isSpeaking = false;

    // Callbacks
    this.onSpeakingStart = null;
    this.onSpeakingStop = null;
    this.onVolumeChange = null;

    // Detection config
    this.sensitivityThreshold = 15; // 0-100 scale, adjusted by settings
    this.silenceDelay = 500; // ms of silence before considered "stopped speaking"
    this._silenceTimer = null;
    this._rafId = null;
  }

  async start() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.8;

      this.microphone = this.audioContext.createMediaStreamSource(this.stream);
      this.microphone.connect(this.analyser);

      this.dataArray = new Uint8Array(this.analyser.frequencyBinCount);
      this.isRunning = true;
      this._monitor();

      return true;
    } catch (err) {
      console.error('Microphone access denied:', err);
      return false;
    }
  }

  stop() {
    this.isRunning = false;

    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }

    if (this._silenceTimer) {
      clearTimeout(this._silenceTimer);
      this._silenceTimer = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }

    this.isSpeaking = false;
  }

  setSensitivity(level) {
    // level: 1 (least sensitive) to 10 (most sensitive)
    // Maps to threshold: 30 (hard to trigger) down to 5 (easy to trigger)
    this.sensitivityThreshold = 35 - (level * 3);
  }

  _monitor() {
    if (!this.isRunning) return;

    this.analyser.getByteFrequencyData(this.dataArray);

    // Calculate RMS volume from frequency data
    let sum = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      sum += this.dataArray[i];
    }
    const average = sum / this.dataArray.length;

    // Normalize to 0-100
    const volume = Math.min(100, Math.round((average / 128) * 100));

    // Report volume level
    if (this.onVolumeChange) {
      this.onVolumeChange(volume);
    }

    // Detect speaking
    if (volume > this.sensitivityThreshold) {
      // Clear any pending silence timer
      if (this._silenceTimer) {
        clearTimeout(this._silenceTimer);
        this._silenceTimer = null;
      }

      if (!this.isSpeaking) {
        this.isSpeaking = true;
        if (this.onSpeakingStart) this.onSpeakingStart();
      }
    } else {
      // Below threshold — start silence timer if currently speaking
      if (this.isSpeaking && !this._silenceTimer) {
        this._silenceTimer = setTimeout(() => {
          this.isSpeaking = false;
          this._silenceTimer = null;
          if (this.onSpeakingStop) this.onSpeakingStop();
        }, this.silenceDelay);
      }
    }

    this._rafId = requestAnimationFrame(() => this._monitor());
  }
}
