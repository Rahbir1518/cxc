"use client";

import { useState, useRef, useCallback, useEffect } from "react";

type ScanState =
  | "idle"
  | "camera-starting"
  | "ready"
  | "capturing"
  | "detecting"
  | "speaking"
  | "error";

interface BrailleResult {
  text: string;
  method: string;
  audio_base64: string | null;
  message: string;
}

export default function BrailleScanner() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [scanState, setScanState] = useState<ScanState>("idle");
  const [result, setResult] = useState<BrailleResult | null>(null);
  const [error, setError] = useState<string>("");
  const [cameraFacing, setCameraFacing] = useState<"environment" | "user">("environment");
  const [history, setHistory] = useState<BrailleResult[]>([]);
  const [isAutoScan, setIsAutoScan] = useState(false);
  const autoScanInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Camera Setup ────────────────────────────────────────────────────────

  const startCamera = useCallback(async () => {
    setScanState("camera-starting");
    setError("");

    try {
      // Stop any existing stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: cameraFacing,
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setScanState("ready");
    } catch (err) {
      console.error("Camera error:", err);
      setError(
        "Could not access camera. Please allow camera permissions and try again."
      );
      setScanState("error");
    }
  }, [cameraFacing]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (autoScanInterval.current) {
      clearInterval(autoScanInterval.current);
      autoScanInterval.current = null;
    }
    setScanState("idle");
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (autoScanInterval.current) {
        clearInterval(autoScanInterval.current);
      }
    };
  }, []);

  // ─── Capture Frame ───────────────────────────────────────────────────────

  const captureFrame = useCallback((): string | null => {
    if (!videoRef.current || !canvasRef.current) return null;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.9);
  }, []);

  // ─── Scan Braille ────────────────────────────────────────────────────────

  const scanBraille = useCallback(async () => {
    if (scanState === "detecting" || scanState === "speaking") return;

    setScanState("capturing");
    setError("");
    setResult(null);

    const imageBase64 = captureFrame();
    if (!imageBase64) {
      setError("Failed to capture image from camera");
      setScanState("ready");
      return;
    }

    setScanState("detecting");

    try {
      const response = await fetch("/api/braille", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_base64: imageBase64,
          method: "gemini",
          mode: "direct",
        }),
      });

      if (!response.ok) {
        throw new Error(`API returned ${response.status}`);
      }

      const data: BrailleResult = await response.json();
      setResult(data);

      if (data.text) {
        // Add to history
        setHistory((prev) => [data, ...prev].slice(0, 10));

        // Play audio if available
        if (data.audio_base64) {
          setScanState("speaking");
          await playAudio(data.audio_base64);
        }
      }

      setScanState("ready");
    } catch (err) {
      console.error("Braille scan error:", err);
      setError("Failed to detect braille. Please try again.");
      setScanState("ready");
    }
  }, [scanState, captureFrame]);

  // ─── Audio Playback ──────────────────────────────────────────────────────

  const playAudio = useCallback(async (base64Audio: string) => {
    return new Promise<void>((resolve) => {
      if (audioRef.current) {
        audioRef.current.src = `data:audio/mpeg;base64,${base64Audio}`;
        audioRef.current.onended = () => resolve();
        audioRef.current.onerror = () => resolve();
        audioRef.current.play().catch(() => resolve());
      } else {
        resolve();
      }
    });
  }, []);

  // Replay last audio
  const replayAudio = useCallback(() => {
    if (result?.audio_base64) {
      playAudio(result.audio_base64);
    }
  }, [result, playAudio]);

  // ─── Auto-scan mode ──────────────────────────────────────────────────────

  const toggleAutoScan = useCallback(() => {
    if (isAutoScan) {
      if (autoScanInterval.current) {
        clearInterval(autoScanInterval.current);
        autoScanInterval.current = null;
      }
      setIsAutoScan(false);
    } else {
      setIsAutoScan(true);
      // Scan every 5 seconds
      autoScanInterval.current = setInterval(() => {
        if (scanState === "ready") {
          scanBraille();
        }
      }, 5000);
    }
  }, [isAutoScan, scanState, scanBraille]);

  // ─── Camera flip ─────────────────────────────────────────────────────────

  const flipCamera = useCallback(async () => {
    setCameraFacing((prev) => (prev === "environment" ? "user" : "environment"));
  }, []);

  useEffect(() => {
    if (scanState !== "idle") {
      startCamera();
    }
  }, [cameraFacing]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="braille-scanner">
      {/* Hidden elements */}
      <canvas ref={canvasRef} className="hidden" />
      <audio ref={audioRef} className="hidden" />

      {/* ── Idle State ─────────────────────────────────────────── */}
      {scanState === "idle" && (
        <div className="braille-scanner__start">
          <div className="braille-scanner__icon">
            <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
              {/* Braille dots icon */}
              <circle cx="25" cy="20" r="6" fill="currentColor" opacity="0.9" />
              <circle cx="45" cy="20" r="6" fill="currentColor" opacity="0.4" />
              <circle cx="25" cy="40" r="6" fill="currentColor" opacity="0.9" />
              <circle cx="45" cy="40" r="6" fill="currentColor" opacity="0.9" />
              <circle cx="25" cy="60" r="6" fill="currentColor" opacity="0.4" />
              <circle cx="45" cy="60" r="6" fill="currentColor" opacity="0.9" />
              {/* Camera outline */}
              <rect x="2" y="2" width="76" height="76" rx="12" stroke="currentColor" strokeWidth="2.5" strokeDasharray="6 4" opacity="0.5" />
            </svg>
          </div>
          <h2 className="braille-scanner__title">Braille Scanner</h2>
          <p className="braille-scanner__subtitle">
            Point your camera at braille text to read it aloud
          </p>
          <button onClick={startCamera} className="braille-scanner__btn braille-scanner__btn--primary">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            Start Camera
          </button>
        </div>
      )}

      {/* ── Camera View ────────────────────────────────────────── */}
      {scanState !== "idle" && (
        <div className="braille-scanner__camera-container">
          {/* Video feed */}
          <div className="braille-scanner__video-wrapper">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="braille-scanner__video"
            />

            {/* Scanning overlay */}
            <div className="braille-scanner__overlay">
              <div className="braille-scanner__crosshair" />
              <p className="braille-scanner__overlay-text">
                {scanState === "camera-starting" && "Starting camera..."}
                {scanState === "capturing" && "Capturing..."}
                {scanState === "detecting" && "Analyzing braille..."}
                {scanState === "speaking" && "Reading aloud..."}
                {scanState === "ready" && "Aim at braille text"}
              </p>
            </div>

            {/* Status indicator */}
            {(scanState === "detecting" || scanState === "speaking") && (
              <div className="braille-scanner__status-pill">
                <span className="braille-scanner__pulse" />
                {scanState === "detecting" ? "Detecting braille..." : "Speaking..."}
              </div>
            )}
          </div>

          {/* Controls bar */}
          <div className="braille-scanner__controls">
            <button onClick={flipCamera} className="braille-scanner__btn braille-scanner__btn--icon" title="Flip camera">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10" />
                <polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
            </button>

            <button
              onClick={scanBraille}
              disabled={scanState === "detecting" || scanState === "speaking" || scanState === "camera-starting"}
              className="braille-scanner__btn braille-scanner__btn--scan"
              title="Scan braille"
            >
              <div className="braille-scanner__scan-ring">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="8" cy="6" r="2" fill="currentColor" />
                  <circle cx="16" cy="6" r="2" fill="currentColor" opacity="0.3" />
                  <circle cx="8" cy="12" r="2" fill="currentColor" />
                  <circle cx="16" cy="12" r="2" fill="currentColor" />
                  <circle cx="8" cy="18" r="2" fill="currentColor" opacity="0.3" />
                  <circle cx="16" cy="18" r="2" fill="currentColor" />
                </svg>
              </div>
            </button>

            <button
              onClick={toggleAutoScan}
              className={`braille-scanner__btn braille-scanner__btn--icon ${isAutoScan ? "braille-scanner__btn--active" : ""}`}
              title={isAutoScan ? "Stop auto-scan" : "Start auto-scan"}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              {isAutoScan && <span className="braille-scanner__auto-badge">AUTO</span>}
            </button>
          </div>

          {/* Close camera button */}
          <button onClick={stopCamera} className="braille-scanner__close-btn" title="Close camera">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}

      {/* ── Error Banner ───────────────────────────────────────── */}
      {error && (
        <div className="braille-scanner__error">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          {error}
        </div>
      )}

      {/* ── Result Card ────────────────────────────────────────── */}
      {result && result.text && (
        <div className="braille-scanner__result">
          <div className="braille-scanner__result-header">
            <span className="braille-scanner__result-label">Detected Braille</span>
            <span className={`braille-scanner__confidence braille-scanner__confidence--${result.method}`}>
              {result.method === "gemini-direct" ? "AI Vision" : result.method}
            </span>
          </div>
          <p className="braille-scanner__result-text">{result.text}</p>
          <div className="braille-scanner__result-actions">
            {result.audio_base64 && (
              <button onClick={replayAudio} className="braille-scanner__btn braille-scanner__btn--small">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                </svg>
                Replay
              </button>
            )}
          </div>
        </div>
      )}

      {result && !result.text && scanState === "ready" && (
        <div className="braille-scanner__result braille-scanner__result--empty">
          <p className="braille-scanner__result-text braille-scanner__result-text--muted">
            No braille detected. Try adjusting the angle or distance.
          </p>
        </div>
      )}

      {/* ── Scan History ───────────────────────────────────────── */}
      {history.length > 0 && (
        <div className="braille-scanner__history">
          <h3 className="braille-scanner__history-title">Recent Scans</h3>
          <div className="braille-scanner__history-list">
            {history.map((item, idx) => (
              <div key={idx} className="braille-scanner__history-item">
                <span className="braille-scanner__history-text">{item.text}</span>
                {item.audio_base64 && (
                  <button
                    onClick={() => playAudio(item.audio_base64!)}
                    className="braille-scanner__btn braille-scanner__btn--tiny"
                    title="Play"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
