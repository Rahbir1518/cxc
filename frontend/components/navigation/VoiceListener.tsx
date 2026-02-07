"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Mic, MicOff, AlertCircle } from "lucide-react";

interface VoiceListenerProps {
  onResult?: (transcript: string) => void;
  onError?: (error: string) => void;
  className?: string;
  continuous?: boolean;
}

export function VoiceListener({
  onResult,
  onError,
  className = "",
  continuous = false,
}: VoiceListenerProps) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const startListening = useCallback(() => {
    const SpeechRecognition =
      window.SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      const err = "Speech recognition not supported";
      setError(err);
      onError?.(err);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = continuous;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
    };

    recognition.onresult = (event) => {
      const result = event.results[event.results.length - 1][0].transcript;
      setTranscript(result);
      onResult?.(result);
    };

    recognition.onerror = (event) => {
      const err = `Voice error: ${event.error}`;
      setError(err);
      onError?.(err);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [continuous, onResult, onError]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  return (
    <div className={`flex flex-col items-center gap-2 ${className}`}>
      <button
        onClick={isListening ? stopListening : startListening}
        className={`rounded-full p-4 text-white shadow-lg transition-all ${
          isListening
            ? "animate-pulse bg-red-500 hover:bg-red-600"
            : "bg-emerald-500 hover:bg-emerald-600"
        }`}
      >
        {isListening ? (
          <MicOff className="h-6 w-6" />
        ) : (
          <Mic className="h-6 w-6" />
        )}
      </button>

      {isListening && (
        <span className="text-sm text-emerald-400">Listening...</span>
      )}

      {transcript && !isListening && (
        <p className="text-sm text-slate-300">Heard: "{transcript}"</p>
      )}

      {error && (
        <div className="flex items-center gap-1 text-sm text-red-400">
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
