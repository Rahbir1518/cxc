"use client";

import { useEffect, useRef, useState } from "react";
import { Navigation, MapPin, User, AlertCircle } from "lucide-react";

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
}

export function FloorPlanMap({
  floorPlanUrl,
  path = [],
  currentPosition,
  destination,
  className = "",
}: FloorPlanMapProps) {
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const [viewBox, setViewBox] = useState("0 0 1224 792");
  const [isLoaded, setIsLoaded] = useState(false);

  // Get SVG viewBox from floor plan image
  useEffect(() => {
    // For SVG floor plans, we can try to parse the viewBox
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

  // Generate SVG path string for the route
  const pathD =
    path.length > 1
      ? `M ${path.map((p) => `${p.x},${p.y}`).join(" L ")}`
      : "";

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
        </div>
      )}

      {/* Floor Plan Image */}
      <svg
        viewBox={viewBox}
        className="h-full w-full"
        style={{ background: "#1a1a2e" }}
      >
        {/* Floor plan as background image */}
        <image
          href={floorPlanUrl}
          x="0"
          y="0"
          width="100%"
          height="100%"
          preserveAspectRatio="xMidYMid meet"
        />

        {/* Route Path */}
        {pathD && (
          <g id="navigationRoute">
            {/* Glow effect */}
            <path
              d={pathD}
              fill="none"
              stroke="#0066ff"
              strokeWidth="16"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.3"
              className="animate-pulse"
            />
            {/* Main path */}
            <path
              d={pathD}
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

        {/* Path waypoints */}
        {path.map((point, idx) => (
          <g key={idx}>
            {/* Waypoint circle */}
            <circle
              cx={point.x}
              cy={point.y}
              r={idx === 0 || idx === path.length - 1 ? 16 : 10}
              fill={
                idx === 0
                  ? "#22c55e"
                  : idx === path.length - 1
                    ? "#ef4444"
                    : "#3b82f6"
              }
              stroke="#fff"
              strokeWidth="3"
            />
            {/* Start/End icons */}
            {idx === 0 && (
              <text
                x={point.x}
                y={point.y + 5}
                textAnchor="middle"
                fill="white"
                fontSize="14"
                fontWeight="bold"
              >
                S
              </text>
            )}
            {idx === path.length - 1 && (
              <text
                x={point.x}
                y={point.y + 5}
                textAnchor="middle"
                fill="white"
                fontSize="14"
                fontWeight="bold"
              >
                E
              </text>
            )}
          </g>
        ))}

        {/* Current Position Indicator */}
        {currentPosition && (
          <g className="animate-pulse">
            <circle
              cx={currentPosition.x}
              cy={currentPosition.y}
              r="24"
              fill="#10b981"
              opacity="0.3"
            />
            <circle
              cx={currentPosition.x}
              cy={currentPosition.y}
              r="12"
              fill="#10b981"
              stroke="#fff"
              strokeWidth="3"
            />
          </g>
        )}
      </svg>

      {/* Legend */}
      <div className="absolute bottom-2 right-2 z-20 flex gap-3 rounded-lg bg-black/70 px-3 py-2 text-xs text-white">
        <div className="flex items-center gap-1">
          <div className="h-3 w-3 rounded-full bg-green-500" />
          <span>Start</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-3 w-3 rounded-full bg-red-500" />
          <span>End</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="h-3 w-8 rounded bg-blue-500" />
          <span>Route</span>
        </div>
      </div>

      {/* Animation Styles */}
      <style jsx>{`
        @keyframes dash {
          to {
            stroke-dashoffset: -60;
          }
        }
        .animate-dash {
          animation: dash 1s linear infinite;
        }
      `}</style>
    </div>
  );
}
