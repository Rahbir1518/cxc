'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigationContext } from './NavigationContext';
import type { DetectedObject } from '@/types/navigation';

interface CameraStreamProps {
  onFrame?: (imageData: Blob) => void;
  onDetections?: (detections: DetectedObject[]) => void;
  showPreview?: boolean;
  frameRate?: number;
  resolution?: 'low' | 'medium' | 'high';
}

const RESOLUTIONS = {
  low: { width: 320, height: 240 },
  medium: { width: 640, height: 480 },
  high: { width: 1280, height: 720 },
};

export function CameraStream({
  onFrame,
  onDetections,
  showPreview = false,
  frameRate = 2, // Low frame rate for processing
  resolution = 'medium',
}: CameraStreamProps) {
  const { state, updateDetections, setError } = useNavigationContext();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  
  const [isActive, setIsActive] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Start camera stream
  const startCamera = useCallback(async () => {
    try {
      const { width, height } = RESOLUTIONS[resolution];
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: width },
          height: { ideal: height },
          facingMode: 'environment', // Prefer back camera on mobile
        },
        audio: false,
      });

      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setIsActive(true);
      setHasPermission(true);
      
    } catch (error) {
      console.error('Camera error:', error);
      setHasPermission(false);
      
      if (error instanceof Error) {
        if (error.name === 'NotAllowedError') {
          setError('Camera access denied. Please enable camera permissions.');
        } else if (error.name === 'NotFoundError') {
          setError('No camera found on this device.');
        } else {
          setError(`Camera error: ${error.message}`);
        }
      }
    }
  }, [resolution, setError]);

  // Stop camera stream
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    
    setIsActive(false);
  }, []);

  // Capture frame and send for processing
  const captureFrame = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || isProcessing) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    if (!ctx || video.readyState < 2) return;

    // Set canvas size to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw current frame
    ctx.drawImage(video, 0, 0);

    // Convert to blob
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.8);
    });

    if (!blob) return;

    // Notify parent
    onFrame?.(blob);

    // Send to vision API for processing
    if (state.debugMode) {
      setIsProcessing(true);
      
      try {
        const formData = new FormData();
        formData.append('image', blob, 'frame.jpg');

        const response = await fetch('/api/vision/analyze', {
          method: 'POST',
          body: formData,
        });

        if (response.ok) {
          const result = await response.json();
          if (result.detections) {
            updateDetections(result.detections);
            onDetections?.(result.detections);
          }
        }
      } catch (error) {
        console.error('Vision processing error:', error);
      } finally {
        setIsProcessing(false);
      }
    }
  }, [isProcessing, onFrame, onDetections, state.debugMode, updateDetections]);

  // Start frame capture interval
  useEffect(() => {
    if (isActive && frameRate > 0) {
      const interval = 1000 / frameRate;
      intervalRef.current = setInterval(captureFrame, interval);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isActive, frameRate, captureFrame]);

  // Auto-start camera
  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  // Draw detection overlays
  const drawDetections = useCallback(() => {
    if (!canvasRef.current || !showPreview) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear previous overlays (redraw video frame)
    if (videoRef.current) {
      ctx.drawImage(videoRef.current, 0, 0);
    }

    // Draw bounding boxes
    for (const detection of state.detectedObjects) {
      const { boundingBox, label, confidence, isHazard } = detection;
      
      // Set colors based on hazard status
      ctx.strokeStyle = isHazard ? '#ff4444' : '#44ff44';
      ctx.lineWidth = 2;
      ctx.fillStyle = isHazard ? 'rgba(255, 68, 68, 0.2)' : 'rgba(68, 255, 68, 0.2)';

      // Draw box
      ctx.strokeRect(boundingBox.x, boundingBox.y, boundingBox.width, boundingBox.height);
      ctx.fillRect(boundingBox.x, boundingBox.y, boundingBox.width, boundingBox.height);

      // Draw label
      ctx.fillStyle = isHazard ? '#ff4444' : '#44ff44';
      ctx.font = '14px sans-serif';
      const text = `${label} (${Math.round(confidence * 100)}%)`;
      const textWidth = ctx.measureText(text).width;
      
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(boundingBox.x, boundingBox.y - 20, textWidth + 8, 20);
      
      ctx.fillStyle = isHazard ? '#ff4444' : '#44ff44';
      ctx.fillText(text, boundingBox.x + 4, boundingBox.y - 6);
    }
  }, [showPreview, state.detectedObjects]);

  // Update detection overlay when detections change
  useEffect(() => {
    if (showPreview && state.detectedObjects.length > 0) {
      drawDetections();
    }
  }, [showPreview, state.detectedObjects, drawDetections]);

  if (hasPermission === false) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-900 text-white p-4">
        <div className="text-center">
          <svg className="w-16 h-16 mx-auto mb-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          <p className="text-lg font-medium">Camera Access Required</p>
          <p className="text-sm text-gray-400 mt-2">Please enable camera permissions to use navigation features</p>
          <button
            onClick={startCamera}
            className="mt-4 px-4 py-2 bg-blue-600 rounded-lg hover:bg-blue-700 transition"
          >
            Enable Camera
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-black">
      {/* Hidden video element for camera feed */}
      <video
        ref={videoRef}
        className={showPreview ? 'hidden' : 'hidden'}
        playsInline
        muted
      />
      
      {/* Canvas for processing and preview */}
      <canvas
        ref={canvasRef}
        className={showPreview ? 'w-full h-full object-contain' : 'hidden'}
      />

      {/* Status indicator */}
      {isActive && (
        <div className="absolute top-4 right-4 flex items-center gap-2 px-3 py-1 rounded-full bg-black/50 text-white text-sm">
          <div className={`w-2 h-2 rounded-full ${isProcessing ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'}`} />
          {isProcessing ? 'Processing...' : 'Camera Active'}
        </div>
      )}

      {/* Detection count */}
      {state.debugMode && state.detectedObjects.length > 0 && (
        <div className="absolute top-4 left-4 px-3 py-1 rounded-full bg-black/50 text-white text-sm">
          {state.detectedObjects.length} objects detected
        </div>
      )}

      {/* Hazard warning */}
      {state.detectedObjects.some((d) => d.isHazard) && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg bg-red-600 text-white font-medium animate-pulse">
          ⚠️ Hazard Detected
        </div>
      )}
    </div>
  );
}

export default CameraStream;
