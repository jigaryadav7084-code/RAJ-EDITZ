/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export class AudioStreamer {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private processor: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private scriptNode: ScriptProcessorNode | null = null;
  private isProcessing = false;
  private onAudioChunk: (base64Chunk: string) => void;
  public analyser: AnalyserNode | null = null;

  constructor(onAudioChunk: (base64Chunk: string) => void) {
    this.onAudioChunk = onAudioChunk;
  }

  async start() {
    if (this.isProcessing) return;

    this.audioContext = new AudioContext({ sampleRate: 16000 });
    this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.source = this.audioContext.createMediaStreamSource(this.mediaStream);

    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    this.source.connect(this.analyser);

    // Dynamic import/creation of the Worklet is tricky in some envs, 
    // but we can use a basic ScriptProcessor for simplicity if Worklet is overkill,
    // though ScriptProcessor is deprecated. Let's try to use a basic way.
    // For real-time we'll use a ScriptProcessorNode for now as it's easier to implement quickly without external files.
    const bufferSize = 4096;
    this.scriptNode = this.audioContext.createScriptProcessor(bufferSize, 1, 1);
    
    this.scriptNode.onaudioprocess = (e) => {
      if (!this.isProcessing) return;
      const inputData = e.inputBuffer.getChannelData(0);
      const pcm16 = this.floatTo16BitPCM(inputData);
      const base64 = this.base64Encode(pcm16);
      this.onAudioChunk(base64);
    };

    this.source.connect(this.scriptNode);
    this.scriptNode.connect(this.audioContext.destination);
    this.isProcessing = true;
  }

  stop() {
    this.isProcessing = false;
    this.scriptNode?.disconnect();
    this.source?.disconnect();
    this.analyser?.disconnect();
    this.mediaStream?.getTracks().forEach(track => track.stop());
    this.audioContext?.close();
    this.audioContext = null;
    this.mediaStream = null;
    this.scriptNode = null;
    this.source = null;
    this.analyser = null;
  }

  private floatTo16BitPCM(input: Float32Array): Int16Array {
    const output = new Int16Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const s = Math.max(-1, Math.min(1, input[i]));
      output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return output;
  }

  private base64Encode(buffer: Int16Array): string {
    const b = new Uint8Array(buffer.buffer);
    let binary = '';
    for (let i = 0; i < b.byteLength; i++) {
      binary += String.fromCharCode(b[i]);
    }
    return btoa(binary);
  }

  // Playback logic
  private playbackContext: AudioContext | null = null;
  private nextStartTime = 0;
  private activeNodes: Set<AudioBufferSourceNode> = new Set();
  private onPlaybackStateChange?: (isPlaying: boolean) => void;

  setPlaybackStateCallback(callback: (isPlaying: boolean) => void) {
    this.onPlaybackStateChange = callback;
  }

  async playChunk(base64Chunk: string) {
    if (!this.playbackContext) {
      this.playbackContext = new AudioContext({ sampleRate: 24000 });
      this.nextStartTime = this.playbackContext.currentTime;
    }

    const binary = atob(base64Chunk);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    
    // Convert PCM16 to Float32
    const int16 = new Int16Array(bytes.buffer);
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768.0;
    }

    const buffer = this.playbackContext.createBuffer(1, float32.length, 24000);
    buffer.getChannelData(0).set(float32);

    const source = this.playbackContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.playbackContext.destination);

    const startTime = Math.max(this.nextStartTime, this.playbackContext.currentTime);
    source.start(startTime);
    this.nextStartTime = startTime + buffer.duration;

    this.activeNodes.add(source);
    if (this.activeNodes.size === 1) {
        this.onPlaybackStateChange?.(true);
    }

    source.onended = () => {
        this.activeNodes.delete(source);
        if (this.activeNodes.size === 0) {
            this.onPlaybackStateChange?.(false);
        }
    };
  }

  stopPlayback() {
    this.activeNodes.forEach(node => {
        try { node.stop(); } catch(e) {}
    });
    this.activeNodes.clear();
    this.onPlaybackStateChange?.(false);
    this.playbackContext?.close();
    this.playbackContext = null;
    this.nextStartTime = 0;
  }
}
