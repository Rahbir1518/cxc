"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Navigation, MapPin } from "lucide-react";

interface PathNode {
  x: number;
  y: number;
  label?: string;
}

interface FloorPlanMapProps {
  floorPlanUrl: string;
  path?: PathNode[];
  currentPosition?: { x: number; y: number };
  destination?: string;
  className?: string;
  /** Enable simulated live position tracking along the path */
  simulateLiveTracking?: boolean;
  /** Walking speed multiplier (default 1.0) */
  walkSpeed?: number;
  /** Callback when simulated position reaches destination */
  onArrived?: () => void;
}

export function FloorPlanMap({
  floorPlanUrl,
  path = [],
  currentPosition: externalPosition,
  destination,
  className = "",
  simulateLiveTracking = false,
  walkSpeed = 1.0,
  onArrived,
}: FloorPlanMapProps) {
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const [viewBox, setViewBox] = useState("0 0 1224 792");
  const [isLoaded, setIsLoaded] = useState(false);

  // Live tracking state
  const [livePosition, setLivePosition] = useState<{ x: number; y: number } | null>(null);
  const [targetWaypointIdx, setTargetWaypointIdx] = useState(1);
  const [progressPct, setProgressPct] = useState(0);
  const animRef = useRef<number | null>(null);
  const posRef = useRef<{ x: number; y: number } | null>(null);
  const progressRef = useRef(0);
  const waypointIdxRef = useRef(1);
  const arrivedRef = useRef(false);

  // Determine which position to display
  const displayPosition = externalPosition || livePosition;

  // Get SVG viewBox from floor plan image
  useEffect(() => {
    if (floorPlanUrl.endsWith(".svg")) {
      fetch(floorPlanUrl)
        .then((res) => res.text())
        .then((svgText) => {
          const match = svgText.match(/viewBox="([^"]+)"/);
          if (match) setViewBox(match[1]);
          setIsLoaded(true);
        })
        .catch(() => setIsLoaded(true));
    } else {
      setIsLoaded(true);
    }
  }, [floorPlanUrl]);

  // ── Live position simulation ──
  useEffect(() => {
    if (!simulateLiveTracking || path.length < 2) {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      animRef.current = null;
      return;
    }

    // Reset tracking state
    posRef.current = { x: path[0].x, y: path[0].y };
    progressRef.current = 0;
    waypointIdxRef.current = 1;
    arrivedRef.current = false;
    setLivePosition({ x: path[0].x, y: path[0].y });
    setTargetWaypointIdx(1);
    setProgressPct(0);

    const getTotalLength = () => {
      let total = 0;
      for (let i = 1; i < path.length; i++) {
        const dx = path[i].x - path[i - 1].x;
        const dy = path[i].y - path[i - 1].y;
        total += Math.sqrt(dx * dx + dy * dy);
      }
      return total;
    };

    const getTraversedLength = (wpIdx: number, segProgress: number) => {
      let total = 0;
      for (let i = 1; i < wpIdx; i++) {
        const dx = path[i].x - path[i - 1].x;
        const dy = path[i].y - path[i - 1].y;
        total += Math.sqrt(dx * dx + dy * dy);
      }
      if (wpIdx < path.length && wpIdx > 0) {
        const dx = path[wpIdx].x - path[wpIdx - 1].x;
        const dy = path[wpIdx].y - path[wpIdx - 1].y;
        total += Math.sqrt(dx * dx + dy * dy) * segProgress;
      }
      return total;
    };

    const totalLen = getTotalLength();

    function animate() {
      if (arrivedRef.current) return;

      const idx = waypointIdxRef.current;
      if (idx >= path.length) {
        // Arrived
        arrivedRef.current = true;
        posRef.current = { x: path[path.length - 1].x, y: path[path.length - 1].y };
        setLivePosition({ ...posRef.current });
        setProgressPct(100);
        onArrived?.();
        return;
      }

      const from = path[idx - 1];
      const to = path[idx];
      const segDx = to.x - from.x;
      const segDy = to.y - from.y;
      const segLen = Math.sqrt(segDx * segDx + segDy * segDy);
      const speed = Math.max(0.001, (150 * walkSpeed) / segLen) * 0.016;

      progressRef.current += speed;

      if (progressRef.current >= 1) {
        progressRef.current = 0;
        waypointIdxRef.current++;
        posRef.current = { x: to.x, y: to.y };
        setTargetWaypointIdx(waypointIdxRef.current);
      } else {
        posRef.current = {
          x: from.x + segDx * progressRef.current,
          y: from.y + segDy * progressRef.current,
        };
      }

      setLivePosition({ ...posRef.current! });

      // Update progress
      const traversed = getTraversedLength(waypointIdxRef.current, progressRef.current);
      setProgressPct(totalLen > 0 ? Math.min(100, (traversed / totalLen) * 100) : 0);

      animRef.current = requestAnimationFrame(animate);
    }

    animRef.current = requestAnimationFrame(animate);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      animRef.current = null;
    };
  }, [simulateLiveTracking, path, walkSpeed, onArrived]);

  // Determine the current waypoint index for rendering
  const activeWaypointIdx = simulateLiveTracking ? targetWaypointIdx : 0;

  // Generate SVG path for traversed portion (green)
  const traversedD = (() => {
    if (!displayPosition || !path.length || activeWaypointIdx <= 0) return "";
    const parts = [`M ${path[0].x},${path[0].y}`];
    for (let i = 1; i < Math.min(activeWaypointIdx, path.length); i++) {
      parts.push(`L ${path[i].x},${path[i].y}`);
    }
    parts.push(`L ${displayPosition.x},${displayPosition.y}`);
    return parts.join(" ");
  })();

  // Generate SVG path for remaining portion (blue dashed)
  const remainingD = (() => {
    if (!path.length || activeWaypointIdx >= path.length) return "";
    const startPt = displayPosition || path[0];
    const parts = [`M ${startPt.x},${startPt.y}`];
    for (let i = activeWaypointIdx; i < path.length; i++) {
      parts.push(`L ${path[i].x},${path[i].y}`);
    }
    return parts.join(" ");
  })();

  // Full path (used when no live tracking)
  const fullPathD =
    !simulateLiveTracking && path.length > 1
      ? `M ${path.map((p) => `${p.x},${p.y}`).join(" L ")}`
      : "";

  // Direction arrow angle
  const directionAngle = (() => {
    if (!displayPosition || activeWaypointIdx >= path.length) return null;
    const target = path[activeWaypointIdx];
    const dx = target.x - displayPosition.x;
    const dy = target.y - displayPosition.y;
    return (Math.atan2(dy, dx) * 180) / Math.PI;
  })();

  return (
    <div
      ref={svgContainerRef}
      className={`relative overflow-hidden rounded-xl border-2 border-emerald-500/50 bg-slate-900 ${className}`}
    >
      {/* Destination Header */}
      {destination && (
        <div className="absolute top-2 left-2 right-2 z-20 flex items-center gap-2 rounded-lg bg-black/80 px-3 py-2 text-sm text-emerald-400">
          <Navigation className="h-4 w-4" />
          <span>Navigating to: Room {destination}</span>
          {simulateLiveTracking && (
            <span className="ml-auto text-xs text-emerald-300/70">
              {progressPct.toFixed(0)}%
            </span>
          )}
        </div>
      )}

      {/* Floor Plan SVG */}
      <svg
        viewBox={viewBox}
        className="h-full w-full"
        style={{ background: "#1a1a2e" }}
      >
        {/* SVG Animation Definitions */}
        <defs>
          {/* Glow filter */}
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Pulse animation for position marker */}
          <radialGradient id="posGradient" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Floor plan as background image */}
        <image
          href={floorPlanUrl}
          x="0"
          y="0"
          width="100%"
          height="100%"
          preserveAspectRatio="xMidYMid meet"
        />

        {/* ── Route Path (no live tracking - show full path) ── */}
        {fullPathD && (
          <g id="navigationRoute">
            <path
              d={fullPathD}
              fill="none"
              stroke="#0066ff"
              strokeWidth="16"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.3"
              className="animate-pulse"
            />
            <path
              d={fullPathD}
              fill="none"
              stroke="#007bff"
              strokeWidth="10"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="20,10"
              className="animate-dash"
            />
          </g>
        )}

        {/* ── Traversed path (green solid) ── */}
        {traversedD && (
          <path
            d={traversedD}
            fill="none"
            stroke="#22c55e"
            strokeWidth="8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* ── Remaining path (blue dashed animated) ── */}
        {remainingD && (
          <g>
            <path
              d={remainingD}
              fill="none"
              stroke="#3b82f6"
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="16,8"
              opacity="0.4"
            />
            <path
              d={remainingD}
              fill="none"
              stroke="#3b82f6"
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="16,8"
              className="animate-dash"
            />
          </g>
        )}

        {/* Path waypoints */}
        {path.map((point, idx) => {
          const isStart = idx === 0;
          const isEnd = idx === path.length - 1;
          const isReached = simulateLiveTracking && idx < activeWaypointIdx;

          return (
            <g key={idx}>
              {(isStart || isEnd) ? (
                <>
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={isEnd ? 18 : 16}
                    fill={isStart ? "#22c55e" : "#ef4444"}
                    stroke="#fff"
                    strokeWidth="3"
                  />
                  <text
                    x={point.x}
                    y={point.y + 5}
                    textAnchor="middle"
                    fill="white"
                    fontSize="14"
                    fontWeight="bold"
                  >
                    {isStart ? "S" : "E"}
                  </text>
                </>
              ) : (
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={8}
                  fill={isReached ? "#22c55e" : "#3b82f6"}
                  stroke="rgba(255,255,255,0.6)"
                  strokeWidth="2"
                  opacity={isReached ? 0.7 : 1}
                />
              )}
            </g>
          );
        })}

        {/* ── Current Position Indicator (pulsing beacon) ── */}
        {displayPosition && (
          <g>
            {/* Outer pulse ring 1 */}
            <circle
              cx={displayPosition.x}
              cy={displayPosition.y}
              r="30"
              fill="none"
              stroke="#10b981"
              strokeWidth="2"
              opacity="0.3"
              className="animate-ping-slow"
            />
            {/* Outer pulse ring 2 */}
            <circle
              cx={displayPosition.x}
              cy={displayPosition.y}
              r="20"
              fill="#10b981"
              opacity="0.2"
              className="animate-pulse"
            />
            {/* Inner solid dot */}
            <circle
              cx={displayPosition.x}
              cy={displayPosition.y}
              r="12"
              fill="#10b981"
              stroke="#fff"
              strokeWidth="3"
              filter="url(#glow)"
            />
            {/* Direction arrow */}
            {directionAngle !== null && (
              <g
                transform={`translate(${displayPosition.x}, ${displayPosition.y}) rotate(${directionAngle})`}
              >
                <line
                  x1="16"
                  y1="0"
                  x2="38"
                  y2="0"
                  stroke="#4ecca3"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
                <polygon
                  points="40,0 32,-6 32,6"
                  fill="#4ecca3"
                />
              </g>
            )}
          </g>
        )}
      </svg>

      {/* Progress Bar (only with live tracking) */}
      {simulateLiveTracking && path.length > 0 && (
        <div className="absolute bottom-8 left-2 right-2 z-20 flex items-center gap-2 rounded-lg bg-black/70 px-3 py-1.5 text-xs text-white">
          <span>{progressPct.toFixed(0)}%</span>
          <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span>{progressPct >= 100 ? "Arrived!" : ""}</span>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-2 right-2 z-20 flex gap-3 rounded-lg bg-black/70 px-3 py-2 text-xs text-white">
        {displayPosition && (
          <div className="flex items-center gap-1">
            <div className="h-3 w-3 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.6)]" />
            <span>You</span>
          </div>
        )}
        <div className="flex items-center gap-1">
          <div className="h-3 w-3 rounded-full bg-green-500" />
          <span>Start</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-3 w-3 rounded-full bg-red-500" />
          <span>End</span>
        </div>
        {simulateLiveTracking && (
          <>
            <div className="flex items-center gap-1">
              <div className="h-1 w-4 rounded bg-green-500" />
              <span>Done</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="h-1 w-4 rounded bg-blue-500 opacity-60" />
              <span>Ahead</span>
            </div>
          </>
        )}
      </div>

      {/* Animation Styles */}
      <style jsx>{`
        @keyframes dash {
          to {
            stroke-dashoffset: -48;
          }
        }
        .animate-dash {
          animation: dash 1.2s linear infinite;
        }
        @keyframes ping-slow {
          0% {
            r: 16;
            opacity: 0.5;
          }
          100% {
            r: 40;
            opacity: 0;
          }
        }
        .animate-ping-slow {
          animation: ping-slow 2s cubic-bezier(0, 0, 0.2, 1) infinite;
        }
      `}</style>
    </div>
  );
}
