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
}

export function CameraStream({
  serverUrl,
  onDetections,
  onInstruction,
  onFrame,
  className = "",
  autoStart = false,
}: CameraStreamProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processedFrame, setProcessedFrame] = useState<string | null>(null);

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
        return;
      }
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
    };

    ws.onerror = () => {
      setError("WebSocket connection error");
      setIsConnected(false);
    };

    ws.onclose = () => {
      setIsConnected(false);
    };

    wsRef.current = ws;
  }, [serverUrl, onDetections, onInstruction, onFrame]);

  // Start camera and streaming
  const startStreaming = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: 640, height: 480 },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      connect();
      setIsStreaming(true);
      setError(null);
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
    setIsStreaming(false);
    setIsConnected(false);
    setProcessedFrame(null);
  }, []);

  // Send frames to server
  useEffect(() => {
    if (!isStreaming || !isConnected) return;

    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId: number;
    let lastSendTime = 0;
    const minInterval = 100; // 10 FPS max

    const sendFrame = (timestamp: number) => {
      if (timestamp - lastSendTime >= minInterval && wsRef.current?.readyState === WebSocket.OPEN) {
        // Scale down frame for performance
        const scale = 320 / video.videoWidth;
        canvas.width = 320;
        canvas.height = video.videoHeight * scale;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              const reader = new FileReader();
              reader.onload = () => {
                const base64 = (reader.result as string).split(",")[1];
                wsRef.current?.send(base64);
              };
              reader.readAsDataURL(blob);
            }
          },
          "image/jpeg",
          0.5
        );
        lastSendTime = timestamp;
      }
      animationId = requestAnimationFrame(sendFrame);
    };

    animationId = requestAnimationFrame(sendFrame);
    return () => cancelAnimationFrame(animationId);
  }, [isStreaming, isConnected]);

  // Auto-start
  useEffect(() => {
    if (autoStart) startStreaming();
    return () => stopStreaming();
  }, [autoStart, startStreaming, stopStreaming]);

  return (
    <div className={`relative overflow-hidden rounded-xl bg-slate-900 ${className}`}>
      {/* Hidden video element */}
      <video ref={videoRef} className="hidden" playsInline muted />
      <canvas ref={canvasRef} className="hidden" />

      {/* Display processed frame or placeholder */}
      {processedFrame ? (
        <img src={processedFrame} alt="Processed camera feed" className="h-full w-full object-cover" />
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
      <div className="absolute left-2 top-2">
        <div
          className={`h-3 w-3 rounded-full ${
            isConnected ? "animate-pulse bg-green-500" : "bg-gray-500"
          }`}
        />
      </div>
    </div>
  );
}
