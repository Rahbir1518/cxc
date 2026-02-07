/**
 * ElevenLabs API Integration
 * 
 * Provides text-to-speech and speech-to-text capabilities
 * for the indoor navigation assistant.
 */

const ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1';

// Voice IDs - using ElevenLabs pre-made voices
export const VOICES = {
  // Rachel - calm, clear female voice, great for navigation
  NAVIGATION_DEFAULT: '21m00Tcm4TlvDq8ikWAM',
  // Adam - calm male voice alternative
  NAVIGATION_MALE: 'pNInz6obpgDQGcFmaJgB',
  // Bella - warm, friendly voice for general responses
  FRIENDLY: 'EXAVITQu4vr4xnSDxMaL',
} as const;

// Model IDs
export const MODELS = {
  // Multilingual v2 - best quality, supports 29 languages
  ELEVEN_MULTILINGUAL_V2: 'eleven_multilingual_v2',
  // Turbo v2 - fastest, English only, great for real-time
  ELEVEN_TURBO_V2: 'eleven_turbo_v2',
  // Flash v2.5 - ultra-fast, great for real-time navigation
  ELEVEN_FLASH_V2_5: 'eleven_flash_v2_5',
} as const;

export interface VoiceSettings {
  stability: number;      // 0-1, higher = more consistent
  similarity_boost: number; // 0-1, higher = closer to original voice
  style?: number;          // 0-1, style exaggeration (v2 models only)
  use_speaker_boost?: boolean; // improves audio quality
}

export interface TTSRequest {
  text: string;
  voiceId?: string;
  modelId?: string;
  voiceSettings?: VoiceSettings;
  outputFormat?: 'mp3_44100_128' | 'mp3_22050_32' | 'pcm_16000' | 'pcm_22050' | 'pcm_24000';
}

export interface TTSStreamOptions extends TTSRequest {
  onChunk?: (chunk: Uint8Array) => void;
  onComplete?: () => void;
  onError?: (error: Error) => void;
}

// Default voice settings optimized for navigation guidance
const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  stability: 0.75,        // High stability for consistent guidance
  similarity_boost: 0.8,  // Good voice matching
  style: 0.3,             // Subtle style variation
  use_speaker_boost: true,
};

/**
 * ElevenLabs API Client
 */
export class ElevenLabsClient {
  private apiKey: string;
  private defaultVoiceId: string;
  private defaultModelId: string;

  constructor(
    apiKey?: string,
    defaultVoiceId: string = VOICES.NAVIGATION_DEFAULT,
    defaultModelId: string = MODELS.ELEVEN_FLASH_V2_5
  ) {
    this.apiKey = apiKey || process.env.ELEVENLABS_API_KEY || '';
    this.defaultVoiceId = defaultVoiceId;
    this.defaultModelId = defaultModelId;

    if (!this.apiKey) {
      console.warn('ElevenLabs API key not provided');
    }
  }

  /**
   * Get headers for API requests
   */
  private getHeaders(contentType: string = 'application/json'): HeadersInit {
    return {
      'xi-api-key': this.apiKey,
      'Content-Type': contentType,
    };
  }

  /**
   * Convert text to speech (returns audio buffer)
   */
  async textToSpeech(request: TTSRequest): Promise<ArrayBuffer> {
    const {
      text,
      voiceId = this.defaultVoiceId,
      modelId = this.defaultModelId,
      voiceSettings = DEFAULT_VOICE_SETTINGS,
      outputFormat = 'mp3_44100_128',
    } = request;

    const response = await fetch(
      `${ELEVENLABS_API_URL}/text-to-speech/${voiceId}?output_format=${outputFormat}`,
      {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          text,
          model_id: modelId,
          voice_settings: voiceSettings,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`ElevenLabs TTS error: ${response.status} - ${error}`);
    }

    return response.arrayBuffer();
  }

  /**
   * Stream text to speech (for real-time playback)
   * Returns a ReadableStream for progressive audio playback
   */
  async textToSpeechStream(request: TTSRequest): Promise<ReadableStream<Uint8Array>> {
    const {
      text,
      voiceId = this.defaultVoiceId,
      modelId = this.defaultModelId,
      voiceSettings = DEFAULT_VOICE_SETTINGS,
      outputFormat = 'mp3_44100_128',
    } = request;

    const response = await fetch(
      `${ELEVENLABS_API_URL}/text-to-speech/${voiceId}/stream?output_format=${outputFormat}`,
      {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          text,
          model_id: modelId,
          voice_settings: voiceSettings,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`ElevenLabs TTS stream error: ${response.status} - ${error}`);
    }

    if (!response.body) {
      throw new Error('No response body for TTS stream');
    }

    return response.body;
  }

  /**
   * Get available voices
   */
  async getVoices(): Promise<Array<{ voice_id: string; name: string; labels: Record<string, string> }>> {
    const response = await fetch(`${ELEVENLABS_API_URL}/voices`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to get voices: ${response.status}`);
    }

    const data = await response.json();
    return data.voices;
  }

  /**
   * Get subscription info (for usage tracking)
   */
  async getSubscriptionInfo(): Promise<{
    character_count: number;
    character_limit: number;
    remaining_characters: number;
  }> {
    const response = await fetch(`${ELEVENLABS_API_URL}/user/subscription`, {
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Failed to get subscription info: ${response.status}`);
    }

    const data = await response.json();
    return {
      character_count: data.character_count,
      character_limit: data.character_limit,
      remaining_characters: data.character_limit - data.character_count,
    };
  }
}

/**
 * Audio utilities for playback
 */
