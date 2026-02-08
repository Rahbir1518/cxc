"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import dynamic from "next/dynamic";
import { useUser, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Eye,
  Navigation,
  Square,
  MapPin,
  Activity,
  Shield,
  Zap,
  Clock,
  BarChart3,
  Crosshair,
  Wifi,
  WifiOff,
  Glasses,
  BookOpen,
} from "lucide-react";
import { useSpeaker } from "@/components/navigation/VoiceSpeaker";

const FloorPlanMap = dynamic(
  () => import("@/components/navigation/FloorPlanMap").then((m) => m.FloorPlanMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full bg-(--color-bg-card) rounded-xl" style={{ animation: "pulse-soft 2s infinite" }}>
        <Navigation className="h-8 w-8" style={{ color: "var(--color-text-muted)" }} />
      </div>
    ),
  }
);

const CameraStream = dynamic(
  () => import("@/components/navigation/CameraStream").then((m) => m.CameraStream),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full bg-(--color-bg-card) rounded-xl" style={{ animation: "pulse-soft 2s infinite" }}>
        <Video className="h-12 w-12" style={{ color: "var(--color-text-muted)" }} />
      </div>
    ),
  }
);

const CameraViewer = dynamic(
  () => import("@/components/navigation/CameraViewer").then((m) => m.CameraViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full bg-(--color-bg-card) rounded-xl" style={{ animation: "pulse-soft 2s infinite" }}>
        <Video className="h-12 w-12" style={{ color: "var(--color-text-muted)" }} />
      </div>
    ),
  }
);

const GlassesViewer = dynamic(
  () => import("@/components/navigation/GlassesViewer").then((m) => m.GlassesViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full bg-(--color-bg-card) rounded-xl" style={{ animation: "pulse-soft 2s infinite" }}>
        <Glasses className="h-12 w-12" style={{ color: "var(--color-text-muted)" }} />
      </div>
    ),
  }
);

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

interface DetectedObject {
  label: string;
  confidence: number;
  distance?: number;
  position?: string;
  is_blocking_path?: boolean;
  bbox: number[];
  center: number[];
}

interface PathNode {
  x: number;
  y: number;
  label?: string;
}

interface SessionStats {
  framesProcessed: number;
  objectsDetected: number;
  threatEvents: { danger: number; warning: number; caution: number };
  avgDistance: number;
  startTime: number | null;
}

