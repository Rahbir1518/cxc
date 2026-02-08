"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import React from "react";
import { Glasses, Wifi, WifiOff, AlertCircle, BookOpen } from "lucide-react";

interface DetectedObject {
  label: string;
  confidence: number;
  distance?: number;
  position?: string;
  is_blocking_path?: boolean;
  bbox: number[];
  center: number[];
}

interface GlassesViewerProps {
  serverUrl: string;
  onDetections?: (objects: DetectedObject[]) => void;
  onInstruction?: (instruction: string) => void;
  onFrame?: (frameBase64: string) => void;
  onTextFound?: (text: string) => void;
  className?: string;
  autoConnect?: boolean;
}

const WS_MAX_RETRIES = 10;
const WS_BASE_DELAY_MS = 1000;
const WS_MAX_DELAY_MS = 15000;

function GlassesViewerInner({
  serverUrl,
  onDetections,
  onInstruction,
  onFrame,
  onTextFound,
  className = "",
  autoConnect = true,
}: GlassesViewerProps) {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [hasData, setHasData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processedFrame, setProcessedFrame] = useState<string | null>(null);
  const [lastTextFound, setLastTextFound] = useState<string>("");
  const [isReadingText, setIsReadingText] = useState(false);

  // FPS counter
  const [fps, setFps] = useState(0);
  const fpsCounterRef = useRef(0);
  const fpsTimerRef = useRef(0);

  // Reconnection state
  const wsRetriesRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intentionalCloseRef = useRef(false);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const wsUrl = serverUrl.replace(/^http/, "ws") + "/ws/glasses-viewer";
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      setIsConnected(true);
      setError(null);
      wsRetriesRef.current = 0;

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
        if (data.text_found && data.text_found !== lastTextFound) {
          setLastTextFound(data.text_found);
          onTextFound?.(data.text_found);
        }
      } catch (e) {
        console.error("Glasses Viewer WS parse error", e);
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
  }, [serverUrl, onDetections, onInstruction, onFrame, onTextFound, lastTextFound]);

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

  // Read Text button handler — calls /read-text endpoint
  const handleReadText = useCallback(async () => {
    if (isReadingText || !processedFrame) return;
    setIsReadingText(true);

    try {
      // Convert the current frame to blob
      const response = await fetch(processedFrame);
      const blob = await response.blob();

      const form = new FormData();
      form.append("file", blob, "glasses_frame.jpg");

      const res = await fetch(`${serverUrl}/read-text`, {
        method: "POST",
        body: form,
      });

      if (!res.ok) throw new Error(`Server ${res.status}`);
      const data = await res.json();
      const text = data.text_found || "No text found";
      setLastTextFound(text);
      onTextFound?.(text);
    } catch (err) {
      console.error("Read text error:", err);
    }
    setIsReadingText(false);
  }, [isReadingText, processedFrame, serverUrl, onTextFound]);

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
      style={{
        background: "var(--color-bg-primary)",
        position: "relative",
        width: "100%",
        height: "100%",
      }}
    >
      {/* Display processed frame or waiting state */}
      {processedFrame ? (
        <img
          src={processedFrame}
          alt="Live feed from Meta Glasses"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "contain",
          }}
        />
      ) : (
        <div
          className="flex flex-col items-center justify-center gap-3"
          style={{
            color: "var(--color-text-muted)",
            position: "absolute",
            inset: 0,
          }}
        >
          <Glasses className="h-12 w-12" style={{ opacity: 0.3 }} />
          <p style={{ fontSize: "0.875rem" }}>
            {isConnected
              ? "Waiting for Meta Glasses feed..."
              : "Connecting to glasses stream..."}
          </p>
          <p
            style={{
              fontSize: "0.75rem",
              color: "var(--color-text-muted)",
              maxWidth: 340,
              textAlign: "center",
              lineHeight: 1.6,
            }}
          >
            Open{" "}
            <span
              style={{
                fontFamily: "var(--font-mono)",
                color: "var(--color-primary-400)",
              }}
            >
              /static/glasses_feed.html
            </span>{" "}
            on this computer. Start a video call from your Meta Glasses
            (WhatsApp/Messenger), answer on this PC, then capture the call window.
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

      {/* Text found overlay */}
      {lastTextFound &&
        !lastTextFound.includes("No text visible") &&
        !lastTextFound.includes("don't see") && (
          <div
            className="absolute bottom-14 left-3 right-3 rounded-lg px-3 py-2"
            style={{
              background: "rgba(10,14,12,0.9)",
              backdropFilter: "blur(10px)",
              border: "1px solid rgba(147,197,253,0.2)",
              fontSize: "0.75rem",
              color: "#93c5fd",
              maxHeight: 80,
              overflow: "hidden",
              zIndex: 20,
            }}
          >
            <div className="flex items-start gap-1.5">
              <BookOpen
                className="h-3.5 w-3.5 shrink-0"
                style={{ marginTop: 1 }}
              />
              <span style={{ fontStyle: "italic" }}>
                {lastTextFound.length > 150
                  ? lastTextFound.slice(0, 150) + "..."
                  : lastTextFound}
              </span>
            </div>
          </div>
        )}

      {/* Status indicator + Read Text button */}
      <div className="absolute left-2 top-2 flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          {isConnected ? (
            <Wifi className="h-3 w-3" style={{ color: "#86efac" }} />
          ) : (
            <WifiOff
              className="h-3 w-3"
              style={{ color: "var(--color-text-muted)" }}
            />
          )}
          <div
            className={`h-2.5 w-2.5 rounded-full ${
              hasData
                ? "bg-green-500"
                : isConnected
                  ? "bg-yellow-500"
                  : "bg-gray-500"
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
        <span
          className="text-[10px] px-1.5 py-0.5 rounded"
          style={{
            background: "rgba(147,197,253,0.15)",
            color: "#93c5fd",
            fontFamily: "var(--font-mono)",
          }}
        >
          GLASSES
        </span>
      </div>

      {/* Read Text overlay button */}
      {hasData && (
        <div className="absolute top-2 right-2" style={{ zIndex: 20 }}>
          <button
            onClick={handleReadText}
            disabled={isReadingText || !processedFrame}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
            style={{
              background: isReadingText
                ? "rgba(147,197,253,0.3)"
                : "rgba(147,197,253,0.15)",
              backdropFilter: "blur(8px)",
              color: "#93c5fd",
              border: "1px solid rgba(147,197,253,0.2)",
              cursor: isReadingText ? "wait" : "pointer",
            }}
          >
            <BookOpen className="h-3.5 w-3.5" />
            {isReadingText ? "Reading..." : "Read Text"}
          </button>
        </div>
      )}
    </div>
  );
}

export const GlassesViewer = React.memo(GlassesViewerInner);
