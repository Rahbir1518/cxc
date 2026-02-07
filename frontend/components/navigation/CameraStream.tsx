"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { Camera, Video, VideoOff, AlertCircle } from "lucide-react";

interface DetectedObject {
  label: string;
  confidence: number;
  distance?: number;
  position?: string;
  is_blocking_path?: boolean;
  bbox: number[];
  center: number[];
}

interface CameraStreamProps {
  serverUrl: string;
  onDetections?: (objects: DetectedObject[]) => void;
  onInstruction?: (instruction: string) => void;
  onFrame?: (frameBase64: string) => void;
  className?: string;
  autoStart?: boolean;
  /** Target send width in px (lower = faster). Default 240 */
  sendWidth?: number;
  /** JPEG quality 0-1 for sent frames. Default 0.4 */
  sendQuality?: number;
}

export function CameraStream({
  serverUrl,
  onDetections,
  onInstruction,
  onFrame,
  className = "",
  autoStart = false,
  sendWidth = 240,
  sendQuality = 0.4,
}: CameraStreamProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processedFrame, setProcessedFrame] = useState<string | null>(null);

  // ── Backpressure & adaptive rate ──
  const awaitingResponseRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const adaptiveIntervalRef = useRef(200); // ms between sends, starts at 200
  const lastRTTRef = useRef(200);          // last round-trip time in ms
  const sendTimestampRef = useRef(0);

  // ── FPS counter for debug ──
  const [fps, setFps] = useState(0);
  const fpsCounterRef = useRef(0);
  const fpsTimerRef = useRef(0);

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const wsUrl = serverUrl.replace(/^http/, "ws") + "/ws/video";
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setIsConnected(true);
      setError(null);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.error) {
        setError(data.error);
        awaitingResponseRef.current = false;
        return;
      }

      // Measure RTT for adaptive rate
      const rtt = Date.now() - sendTimestampRef.current;
      lastRTTRef.current = rtt;

      // Adaptive interval: target ~60% utilization
      // If server responds in 50ms, we can send every ~80ms
      // If server responds in 300ms, back off to ~500ms
      adaptiveIntervalRef.current = Math.max(
        80,
        Math.min(800, Math.round(rtt * 1.6))
      );

      // FPS tracking
      fpsCounterRef.current++;
      const now = Date.now();
      if (now - fpsTimerRef.current >= 1000) {
        setFps(fpsCounterRef.current);
        fpsCounterRef.current = 0;
        fpsTimerRef.current = now;
      }

      // Only update displayed frame if server sent one (frame skipping means
      // not every response includes frame_base64)
      if (data.frame_base64) {
        setProcessedFrame(`data:image/jpeg;base64,${data.frame_base64}`);
        onFrame?.(data.frame_base64);
      }
      if (data.objects) {
        onDetections?.(data.objects);
      }
      if (data.instruction) {
        onInstruction?.(data.instruction);
      }

      // Release backpressure — allow next send
      awaitingResponseRef.current = false;
    };

    ws.onerror = () => {
      setError("WebSocket connection error");
      setIsConnected(false);
      awaitingResponseRef.current = false;
    };

    ws.onclose = () => {
      setIsConnected(false);
      awaitingResponseRef.current = false;
    };

    wsRef.current = ws;
  }, [serverUrl, onDetections, onInstruction, onFrame]);

  // Start camera and streaming
  const startStreaming = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      connect();
      setIsStreaming(true);
      setError(null);
      fpsTimerRef.current = Date.now();
    } catch (err) {
      setError(`Camera error: ${err}`);
    }
  }, [connect]);

  // Stop streaming
  const stopStreaming = useCallback(() => {
    if (videoRef.current?.srcObject) {
      (videoRef.current.srcObject as MediaStream)
        .getTracks()
        .forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    wsRef.current?.close();
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsStreaming(false);
    setIsConnected(false);
    setProcessedFrame(null);
    awaitingResponseRef.current = false;
  }, []);

  // ── Frame sender with backpressure + adaptive rate ──
  useEffect(() => {
    if (!isStreaming || !isConnected) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Pre-size the reusable canvas once
    const scale = sendWidth / (video.videoWidth || 640);
    canvas.width = sendWidth;
    canvas.height = Math.round((video.videoHeight || 480) * scale);

    const trySendFrame = () => {
      // Backpressure: don't send if still waiting for previous response
      if (awaitingResponseRef.current) return;
      if (!video.videoWidth || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

      // Resize canvas if video dimensions changed
      const newScale = sendWidth / video.videoWidth;
      const newH = Math.round(video.videoHeight * newScale);
      if (canvas.width !== sendWidth || canvas.height !== newH) {
        canvas.width = sendWidth;
        canvas.height = newH;
      }

      // Draw & encode
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob(
        (blob) => {
          if (!blob || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

          const reader = new FileReader();
          reader.onload = () => {
            const base64 = (reader.result as string).split(",")[1];
            awaitingResponseRef.current = true;
            sendTimestampRef.current = Date.now();
            wsRef.current?.send(base64);
          };
          reader.readAsDataURL(blob);
        },
        "image/jpeg",
        sendQuality
      );
    };

    // Use setInterval with adaptive rate instead of rAF
    // (rAF fires at 60fps but we only need 5-12fps)
    const tick = () => {
      trySendFrame();
    };

    // Start with a fixed interval, then adapt
    intervalRef.current = setInterval(tick, 100); // Check every 100ms

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isStreaming, isConnected, sendWidth, sendQuality]);

  // Auto-start
  useEffect(() => {
    if (autoStart) startStreaming();
    return () => stopStreaming();
  }, [autoStart, startStreaming, stopStreaming]);

  return (
    <div className={`relative overflow-hidden rounded-xl bg-slate-900 ${className}`}>
      {/* Hidden video element */}
      <video ref={videoRef} className="hidden" playsInline muted />
      {/* Reusable hidden canvas for frame capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Display processed frame or placeholder */}
      {processedFrame ? (
        <img
          src={processedFrame}
          alt="Processed camera feed"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full min-h-[200px] items-center justify-center text-slate-500">
          <Camera className="h-12 w-12" />
        </div>
      )}

      {/* Error overlay */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-900/80 text-white">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="absolute bottom-2 right-2 flex gap-2">
        {!isStreaming ? (
          <button
            onClick={startStreaming}
            className="rounded-full bg-emerald-500 p-3 text-white shadow-lg hover:bg-emerald-600"
          >
            <Video className="h-5 w-5" />
          </button>
        ) : (
          <button
            onClick={stopStreaming}
            className="rounded-full bg-red-500 p-3 text-white shadow-lg hover:bg-red-600"
          >
            <VideoOff className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Status indicator */}
      <div className="absolute left-2 top-2 flex items-center gap-2">
        <div
          className={`h-3 w-3 rounded-full ${
            isConnected ? "animate-pulse bg-green-500" : "bg-gray-500"
          }`}
        />
        {isStreaming && (
          <span className="text-[10px] text-white/50 font-mono">
            {fps} fps · {lastRTTRef.current}ms
          </span>
        )}
      </div>
    </div>
  );
}
