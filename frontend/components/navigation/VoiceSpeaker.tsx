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
  const blobUrlRef = useRef<string | null>(null);

  // Stop any currently playing audio (ElevenLabs + browser TTS)
  const stopAll = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  // Speak text using ElevenLabs TTS via server
  const speak = useCallback(
    async (text: string) => {
      if (!text) return;

      // CRITICAL: stop any current audio before starting new
      stopAll();

      if (!serverUrl) {
        // Fallback to browser TTS
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.9;
        utterance.onend = () => setIsSpeaking(false);
        setIsSpeaking(true);
        speechSynthesis.speak(utterance);
        return;
      }

      setIsSpeaking(true);
      setError(null);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000); // 12s timeout
      try {
        const response = await fetch(`${serverUrl}/announce`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Server returned ${response.status}`);
        }

        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;
        const audio = new Audio(url);

        audio.onended = () => {
          URL.revokeObjectURL(url);
          blobUrlRef.current = null;
          audioRef.current = null;
          setIsSpeaking(false);
        };

        audio.onerror = () => {
          URL.revokeObjectURL(url);
          blobUrlRef.current = null;
          audioRef.current = null;
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
      } finally {
        clearTimeout(timer);
      }
    },
    [serverUrl, stopAll]
  );

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <button
        onClick={stopAll}
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
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const isSpeakingRef = useRef(false);

  const stopAll = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    speechSynthesis.cancel();
    isSpeakingRef.current = false;
  }, []);

  const speak = useCallback(
    async (text: string) => {
      if (!text) return;

      // CRITICAL: stop previous audio before starting new
      stopAll();
      isSpeakingRef.current = true;

      if (serverUrl) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 12000); // 12s timeout
        try {
          const response = await fetch(`${serverUrl}/announce`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
            signal: controller.signal,
          });

          clearTimeout(timer);

          if (response.ok) {
            // Check if we got interrupted while waiting
            if (!isSpeakingRef.current) return;

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            blobUrlRef.current = url;

            const audio = new Audio(url);
            audio.onended = () => {
              URL.revokeObjectURL(url);
              blobUrlRef.current = null;
              audioRef.current = null;
              isSpeakingRef.current = false;
            };
            audio.onerror = () => {
              URL.revokeObjectURL(url);
              blobUrlRef.current = null;
              audioRef.current = null;
              isSpeakingRef.current = false;
            };

            audioRef.current = audio;
            await audio.play();
            return;
          }
        } catch {
          clearTimeout(timer);
          // Fallback below
        }
      }

      // Browser TTS fallback
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      utterance.onend = () => {
        isSpeakingRef.current = false;
      };
      speechSynthesis.speak(utterance);
    },
    [serverUrl, stopAll]
  );

  return { speak, stopAll, isSpeakingRef };
}
