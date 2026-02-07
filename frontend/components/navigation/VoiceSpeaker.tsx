"use client";

import { useCallback, useRef, useState } from "react";
import { Volume2, VolumeX, AlertCircle } from "lucide-react";

interface VoiceSpeakerProps {
  serverUrl?: string;
  className?: string;
}

export function VoiceSpeaker({ serverUrl, className = "" }: VoiceSpeakerProps) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Speak text using ElevenLabs TTS via server
  const speak = useCallback(
    async (text: string) => {
      if (!text || !serverUrl) {
        // Fallback to browser TTS
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.9;
        speechSynthesis.speak(utterance);
        return;
      }

      setIsSpeaking(true);
      setError(null);

      try {
        const response = await fetch(`${serverUrl}/announce`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });

        if (!response.ok) {
          throw new Error(`Server returned ${response.status}`);
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);

        audio.onended = () => {
          URL.revokeObjectURL(url);
          setIsSpeaking(false);
        };

        audio.onerror = () => {
          URL.revokeObjectURL(url);
          setIsSpeaking(false);
          // Fallback to browser TTS
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.rate = 0.9;
          speechSynthesis.speak(utterance);
        };

        audioRef.current = audio;
        await audio.play();
      } catch (err) {
        setError(`TTS error: ${err}`);
        setIsSpeaking(false);
        // Fallback to browser TTS
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.9;
        speechSynthesis.speak(utterance);
      }
    },
    [serverUrl]
  );

  const stop = useCallback(() => {
    audioRef.current?.pause();
    speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <button
        onClick={stop}
        disabled={!isSpeaking}
        className={`rounded-full p-3 text-white shadow-lg transition-all ${
          isSpeaking
            ? "animate-pulse bg-amber-500 hover:bg-amber-600"
            : "bg-slate-600 opacity-50"
        }`}
      >
        {isSpeaking ? (
          <Volume2 className="h-5 w-5" />
        ) : (
          <VolumeX className="h-5 w-5" />
        )}
      </button>

      {error && (
        <div className="flex items-center gap-1 text-sm text-red-400">
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

// Export speak function for use in other components
export function useSpeaker(serverUrl?: string) {
  const speak = useCallback(
    async (text: string) => {
      if (!text) return;

      if (serverUrl) {
        try {
          const response = await fetch(`${serverUrl}/announce`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
          });

          if (response.ok) {
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const audio = new Audio(url);
            audio.onended = () => URL.revokeObjectURL(url);
            await audio.play();
            return;
          }
        } catch {
          // Fallback below
        }
      }

      // Browser TTS fallback
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      speechSynthesis.speak(utterance);
    },
    [serverUrl]
  );

  return { speak };
}
