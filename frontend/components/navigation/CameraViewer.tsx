"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import React from "react";
import { Camera, Wifi, WifiOff, AlertCircle } from "lucide-react";

interface DetectedObject {
  label: string;
  confidence: number;
  distance?: number;
  position?: string;
  is_blocking_path?: boolean;
  bbox: number[];
  center: number[];
}

interface CameraViewerProps {
  serverUrl: string;
  onDetections?: (objects: DetectedObject[]) => void;
  onInstruction?: (instruction: string) => void;
  onFrame?: (frameBase64: string) => void;
  className?: string;
  autoConnect?: boolean;
}

const WS_MAX_RETRIES = 10;
const WS_BASE_DELAY_MS = 1000;
const WS_MAX_DELAY_MS = 15000;

function CameraViewerInner({
  serverUrl,
  onDetections,
  onInstruction,
  onFrame,
  className = "",
  autoConnect = true,
}: CameraViewerProps) {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [hasData, setHasData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processedFrame, setProcessedFrame] = useState<string | null>(null);

  // FPS counter
  const [fps, setFps] = useState(0);
  const fpsCounterRef = useRef(0);
  const fpsTimerRef = useRef(0);

  // Reconnection state
  const wsRetriesRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intentionalCloseRef = useRef(false);
  // Heartbeat timer
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const wsUrl = serverUrl.replace(/^http/, "ws") + "/ws/viewer";
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setIsConnected(true);
      setError(null);
      wsRetriesRef.current = 0;

      // Send heartbeat every 20s to keep connection alive
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      heartbeatRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send("heartbeat");
        }
      }, 20000);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // Skip keepalive pings
        if (data.type === "ping") return;

        if (data.error) {
          setError(data.error);
          return;
        }

        setHasData(true);

        // FPS tracking
        fpsCounterRef.current++;
        const now = Date.now();
        if (now - fpsTimerRef.current >= 1000) {
          setFps(fpsCounterRef.current);
          fpsCounterRef.current = 0;
          fpsTimerRef.current = now;
        }

        // Update displayed frame
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
      } catch (e) {
        console.error("Viewer WS parse error", e);
      }
    };

    ws.onerror = () => {
      setError("Connection error");
      setIsConnected(false);
    };

    ws.onclose = () => {
      setIsConnected(false);
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }

      // Auto-reconnect with exponential backoff
      if (
        !intentionalCloseRef.current &&
        wsRetriesRef.current < WS_MAX_RETRIES
      ) {
        const delay = Math.min(
          WS_MAX_DELAY_MS,
          WS_BASE_DELAY_MS * Math.pow(2, wsRetriesRef.current)
        );
        wsRetriesRef.current++;
        setError(`Reconnecting (${wsRetriesRef.current}/${WS_MAX_RETRIES})...`);
        reconnectTimerRef.current = setTimeout(() => {
          connect();
        }, delay);
      } else if (wsRetriesRef.current >= WS_MAX_RETRIES) {
        setError("Connection lost. Refresh to retry.");
      }
    };

    wsRef.current = ws;
  }, [serverUrl, onDetections, onInstruction, onFrame]);

  const disconnect = useCallback(() => {
    intentionalCloseRef.current = true;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    wsRef.current?.close();
    setIsConnected(false);
    setHasData(false);
    setProcessedFrame(null);
    wsRetriesRef.current = 0;
  }, []);

  // Auto-connect
  useEffect(() => {
    if (autoConnect) {
      intentionalCloseRef.current = false;
      wsRetriesRef.current = 0;
      fpsTimerRef.current = Date.now();
      connect();
    }
    return () => disconnect();
  }, [autoConnect, connect, disconnect]);

  return (
    <div
      className={`relative overflow-hidden rounded-xl ${className}`}
      style={{ background: "var(--color-bg-primary)", display: "flex", flexDirection: "column" }}
    >
      {/* Display processed frame or waiting state */}
      {processedFrame ? (
        <img
          src={processedFrame}
          alt="Live camera feed from phone"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            position: "absolute",
            inset: 0,
            background: "var(--color-bg-primary)",
          }}
        />
      ) : (
        <div
          className="flex h-full min-h-[200px] flex-col items-center justify-center gap-3"
          style={{ color: "var(--color-text-muted)", flex: 1 }}
        >
          <Camera className="h-12 w-12" style={{ opacity: 0.3 }} />
          <p style={{ fontSize: "0.875rem" }}>
            {isConnected
              ? "Waiting for camera feed from phone..."
              : "Connecting to server..."}
          </p>
          <p style={{ fontSize: "0.75rem", color: "var(--color-text-muted)", maxWidth: 280, textAlign: "center" }}>
            Open <span style={{ fontFamily: "var(--font-mono)", color: "var(--color-primary-400)" }}>
              /static/camera_test.html
            </span> on your phone and tap Start
          </p>
        </div>
      )}

      {/* Error overlay */}
      {error && !processedFrame && (
        <div
          className="absolute bottom-3 left-3 right-3 flex items-center gap-2 rounded-lg px-3 py-2"
          style={{
            background: "rgba(252,165,165,0.1)",
            border: "1px solid rgba(252,165,165,0.2)",
            fontSize: "0.75rem",
            color: "#fca5a5",
          }}
        >
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Status indicator */}
      <div className="absolute left-2 top-2 flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          {isConnected ? (
            <Wifi className="h-3 w-3" style={{ color: "#86efac" }} />
          ) : (
            <WifiOff className="h-3 w-3" style={{ color: "var(--color-text-muted)" }} />
          )}
          <div
            className={`h-2.5 w-2.5 rounded-full ${
              hasData ? "bg-green-500" : isConnected ? "bg-yellow-500" : "bg-gray-500"
            }`}
            style={hasData ? { animation: "pulse-soft 2s infinite" } : {}}
          />
        </div>
        {hasData && (
          <span
            className="text-[10px]"
            style={{
              color: "rgba(255,255,255,0.5)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {fps} fps
          </span>
        )}
      </div>
    </div>
  );
}

export const CameraViewer = React.memo(CameraViewerInner);