export default function DashboardPage() {
  const { user } = useUser();

  // Connection
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  // Camera
  const [cameraActive, setCameraActive] = useState(false);
  // "phone" = phone feed viewer, "webcam" = local webcam, "glasses" = meta glasses
  const [viewerMode, setViewerMode] = useState<"phone" | "webcam" | "glasses">("phone");

  // Navigation
  const [navPath, setNavPath] = useState<PathNode[]>([]);
  const [destination, setDestination] = useState<string | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [instruction, setInstruction] = useState("");

  // Voice
  const [isListening, setIsListening] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);

  // Manual input
  const [manualFrom, setManualFrom] = useState("0020");
  const [manualTo, setManualTo] = useState("");

  // Status
  const [status, setStatus] = useState("Connect to start");

  // Speaker
  const { speak, stopAll: stopAudio, isSpeakingRef } = useSpeaker(BACKEND_URL);

  // Live detections
  const [detections, setDetections] = useState<DetectedObject[]>([]);

  // Glasses text reading
  const [glassesText, setGlassesText] = useState("");

  // Analytics / session stats
  const [stats, setStats] = useState<SessionStats>({
    framesProcessed: 0,
    objectsDetected: 0,
    threatEvents: { danger: 0, warning: 0, caution: 0 },
    avgDistance: 0,
    startTime: null,
  });
  const distanceSumRef = useRef(0);
  const distanceCountRef = useRef(0);

  // FPS tracking
  const [fps, setFps] = useState(0);
  const fpsCountRef = useRef(0);
  const fpsTimerRef = useRef(Date.now());

  // Session duration
  const [duration, setDuration] = useState(0);
  useEffect(() => {
    if (!stats.startTime) return;
    const timer = setInterval(() => {
      setDuration(Math.floor((Date.now() - stats.startTime!) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [stats.startTime]);

  // Connect
  const connect = useCallback(async () => {
    setIsConnecting(true);
    try {
      const res = await fetch(`${BACKEND_URL}/health`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        setIsConnected(true);
        setStatus("Connected — start camera to begin");
      } else {
        setStatus("Server error: " + res.status);
      }
    } catch {
      setStatus("Cannot reach server");
    }
    setIsConnecting(false);
  }, []);

  // Auto-connect
  useEffect(() => { connect(); }, [connect]);

  // Handle detections from camera stream
  const handleDetections = useCallback((objects: DetectedObject[]) => {
    setDetections(objects);

    // FPS
    fpsCountRef.current++;
    const now = Date.now();
    if (now - fpsTimerRef.current >= 1000) {
      setFps(fpsCountRef.current);
      fpsCountRef.current = 0;
      fpsTimerRef.current = now;
    }

    // Update stats
    setStats((prev) => {
      const newFrames = prev.framesProcessed + 1;
      const newObjects = prev.objectsDetected + objects.length;

      // Threat events
      const threats = { ...prev.threatEvents };
      objects.forEach((obj) => {
        if (obj.distance != null) {
          distanceSumRef.current += obj.distance;
          distanceCountRef.current += 1;
          if (obj.distance < 1) threats.danger++;
          else if (obj.distance < 2) threats.warning++;
          else if (obj.distance < 3.5) threats.caution++;
        }
      });

      return {
        framesProcessed: newFrames,
        objectsDetected: newObjects,
        threatEvents: threats,
        avgDistance: distanceCountRef.current > 0 ? distanceSumRef.current / distanceCountRef.current : 0,
        startTime: prev.startTime || Date.now(),
      };
    });
  }, []);

  // Handle instructions
  const handleInstruction = useCallback((instr: string) => {
    if (instr) setInstruction(instr);
  }, []);

  // Handle text found from glasses (auto-speak for visually impaired)
  const handleTextFound = useCallback((text: string) => {
    if (text && !text.includes("No text visible") && !text.includes("don't see")) {
      setGlassesText(text);
    }
  }, []);

  // Read text aloud (glasses accessibility feature)
  const readTextAloud = useCallback(async () => {
    if (!glassesText) return;
    setStatus("📖 Reading text aloud...");
    await speak(glassesText);
    setStatus(cameraActive ? "Glasses feed active" : "Ready");
  }, [glassesText, speak, cameraActive]);

  // Voice navigation
  const startListening = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setStatus("Voice not supported — use manual input"); return; }
    const r = new SR();
    r.continuous = false;
    r.interimResults = false;
    r.lang = "en-US";
    r.onstart = () => { setIsListening(true); setStatus("🎤 Listening..."); };
    r.onresult = (ev: any) => {
      const cmd = ev.results[0][0].transcript;
      setStatus(`Heard: "${cmd}"`);
      parseNavCommand(cmd);
    };
    r.onerror = () => { setStatus("Try again or use manual input"); setIsListening(false); };
    r.onend = () => setIsListening(false);
    recognitionRef.current = r;
    r.start();
  }, []);

  // Parse nav command
  const parseNavCommand = useCallback(async (text: string, explicitStart?: string) => {
    setStatus("Finding route...");
    try {
      const body: Record<string, string> = { text };
      if (explicitStart) body.start_room = explicitStart;
      const res = await fetch(`${BACKEND_URL}/navigate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Server ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      setNavPath(data.path || []);
      setDestination(data.destination);
      setIsNavigating(true);
      setInstruction(data.instruction || "");
      setStatus(`🧭 Room ${data.start_room || "?"} → Room ${data.destination}`);
      speak(data.instruction || `Heading to room ${data.destination}.`);
    } catch (err: any) {
      setStatus("❌ " + (err.message || "Failed"));
      speak("I couldn't find a path to that room.");
    }
  }, [speak]);

  // Stop nav
  const stopNavigation = useCallback(() => {
    setIsNavigating(false);
    setNavPath([]);
    setDestination(null);
    setInstruction("");
    stopAudio();
    setStatus("Navigation stopped");
  }, [stopAudio]);

  // Announce scene
  const announceScene = useCallback(async () => {
    if (isSpeakingRef.current) { stopAudio(); setStatus("Stopped"); return; }
    setStatus("Analyzing scene...");
    try {
      const video = document.querySelector("video");
      if (!video || !video.videoWidth) { speak("Camera not active."); return; }
      const canvas = document.createElement("canvas");
      const scale = Math.min(1, 640 / video.videoWidth);
      canvas.width = video.videoWidth * scale;
      canvas.height = video.videoHeight * scale;
      canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.6));
      if (!blob) throw new Error("Capture failed");
      const form = new FormData();
      form.append("file", blob, "scene.jpg");
      if (isNavigating && destination) form.append("navigation_context", `User heading to room ${destination}.`);
      const res = await fetch(`${BACKEND_URL}/analyze-and-announce`, { method: "POST", body: form, signal: AbortSignal.timeout(45000) });
      if (!res.ok) throw new Error("Server " + res.status);
      const data = await res.json();
      setStatus("🗣️ Speaking...");
      await speak((data.announcement || "I couldn't analyze the scene.").trim());
      setStatus(isNavigating ? `🧭 Navigating to room ${destination}` : "Camera active");
    } catch (err: any) {
      setStatus("Error: " + (err.message || "Unknown"));
      speak("Something went wrong.");
    }
  }, [speak, stopAudio, isSpeakingRef, isNavigating, destination]);

  // Manual navigate
  const handleManualGo = useCallback(() => {
    const from = manualFrom.trim();
    const to = manualTo.trim();
    if (from && to) parseNavCommand(`I am in room ${from}, take me to room ${to}`, from);
  }, [manualFrom, manualTo, parseNavCommand]);

  // Format duration
  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  // Unique object labels for distribution
  const objectCounts: Record<string, number> = {};
  detections.forEach((d) => {
    objectCounts[d.label] = (objectCounts[d.label] || 0) + 1;
  });

  return (
    <div className="flex flex-col h-screen" style={{ background: "var(--color-bg-primary)", color: "var(--color-text-primary)" }}>
      {/* ── HEADER ── */}
      <header
        className="flex items-center justify-between px-6 py-3 shrink-0"
        style={{ background: "var(--color-bg-secondary)", borderBottom: "1px solid var(--color-border)" }}
      >
        <div className="flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2">
            <div className="logo-icon" style={{ width: 32, height: 32 }}>
              <i className="fas fa-eye" style={{ fontSize: "0.8rem" }} />
            </div>
            <span className="logo-text" style={{ fontSize: "1.1rem" }}>DWS</span>
          </Link>
          <span style={{ color: "var(--color-border)", fontSize: "1.2rem", fontWeight: 200 }}>|</span>
          <span style={{ color: "var(--color-text-muted)", fontSize: "0.875rem" }}>Dashboard</span>
        </div>

        <div className="flex items-center gap-4">
          {/* Status */}
          <div className="flex items-center gap-2" style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)" }}>
            {isConnected ? (
              <><Wifi className="h-4 w-4" style={{ color: "#86efac" }} /><span style={{ color: "#86efac" }}>Connected</span></>
            ) : (
              <><WifiOff className="h-4 w-4" /><span>Offline</span></>
            )}
          </div>
          <span style={{ color: "var(--color-text-muted)", fontSize: "0.8125rem" }}>
            {user?.firstName || user?.emailAddresses?.[0]?.emailAddress || "User"}
          </span>
          <UserButton afterSignOutUrl="/" />
        </div>
      </header>

      {/* ── STATUS BAR ── */}
      <div
        className="px-6 py-2 text-center shrink-0"
        style={{
          background: "var(--color-bg-card)",
          borderBottom: "1px solid var(--color-border)",
          fontSize: "0.8125rem",
          color: "var(--color-primary-400)",
        }}
      >
        {status}
      </div>

      {/* ── MAIN CONTENT ── */}
      <div className="flex-1 overflow-y-auto p-4" style={{ display: "flex", flexDirection: "column", gap: "var(--space-lg)" }}>
        {/* Camera + Map row */}
        <div style={{ display: "grid", gridTemplateColumns: isNavigating ? "1fr 400px" : "1fr", gap: "var(--space-lg)", height: "65vh", minHeight: 400 }}>
          {/* Camera View */}
          <div
            style={{
              background: "var(--color-bg-primary)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-lg)",
              overflow: "hidden",
              position: "relative",
              height: "100%",
            }}
          >
            {/* Mode tabs */}
            <div
              className="absolute top-3 left-3 flex gap-1 z-20"
              style={{
                background: "rgba(10,14,12,0.85)",
                backdropFilter: "blur(8px)",
                borderRadius: "var(--radius-md)",
                padding: "3px",
                border: "1px solid var(--color-border)",
              }}
            >
              <button
                onClick={() => { setViewerMode("phone"); setCameraActive(true); }}
                className="px-3 py-1.5 rounded-md text-xs font-semibold transition-all"
                style={{
                  background: viewerMode === "phone" ? "rgba(191,200,195,0.15)" : "transparent",
                  color: viewerMode === "phone" ? "var(--color-primary-400)" : "var(--color-text-muted)",
                }}
              >
                📱 Phone Feed
              </button>
              <button
                onClick={() => { setViewerMode("glasses"); setCameraActive(true); }}
                className="px-3 py-1.5 rounded-md text-xs font-semibold transition-all"
                style={{
                  background: viewerMode === "glasses" ? "rgba(147,197,253,0.2)" : "transparent",
                  color: viewerMode === "glasses" ? "#93c5fd" : "var(--color-text-muted)",
                }}
              >
                🕶️ Meta Glasses
              </button>
              <button
                onClick={() => { setViewerMode("webcam"); setCameraActive(true); }}
                className="px-3 py-1.5 rounded-md text-xs font-semibold transition-all"
                style={{
                  background: viewerMode === "webcam" ? "rgba(191,200,195,0.15)" : "transparent",
                  color: viewerMode === "webcam" ? "var(--color-primary-400)" : "var(--color-text-muted)",
                }}
              >
                🖥️ Local Webcam
              </button>
            </div>

            {cameraActive && viewerMode === "phone" ? (
              <CameraViewer
                serverUrl={BACKEND_URL}
                autoConnect={true}
                className="h-full w-full"
                onDetections={handleDetections}
                onInstruction={handleInstruction}
              />
            ) : cameraActive && viewerMode === "glasses" ? (
              <GlassesViewer
                serverUrl={BACKEND_URL}
                autoConnect={true}
                className="h-full w-full"
                onDetections={handleDetections}
                onInstruction={handleInstruction}
                onTextFound={handleTextFound}
              />
            ) : cameraActive && viewerMode === "webcam" ? (
              <CameraStream
                serverUrl={BACKEND_URL}
                autoStart={true}
                className="h-full w-full"
                onDetections={handleDetections}
                onInstruction={handleInstruction}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-4" style={{ color: "var(--color-text-muted)" }}>
                <Video className="h-16 w-16" style={{ opacity: 0.3 }} />
                <p style={{ fontSize: "0.9375rem" }}>Camera feed will appear here</p>
                <p style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)", maxWidth: 360, textAlign: "center" }}>
                  Open <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-primary-400)" }}>/static/camera_test.html</span> on your phone,{" "}
                  <span style={{ fontFamily: "var(--font-mono)", color: "#93c5fd" }}>/static/glasses_feed.html</span> for Meta Glasses, or use the local webcam
                </p>
                {isConnected && (
                  <div className="flex gap-3 flex-wrap justify-center">
                    <button
                      onClick={() => { setViewerMode("phone"); setCameraActive(true); }}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold"
                      style={{
                        background: "var(--gradient-smoke)",
                        color: "var(--color-bg-primary)",
                        fontSize: "0.875rem",
                        transition: "all var(--transition-fast)",
                      }}
                    >
                      <Video className="h-4 w-4" /> Phone Feed
                    </button>
                    <button
                      onClick={() => { setViewerMode("glasses"); setCameraActive(true); }}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold"
                      style={{
                        background: "rgba(147,197,253,0.15)",
                        color: "#93c5fd",
                        border: "1px solid rgba(147,197,253,0.2)",
                        fontSize: "0.875rem",
                        transition: "all var(--transition-fast)",
                      }}
                    >
                      <Glasses className="h-4 w-4" /> Meta Glasses
                    </button>
                    <button
                      onClick={() => { setViewerMode("webcam"); setCameraActive(true); }}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold"
                      style={{
                        background: "rgba(191,200,195,0.1)",
                        color: "var(--color-primary-400)",
                        border: "1px solid var(--color-border)",
                        fontSize: "0.875rem",
                        transition: "all var(--transition-fast)",
                      }}
                    >
                      <Video className="h-4 w-4" /> Local Webcam
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Overlay controls */}
            {cameraActive && viewerMode === "webcam" && (
              <div className="absolute top-3 right-3 flex gap-2" style={{ zIndex: 20 }}>
                <button
                  onClick={announceScene}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold"
                  style={{ background: "rgba(191,200,195,0.15)", backdropFilter: "blur(8px)", color: "var(--color-text-primary)", border: "1px solid var(--color-border)" }}
                >
                  <Eye className="h-3.5 w-3.5" /> What&apos;s Ahead
                </button>
              </div>
            )}

            {/* Glasses text reading overlay */}
            {cameraActive && viewerMode === "glasses" && glassesText && !glassesText.includes("No text visible") && (
              <div
                className="absolute bottom-16 left-3 right-3 flex items-start gap-2 rounded-lg px-3 py-2"
                style={{
                  background: "rgba(10,14,12,0.9)",
                  backdropFilter: "blur(10px)",
                  border: "1px solid rgba(147,197,253,0.2)",
                  fontSize: "0.75rem",
                  color: "#93c5fd",
                  zIndex: 20,
                  maxHeight: 80,
                  overflow: "hidden",
                  cursor: "pointer",
                }}
                onClick={readTextAloud}
                title="Click to read aloud"
              >
                <BookOpen className="h-3.5 w-3.5 shrink-0" style={{ marginTop: 1 }} />
                <span style={{ fontStyle: "italic" }}>
                  {glassesText.length > 200 ? glassesText.slice(0, 200) + "..." : glassesText}
                </span>
              </div>
            )}

            {/* Instruction overlay */}
            {instruction && cameraActive && (
              <div
                className="absolute bottom-3 left-3 right-3"
                style={{
                  background: "rgba(10,14,12,0.9)",
                  backdropFilter: "blur(10px)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-md)",
                  padding: "var(--space-sm) var(--space-md)",
                  fontSize: "0.8125rem",
                  color: "var(--color-text-primary)",
                  zIndex: 20,
                }}
              >
                {instruction}
              </div>
            )}
          </div>

          {/* Map View (shown when navigating) */}
          {isNavigating && navPath.length > 0 && (
            <div
              style={{
                background: "var(--color-bg-card)",
                border: "1px solid var(--color-border)",
                borderRadius: "var(--radius-lg)",
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div
                className="px-4 py-2 flex items-center gap-2"
                style={{
                  borderBottom: "1px solid var(--color-border)",
                  fontSize: "0.8125rem",
                  color: "var(--color-primary-400)",
                }}
              >
                <Navigation className="h-4 w-4" />
                <span>Floor Plan — Room {destination}</span>
              </div>
              <div className="flex-1">
                <FloorPlanMap
                  floorPlanUrl={`${BACKEND_URL}/static/floor_plans/basement.svg`}
                  path={navPath}
                  destination={destination || undefined}
                  simulateLiveTracking={true}
                  walkSpeed={1.0}
                  className="h-full w-full"
                  onArrived={() => {
                    setStatus("🎉 You have arrived!");
                    speak("You have arrived at your destination.");
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* ── CONTROLS ROW ── */}
        <div
          className="flex items-center justify-between flex-wrap gap-3 px-4 py-3"
          style={{
            background: "var(--color-bg-card)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-lg)",
          }}
        >
          <div className="flex items-center gap-3 flex-wrap">
            {!isConnected ? (
              <button
                onClick={connect}
                disabled={isConnecting}
                className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm"
                style={{
                  background: "var(--gradient-smoke)",
                  color: "var(--color-bg-primary)",
                  opacity: isConnecting ? 0.5 : 1,
                }}
              >
                <MapPin className="h-4 w-4" /> {isConnecting ? "Connecting..." : "Connect"}
              </button>
            ) : (
              <>
                {cameraActive ? (
                  <button
                    onClick={() => { setCameraActive(false); stopNavigation(); setGlassesText(""); }}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm"
                    style={{ background: "rgba(252,165,165,0.15)", color: "#fca5a5", border: "1px solid rgba(252,165,165,0.2)" }}
                  >
                    <Square className="h-4 w-4" /> Stop Feed
                  </button>
                ) : (
                  <button
                    onClick={() => { setViewerMode("phone"); setCameraActive(true); }}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm"
                    style={{ background: "var(--gradient-smoke)", color: "var(--color-bg-primary)" }}
                  >
                    <Video className="h-4 w-4" /> Start Feed
                  </button>
                )}

                {/* Read Text Aloud button (shown when glasses mode is active and text is found) */}
                {cameraActive && viewerMode === "glasses" && glassesText && (
                  <button
                    onClick={readTextAloud}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm"
                    style={{
                      background: "rgba(147,197,253,0.15)",
                      color: "#93c5fd",
                      border: "1px solid rgba(147,197,253,0.2)",
                    }}
                  >
                    <BookOpen className="h-4 w-4" /> Read Text Aloud
                  </button>
                )}

                {isNavigating ? (
                  <button
                    onClick={stopNavigation}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm"
                    style={{ background: "rgba(252,165,165,0.15)", color: "#fca5a5", border: "1px solid rgba(252,165,165,0.2)" }}
                  >
                    <Square className="h-4 w-4" /> End Route
                  </button>
                ) : (
                  <button
                    onClick={isListening ? () => { recognitionRef.current?.stop(); setIsListening(false); } : startListening}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm"
                    style={{
                      background: isListening ? "rgba(252,165,165,0.15)" : "rgba(191,200,195,0.1)",
                      color: isListening ? "#fca5a5" : "var(--color-primary-400)",
                      border: `1px solid ${isListening ? "rgba(252,165,165,0.2)" : "var(--color-border)"}`,
                    }}
                  >
                    {isListening ? <><MicOff className="h-4 w-4" /> Cancel</> : <><Mic className="h-4 w-4" /> Voice Navigate</>}
                  </button>
                )}
              </>
            )}
          </div>

          {/* Manual entry */}
          {isConnected && !isNavigating && (
            <div className="flex items-center gap-2">
              <input
                value={manualFrom}
                onChange={(e) => setManualFrom(e.target.value)}
                placeholder="From"
                className="px-3 py-2 rounded-lg text-sm w-24"
                style={{ background: "var(--color-bg-tertiary)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
              />
              <span style={{ color: "var(--color-text-muted)", fontSize: "0.75rem" }}>→</span>
              <input
                value={manualTo}
                onChange={(e) => setManualTo(e.target.value)}
                placeholder="To room"
                className="px-3 py-2 rounded-lg text-sm w-24"
                style={{ background: "var(--color-bg-tertiary)", border: "1px solid var(--color-border)", color: "var(--color-text-primary)" }}
                onKeyDown={(e) => e.key === "Enter" && handleManualGo()}
              />
              <button
                onClick={handleManualGo}
                className="px-4 py-2 rounded-lg font-semibold text-sm"
                style={{ background: "var(--gradient-smoke)", color: "var(--color-bg-primary)" }}
              >
                Go
              </button>
            </div>
          )}
        </div>

        {/* ── ANALYTICS ── */}
        <div>
          <h3 className="flex items-center gap-2 mb-3" style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--color-text-secondary)" }}>
            <BarChart3 className="h-4 w-4" style={{ color: "var(--color-primary-400)" }} />
            Session Analytics
          </h3>

          {/* Stats Grid */}
          <div className="dash-analytics" style={{ marginBottom: "var(--space-lg)" }}>
            <div className="dash-stat">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4" style={{ color: "var(--color-primary-400)" }} />
                <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>Session Time</span>
              </div>
              <div className="dash-stat-value">{formatDuration(duration)}</div>
              <div className="dash-stat-label">Duration</div>
            </div>

            <div className="dash-stat">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="h-4 w-4" style={{ color: "var(--color-primary-400)" }} />
                <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>Frame Rate</span>
              </div>
              <div className="dash-stat-value">{fps}</div>
              <div className="dash-stat-label">FPS (adaptive)</div>
            </div>

            <div className="dash-stat">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="h-4 w-4" style={{ color: "var(--color-primary-400)" }} />
                <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>Processing</span>
              </div>
              <div className="dash-stat-value">{stats.framesProcessed}</div>
              <div className="dash-stat-label">Frames processed</div>
            </div>

            <div className="dash-stat">
              <div className="flex items-center gap-2 mb-2">
                <Crosshair className="h-4 w-4" style={{ color: "var(--color-primary-400)" }} />
                <span style={{ fontSize: "0.75rem", color: "var(--color-text-muted)" }}>Detection</span>
              </div>
              <div className="dash-stat-value">{stats.objectsDetected}</div>
              <div className="dash-stat-label">Objects detected</div>
            </div>
          </div>

          {/* Detections + Threats + Distance */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "var(--space-lg)" }}>
            {/* Live Detections */}
            <div className="dash-detections">
              <h4 className="flex items-center gap-2 mb-3" style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-primary-400)" }}>
                <Eye className="h-4 w-4" /> Live Detections
              </h4>
              {detections.length === 0 ? (
                <p style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)", fontStyle: "italic" }}>Path clear — no objects detected</p>
              ) : (
                [...detections].sort((a, b) => (a.distance ?? 999) - (b.distance ?? 999)).map((d, i) => (
                  <div key={i} className="detection-row">
                    <span style={{ color: "var(--color-text-primary)" }}>
                      {d.label} <span style={{ color: "var(--color-text-muted)", fontSize: "0.75rem" }}>({(d.confidence * 100).toFixed(0)}%)</span>
                    </span>
                    <span className={d.distance != null ? (d.distance < 1 ? "threat-danger" : d.distance < 2 ? "threat-warning" : d.distance < 3.5 ? "threat-caution" : "threat-safe") : ""}>
                      {d.distance != null ? `${d.distance.toFixed(1)}m` : "—"}
                    </span>
                  </div>
                ))
              )}
            </div>

            {/* Threat Level Summary */}
            <div className="dash-detections">
              <h4 className="flex items-center gap-2 mb-3" style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-primary-400)" }}>
                <Shield className="h-4 w-4" /> Threat Events
              </h4>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#fca5a5" }} />
                    <span style={{ fontSize: "0.8125rem" }}>Danger (&lt;1m)</span>
                  </div>
                  <span className="threat-danger" style={{ fontFamily: "var(--font-mono)", fontSize: "0.875rem", fontWeight: 600 }}>
                    {stats.threatEvents.danger}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#fde047" }} />
                    <span style={{ fontSize: "0.8125rem" }}>Warning (1-2m)</span>
                  </div>
                  <span className="threat-warning" style={{ fontFamily: "var(--font-mono)", fontSize: "0.875rem", fontWeight: 600 }}>
                    {stats.threatEvents.warning}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#bfc8c3" }} />
                    <span style={{ fontSize: "0.8125rem" }}>Caution (2-3.5m)</span>
                  </div>
                  <span className="threat-caution" style={{ fontFamily: "var(--font-mono)", fontSize: "0.875rem", fontWeight: 600 }}>
                    {stats.threatEvents.caution}
                  </span>
                </div>

                <div style={{ borderTop: "1px solid var(--color-border)", paddingTop: "var(--space-sm)", marginTop: "var(--space-xs)" }}>
                  <div className="flex justify-between items-center">
                    <span style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)" }}>Avg Distance</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.875rem", color: "var(--color-primary-400)" }}>
                      {stats.avgDistance > 0 ? `${stats.avgDistance.toFixed(1)}m` : "—"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Object Distribution */}
            <div className="dash-detections">
              <h4 className="flex items-center gap-2 mb-3" style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-primary-400)" }}>
                <BarChart3 className="h-4 w-4" /> Object Distribution
              </h4>
              {Object.keys(objectCounts).length === 0 ? (
                <p style={{ fontSize: "0.8125rem", color: "var(--color-text-muted)", fontStyle: "italic" }}>No objects in current frame</p>
              ) : (
                Object.entries(objectCounts)
                  .sort(([, a], [, b]) => b - a)
                  .map(([label, count]) => (
                    <div key={label} className="detection-row">
                      <span style={{ color: "var(--color-text-primary)", textTransform: "capitalize" }}>{label}</span>
                      <div className="flex items-center gap-2">
                        <div
                          style={{
                            width: Math.min(80, count * 30),
                            height: 6,
                            borderRadius: 3,
                            background: "var(--gradient-smoke)",
                            transition: "width 0.3s ease",
                          }}
                        />
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--color-text-muted)", minWidth: 16, textAlign: "right" }}>
                          {count}
                        </span>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