export class AudioPlayer {
  private audioContext: AudioContext | null = null;
  private currentSource: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private onEndCallback: (() => void) | null = null;
  private isPlaying: boolean = false;

  /**
   * Initialize audio context (must be called after user interaction)
   */
  async initialize(): Promise<void> {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
      this.gainNode = this.audioContext.createGain();
      this.gainNode.connect(this.audioContext.destination);
    }

    // Resume if suspended (browser autoplay policy)
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  /**
   * Play audio from ArrayBuffer
   */
  async playBuffer(audioData: ArrayBuffer, onEnd?: () => void): Promise<void> {
    await this.initialize();

    if (!this.audioContext || !this.gainNode) {
      throw new Error('Audio context not initialized');
    }

    // Stop any currently playing audio
    this.stop();

    // Decode audio data
    const audioBuffer = await this.audioContext.decodeAudioData(audioData.slice(0));

    // Create and configure source
    this.currentSource = this.audioContext.createBufferSource();
    this.currentSource.buffer = audioBuffer;
    this.currentSource.connect(this.gainNode);

    // Handle end event
    this.onEndCallback = onEnd || null;
    this.currentSource.onended = () => {
      this.isPlaying = false;
      if (this.onEndCallback) {
        this.onEndCallback();
      }
    };

    // Start playback
    this.isPlaying = true;
    this.currentSource.start();
  }

  /**
   * Play audio from a stream (uses MediaSource for progressive playback)
   */
  async playStream(stream: ReadableStream<Uint8Array>, onEnd?: () => void): Promise<void> {
    // For streams, we'll collect chunks and play when ready
    // This is a simplified approach - for true streaming, use MediaSource API
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }

      // Combine chunks into single buffer
      const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
      const combined = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }

      // Play the combined buffer
      await this.playBuffer(combined.buffer, onEnd);
    } catch (error) {
      console.error('Error playing stream:', error);
      throw error;
    }
  }

  /**
   * Stop current playback
   */
  stop(): void {
    if (this.currentSource && this.isPlaying) {
      try {
        this.currentSource.stop();
      } catch {
        // Already stopped
      }
      this.currentSource = null;
      this.isPlaying = false;
    }
  }

  /**
   * Set volume (0-1)
   */
  setVolume(volume: number): void {
    if (this.gainNode) {
      this.gainNode.gain.value = Math.max(0, Math.min(1, volume));
    }
  }

  /**
   * Check if currently playing
   */
  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  /**
   * Clean up resources
   */
  dispose(): void {
    this.stop();
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}

/**
 * Priority queue for speech output
 * Manages interrupts and queued messages
 */
export interface SpeechQueueItem {
  id: string;
  text: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  interruptCurrent: boolean;
  timestamp: number;
}

export class SpeechQueue {
  private queue: SpeechQueueItem[] = [];
  private currentItem: SpeechQueueItem | null = null;
  private isProcessing: boolean = false;
  private client: ElevenLabsClient;
  private player: AudioPlayer;
  private onSpeakingChange?: (speaking: boolean, text?: string) => void;

  constructor(
    client: ElevenLabsClient, 
    player: AudioPlayer,
    onSpeakingChange?: (speaking: boolean, text?: string) => void
  ) {
    this.client = client;
    this.player = player;
    this.onSpeakingChange = onSpeakingChange;
  }

  /**
   * Add item to queue
   */
  add(item: Omit<SpeechQueueItem, 'timestamp'>): void {
    const queueItem: SpeechQueueItem = {
      ...item,
      timestamp: Date.now(),
    };

    // If urgent/interrupt, handle immediately
    if (item.interruptCurrent && this.currentItem) {
      this.player.stop();
      this.queue = [queueItem];
      this.processQueue();
      return;
    }

    // Add to queue based on priority
    if (item.priority === 'urgent') {
      this.queue.unshift(queueItem);
    } else if (item.priority === 'high') {
      // Insert after urgent items
      const firstNonUrgent = this.queue.findIndex(i => i.priority !== 'urgent');
      if (firstNonUrgent === -1) {
        this.queue.push(queueItem);
      } else {
        this.queue.splice(firstNonUrgent, 0, queueItem);
      }
    } else {
      this.queue.push(queueItem);
    }

    // Start processing if not already
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  /**
   * Process the speech queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.queue.length > 0) {
      this.currentItem = this.queue.shift()!;
      
      try {
        this.onSpeakingChange?.(true, this.currentItem.text);
        
        const audioBuffer = await this.client.textToSpeech({
          text: this.currentItem.text,
        });

        await new Promise<void>((resolve) => {
          this.player.playBuffer(audioBuffer, resolve);
        });
      } catch (error) {
        console.error('Error processing speech queue:', error);
      }
      
      this.onSpeakingChange?.(false);
      this.currentItem = null;
    }

    this.isProcessing = false;
  }

  /**
   * Clear the queue
   */
  clear(): void {
    this.queue = [];
    this.player.stop();
    this.currentItem = null;
    this.isProcessing = false;
    this.onSpeakingChange?.(false);
  }

  /**
   * Get queue length
   */
  getQueueLength(): number {
    return this.queue.length;
  }
}

// Export singleton instances for easy use
let defaultClient: ElevenLabsClient | null = null;
let defaultPlayer: AudioPlayer | null = null;

export function getElevenLabsClient(): ElevenLabsClient {
  if (!defaultClient) {
    defaultClient = new ElevenLabsClient();
  }
  return defaultClient;
}

export function getAudioPlayer(): AudioPlayer {
  if (!defaultPlayer) {
    defaultPlayer = new AudioPlayer();
  }
  return defaultPlayer;
}
