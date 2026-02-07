'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { useNavigationContext } from './NavigationContext';

interface VoiceListenerProps {
  onTranscript?: (text: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
  language?: string;
  continuous?: boolean;
  autoStart?: boolean;
}

// Web Speech API types
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

export function VoiceListener({
  onTranscript,
  onError,
  language = 'en-US',
  continuous = true,
  autoStart = false,
}: VoiceListenerProps) {
  const { state, setListening, setTranscript, submitUserMessage } = useNavigationContext();
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const [isSupported, setIsSupported] = useState(true);
  const [isActive, setIsActive] = useState(false);
  const restartTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const finalTranscriptRef = useRef('');

  // Check browser support
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      setIsSupported(false);
      onError?.('Speech recognition not supported in this browser');
      return;
    }

    // Create recognition instance
    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = continuous;
    recognition.interimResults = true;
    recognition.lang = language;

    recognition.onstart = () => {
      setIsActive(true);
      setListening(true);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      // Update transcript in real-time
      const currentTranscript = finalTranscript || interimTranscript;
      setTranscript(currentTranscript);
      onTranscript?.(currentTranscript, !!finalTranscript);

      // If we got a final transcript, process it
      if (finalTranscript && finalTranscript.trim()) {
        finalTranscriptRef.current = finalTranscript.trim();
        submitUserMessage(finalTranscript.trim());
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', event.error);
      
      // Don't report "no-speech" as an error - it's normal
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        onError?.(event.error);
      }
      
      // Restart on recoverable errors
      if (event.error === 'network' || event.error === 'audio-capture') {
        scheduleRestart();
      }
    };

    recognition.onend = () => {
      setIsActive(false);
      setListening(false);
      
      // Auto-restart if continuous mode is enabled and we didn't manually stop
      if (continuous && state.isListening) {
        scheduleRestart();
      }
    };

    recognitionRef.current = recognition;

    // Auto-start if configured
    if (autoStart) {
      startListening();
    }

    return () => {
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current);
      }
      recognition.abort();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, continuous]);

  const scheduleRestart = useCallback(() => {
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
    }
    
    restartTimeoutRef.current = setTimeout(() => {
      if (recognitionRef.current && continuous) {
        try {
          recognitionRef.current.start();
        } catch {
          // Already started
        }
      }
    }, 500);
  }, [continuous]);

  const startListening = useCallback(() => {
    if (!recognitionRef.current || !isSupported) return;
    
    try {
      recognitionRef.current.start();
      finalTranscriptRef.current = '';
    } catch (error) {
      // Already started
      console.log('Recognition already started');
    }
  }, [isSupported]);

  const stopListening = useCallback(() => {
    if (!recognitionRef.current) return;
    
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
    }
    
    try {
      recognitionRef.current.stop();
    } catch {
      // Already stopped
    }
  }, []);

  // Expose controls via context state
  useEffect(() => {
    if (state.isListening && !isActive && isSupported) {
      startListening();
    } else if (!state.isListening && isActive) {
      stopListening();
    }
  }, [state.isListening, isActive, isSupported, startListening, stopListening]);

  // Pause listening while speaking (to avoid feedback)
  useEffect(() => {
    if (state.isSpeaking && isActive) {
      recognitionRef.current?.stop();
    } else if (!state.isSpeaking && state.isListening && !isActive) {
      scheduleRestart();
    }
  }, [state.isSpeaking, state.isListening, isActive, scheduleRestart]);

  if (!isSupported) {
    return (
      <div className="fixed bottom-4 left-4 bg-red-600 text-white px-4 py-2 rounded-lg text-sm">
        Voice input not supported in this browser
      </div>
    );
  }

  return (
    <>
      {/* Visual indicator for listening state */}
      <div
        className={`fixed bottom-4 left-4 flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-300 ${
          isActive
            ? 'bg-green-600 text-white'
            : 'bg-gray-700 text-gray-300'
        }`}
        role="status"
        aria-live="polite"
      >
        {/* Microphone icon */}
        <svg
          className={`w-5 h-5 ${isActive ? 'animate-pulse' : ''}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fillRule="evenodd"
            d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z"
            clipRule="evenodd"
          />
        </svg>
        
        <span className="text-sm font-medium">
          {isActive ? 'Listening...' : 'Mic Ready'}
        </span>

        {/* Sound wave animation when listening */}
        {isActive && (
          <div className="flex gap-0.5">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="w-1 bg-white rounded-full animate-bounce"
                style={{
                  height: '12px',
                  animationDelay: `${i * 0.15}s`,
                  animationDuration: '0.6s',
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Current transcript display */}
      {state.currentTranscript && (
        <div className="fixed bottom-16 left-4 right-4 max-w-md bg-gray-800/90 text-white px-4 py-2 rounded-lg">
          <p className="text-sm italic">"{state.currentTranscript}"</p>
        </div>
      )}


    </>
  );
}

export default VoiceListener;
