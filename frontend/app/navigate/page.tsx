"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Volume2,
  Navigation,
  Square,
  Eye,
  MapPin,
} from "lucide-react";
import { useSpeaker } from "@/components/navigation/VoiceSpeaker";

// ── Lazy-loaded heavy components (Phase 4: code splitting) ──
const FloorPlanMap = dynamic(
  () =>
    import("@/components/navigation/FloorPlanMap").then(
      (mod) => mod.FloorPlanMap
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-[280px] bg-slate-900 rounded-xl animate-pulse">
        <Navigation className="h-8 w-8 text-slate-600" />
      </div>
    ),
  }
);

const CameraStream = dynamic(
  () =>
    import("@/components/navigation/CameraStream").then(
      (mod) => mod.CameraStream
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center min-h-[200px] bg-slate-900 rounded-xl animate-pulse">
        <Video className="h-8 w-8 text-slate-600" />
      </div>
    ),
  }
);

const BACKEND_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
const START_ROOM = "0020";

interface PathNode {
  x: number;
  y: number;
  label?: string;
}

export default function NavigatePage() {
  // ── Connection state ──
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  // ── Camera state ──
  const [cameraActive, setCameraActive] = useState(false);

  // ── Navigation state ──
  const [navPath, setNavPath] = useState<PathNode[]>([]);
  const [destination, setDestination] = useState<string | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [instruction, setInstruction] = useState("");

  // ── Voice state ──
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // ── Manual input ──
  const [manualDest, setManualDest] = useState("");
  const [showManual, setShowManual] = useState(false);

  // ── Status ──
  const [status, setStatus] = useState("Tap Connect to start");

  // ── Speaker (with overlap protection) ──
  const { speak, stopAll: stopAudio, isSpeakingRef } = useSpeaker(BACKEND_URL);

  // ── Connect to backend (with timeout) ──
  const connect = useCallback(async () => {
    setIsConnecting(true);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000); // 5s timeout
    try {
      const res = await fetch(`${BACKEND_URL}/health`, {
        signal: controller.signal,
      });
      if (res.ok) {
        setIsConnected(true);
        setStatus("Connected — start camera and navigate");
      } else {
        setStatus("Server error: " + res.status);
      }
    } catch (err: any) {
      setStatus(
        err?.name === "AbortError"
          ? "Server timed out — check connection"
          : "Cannot reach server"
      );
    } finally {
      clearTimeout(timer);
    }
    setIsConnecting(false);
  }, []);

  // ── Voice recognition ──
  const startListening = useCallback(() => {
    const SR =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    if (!SR) {
      setShowManual(true);
      setStatus("Voice not supported — type room number");
      return;
    }

    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      setIsListening(true);
      setStatus("🎤 Listening...");
    };

    recognition.onresult = (ev: any) => {
      const cmd = ev.results[0][0].transcript;
      setTranscript(cmd);
      setStatus(`Heard: "${cmd}"`);
      parseNavCommand(cmd);
    };

    recognition.onerror = () => {
      setStatus("Try again or type room number");
      setShowManual(true);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  // ── Parse navigation command (with timeout) ──
  const parseNavCommand = useCallback(
    async (text: string) => {
      setStatus("Finding route...");
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000); // 15s timeout
      try {
        const res = await fetch(`${BACKEND_URL}/navigate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, start_room: START_ROOM }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(errText || "Navigation failed");
        }

        const data = await res.json();
        if (data.error) throw new Error(data.error);

        // Start navigation
        setNavPath(data.path || []);
        setDestination(data.destination);
        setIsNavigating(true);
        setInstruction(data.instruction || "");
        setStatus(`🧭 Navigating to room ${data.destination}`);

        // Announce the instruction
        speak(
          data.instruction ||
            `Heading to room ${data.destination}. Tap What's Ahead to hear surroundings.`
        );
      } catch (err: any) {
        const msg =
          err?.name === "AbortError"
            ? "Navigation request timed out"
            : err.message || "Failed to find path";
        setStatus("❌ " + msg);
        speak("I couldn't find a path to that room.");
        setShowManual(true);
      } finally {
        clearTimeout(timer);
      }
    },
    [speak]
  );

  // ── Stop navigation ──
  const stopNavigation = useCallback(() => {
    setIsNavigating(false);
    setNavPath([]);
    setDestination(null);
    setInstruction("");
    stopAudio();
    setStatus("Navigation stopped");
  }, [stopAudio]);

  // ── Announce (What's Ahead) with timeout ──
  const announceScene = useCallback(async () => {
    // If currently speaking, stop it
    if (isSpeakingRef.current) {
      stopAudio();
      setStatus("Stopped speaking");
      return;
    }

    setStatus("Analyzing scene...");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000); // 45s timeout
    try {
      const video = document.querySelector("video");
      if (!video || !video.videoWidth) {
        speak("Camera is not active. Please start the camera first.");
        return;
      }

      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 640 / video.videoWidth);
      canvas.width = video.videoWidth * scale;
      canvas.height = video.videoHeight * scale;
      canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise<Blob | null>((r) =>
        canvas.toBlob(r, "image/jpeg", 0.6)
      );
      if (!blob) throw new Error("Failed to capture frame");

      const form = new FormData();
      form.append("file", blob, "scene.jpg");
      if (isNavigating && destination) {
        form.append(
          "navigation_context",
          `User is heading to room ${destination}. Give verbal directions.`
        );
      }

      const res = await fetch(`${BACKEND_URL}/analyze-and-announce`, {
        method: "POST",
        body: form,
        signal: controller.signal,
      });
      if (!res.ok) throw new Error("Server " + res.status);

      const data = await res.json();
      const announcement = (
        data.announcement || "I couldn't analyze the scene."
      ).trim();

      setStatus("🗣️ Speaking...");
      await speak(announcement);
      setStatus(
        isNavigating
          ? `🧭 Navigating to room ${destination}`
          : "Camera on — tap What's Ahead"
      );
    } catch (err: any) {
      const msg =
        err?.name === "AbortError"
          ? "Scene analysis timed out"
          : err.message || "Unknown error";
      setStatus("Error: " + msg);
      speak("Something went wrong. Check the server connection.");
    } finally {
      clearTimeout(timer);
    }
  }, [speak, stopAudio, isSpeakingRef, isNavigating, destination]);

  // ── Manual destination ──
  const handleManualGo = useCallback(() => {
    if (manualDest.trim()) {
      parseNavCommand("go to room " + manualDest.trim());
      setShowManual(false);
    }
  }, [manualDest, parseNavCommand]);

  // Auto-connect on mount
  useEffect(() => {
    connect();
  }, [connect]);

  return (
    <div className="flex flex-col h-screen max-h-screen overflow-hidden">
      {/* Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Navigation className="h-5 w-5 text-emerald-400" />
          <h1 className="text-lg font-semibold">Indoor Navigation</h1>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={`h-2.5 w-2.5 rounded-full ${
              isConnected ? "bg-emerald-500 animate-pulse" : "bg-slate-600"
            }`}
          />
          <span className="text-xs text-slate-400">
            {isConnected ? "Connected" : "Offline"}
          </span>
        </div>
      </header>

      {/* Status bar */}
      <div className="bg-slate-900/50 px-4 py-2 text-sm text-emerald-400 text-center border-b border-slate-800/50 shrink-0">
        {status}
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col gap-3 p-3 overflow-y-auto">
        {/* Map (shown when navigating) */}
        {isNavigating && navPath.length > 0 && (
          <FloorPlanMap
            floorPlanUrl={`${BACKEND_URL}/static/floor_plans/basement.svg`}
            path={navPath}
            destination={destination || undefined}
            simulateLiveTracking={true}
            walkSpeed={1.0}
            className="w-full aspect-[1224/792] max-h-[280px]"
            onArrived={() => {
              setStatus("🎉 You have arrived!");
              speak("You have arrived at your destination.");
            }}
          />
        )}

        {/* Camera */}
        <CameraStream
          serverUrl={BACKEND_URL}
          autoStart={cameraActive}
          className={`w-full ${isNavigating ? "max-h-[200px]" : "flex-1 min-h-[240px]"}`}
          onInstruction={(instr) => {
            if (instr) setInstruction(instr);
          }}
        />

        {/* Instruction display */}
        {instruction && (
          <div className="bg-slate-800/60 rounded-lg px-4 py-2 text-sm text-slate-300">
            {instruction}
          </div>
        )}

        {/* Manual entry */}
        {showManual && (
          <div className="flex gap-2">
            <input
              type="text"
              value={manualDest}
              onChange={(e) => setManualDest(e.target.value)}
              placeholder="Room (e.g. 0010)"
              className="flex-1 rounded-lg bg-slate-800 border border-emerald-500/50 px-3 py-2 text-sm text-white placeholder-slate-500"
              onKeyDown={(e) => e.key === "Enter" && handleManualGo()}
            />
            <button
              onClick={handleManualGo}
              className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-900 hover:bg-emerald-400 transition-colors"
            >
              Go
            </button>
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div className="bg-slate-900 border-t border-slate-800 px-4 py-3 shrink-0">
        <div className="flex justify-center gap-3 flex-wrap">
          {/* Connect / Start Camera */}
          {!isConnected ? (
            <button
              onClick={connect}
              disabled={isConnecting}
              className="flex items-center gap-2 rounded-full bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-900 shadow-lg hover:bg-emerald-400 transition-all disabled:opacity-50"
            >
              <MapPin className="h-4 w-4" />
              {isConnecting ? "Connecting..." : "Connect"}
            </button>
          ) : !cameraActive ? (
            <button
              onClick={() => setCameraActive(true)}
              className="flex items-center gap-2 rounded-full bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-900 shadow-lg hover:bg-emerald-400 transition-all"
            >
              <Video className="h-4 w-4" />
              Start Camera
            </button>
          ) : (
            <button
              onClick={() => {
                setCameraActive(false);
                stopNavigation();
              }}
              className="flex items-center gap-2 rounded-full bg-red-500 px-4 py-3 text-sm font-semibold text-white shadow-lg hover:bg-red-400 transition-all"
            >
              <Square className="h-4 w-4" />
              Stop
            </button>
          )}

          {/* What's Ahead */}
          {isConnected && cameraActive && (
            <button
              onClick={announceScene}
              className="flex items-center gap-2 rounded-full bg-blue-500 px-5 py-3 text-sm font-semibold text-white shadow-lg hover:bg-blue-400 transition-all"
            >
              <Eye className="h-4 w-4" />
              What&apos;s Ahead
            </button>
          )}

          {/* Navigate (voice) */}
          {isConnected && (
            <>
              {isNavigating ? (
                <button
                  onClick={stopNavigation}
                  className="flex items-center gap-2 rounded-full bg-red-500/80 px-4 py-3 text-sm font-semibold text-white shadow-lg hover:bg-red-400 transition-all"
                >
                  <Square className="h-4 w-4" />
                  End Route
                </button>
              ) : (
                <button
                  onClick={isListening ? stopListening : startListening}
                  className={`flex items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-white shadow-lg transition-all ${
                    isListening
                      ? "bg-red-500 animate-pulse hover:bg-red-400"
                      : "bg-gradient-to-r from-fuchsia-500 to-pink-500 hover:from-fuchsia-400 hover:to-pink-400"
                  }`}
                >
                  {isListening ? (
                    <>
                      <MicOff className="h-4 w-4" />
                      Cancel
                    </>
                  ) : (
                    <>
                      <Mic className="h-4 w-4" />
                      Navigate
                    </>
                  )}
                </button>
              )}
            </>
          )}
        </div>

        {/* Transcript feedback */}
        {transcript && !isListening && (
          <p className="text-center text-xs text-slate-500 mt-2">
            Heard: &quot;{transcript}&quot;
          </p>
        )}
      </div>
    </div>
  );
}
