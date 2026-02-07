'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useNavigationContext } from './NavigationContext';

interface VoiceSpeakerProps {
  onSpeakingChange?: (isSpeaking: boolean) => void;
  onError?: (error: string) => void;
}

export function VoiceSpeaker({ onSpeakingChange, onError }: VoiceSpeakerProps) {
  const { state } = useNavigationContext();

  // Notify parent of speaking state changes
  useEffect(() => {
    onSpeakingChange?.(state.isSpeaking);
  }, [state.isSpeaking, onSpeakingChange]);

  return (
    <>
      {/* Speaking indicator */}
      {state.isSpeaking && (
        <div
          className="fixed bottom-4 right-4 flex items-center gap-2 px-4 py-2 rounded-full bg-blue-600 text-white transition-all duration-300"
          role="status"
          aria-live="polite"
        >
          {/* Speaker icon */}
          <svg
            className="w-5 h-5"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z"
              clipRule="evenodd"
            />
          </svg>
          
          <span className="text-sm font-medium">Speaking...</span>

          {/* Animated sound bars */}
          <div className="flex gap-0.5 items-center">
            {[10, 14, 8, 12].map((height, i) => (
              <div
                key={i}
                className="w-1 bg-white rounded-full animate-pulse"
                style={{
                  height: `${height}px`,
                  animationDelay: `${i * 0.1}s`,
                  animationDuration: '0.5s',
                }}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}

/**
 * TTS utility functions for manual speech control
 */
export async function speak(
  text: string,
  priority: 'low' | 'normal' | 'high' | 'urgent' = 'normal'
): Promise<void> {
  try {
    const response = await fetch('/api/speech/synthesize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, priority }),
    });

    if (!response.ok) {
      throw new Error('Failed to synthesize speech');
    }

    const audioBlob = await response.blob();
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);

    return new Promise((resolve, reject) => {
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        resolve();
      };
      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        reject(new Error('Audio playback failed'));
      };
      audio.play().catch(reject);
    });
  } catch (error) {
    console.error('Speech error:', error);
    throw error;
  }
}

/**
 * Hook for manual speech control outside of context
 */
export function useSpeech() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const queueRef = useRef<Array<{ text: string; priority: string }>>([]);
  const isSpeakingRef = useRef(false);

  const processQueue = useCallback(async () => {
    if (isSpeakingRef.current || queueRef.current.length === 0) return;

    isSpeakingRef.current = true;
    const item = queueRef.current.shift()!;

    try {
      await speak(item.text, item.priority as 'low' | 'normal' | 'high' | 'urgent');
    } catch (error) {
      console.error('Speech failed:', error);
    }

    isSpeakingRef.current = false;
    processQueue();
  }, []);

  const queueSpeech = useCallback((text: string, priority: 'low' | 'normal' | 'high' | 'urgent' = 'normal') => {
    if (priority === 'urgent') {
      queueRef.current = [{ text, priority }];
      if (audioRef.current) {
        audioRef.current.pause();
      }
      isSpeakingRef.current = false;
    } else if (priority === 'high') {
      queueRef.current.unshift({ text, priority });
    } else {
      queueRef.current.push({ text, priority });
    }
    
    processQueue();
  }, [processQueue]);

  const stop = useCallback(() => {
    queueRef.current = [];
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    isSpeakingRef.current = false;
  }, []);

  return { speak: queueSpeech, stop };
}

export default VoiceSpeaker;
