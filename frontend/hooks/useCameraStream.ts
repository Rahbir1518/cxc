'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

interface UseCameraStreamOptions {
  resolution?: 'low' | 'medium' | 'high';
  facingMode?: 'user' | 'environment';
  autoStart?: boolean;
}

interface UseCameraStreamReturn {
  isStreaming: boolean;
  hasPermission: boolean | null;
  error: string | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  stream: MediaStream | null;
  startStream: () => Promise<void>;
  stopStream: () => void;
  captureFrame: () => Blob | null;
}

const RESOLUTIONS = {
  low: { width: 320, height: 240 },
  medium: { width: 640, height: 480 },
  high: { width: 1280, height: 720 },
};

/**
 * Hook for camera stream access and management
 */
export function useCameraStream({
  resolution = 'medium',
  facingMode = 'environment',
  autoStart = false,
}: UseCameraStreamOptions = {}): UseCameraStreamReturn {
  const [isStreaming, setIsStreaming] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Start the camera stream
  const startStream = useCallback(async () => {
    try {
      setError(null);
      
      const { width, height } = RESOLUTIONS[resolution];

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: width },
          height: { ideal: height },
          facingMode,
        },
        audio: false,
      });

      streamRef.current = mediaStream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        await videoRef.current.play();
      }

      setIsStreaming(true);
      setHasPermission(true);

    } catch (err) {
      console.error('Camera stream error:', err);
      setHasPermission(false);
      
      if (err instanceof Error) {
        if (err.name === 'NotAllowedError') {
          setError('Camera access denied');
        } else if (err.name === 'NotFoundError') {
          setError('No camera found');
        } else if (err.name === 'NotReadableError') {
          setError('Camera is in use by another application');
        } else {
          setError(err.message);
        }
      } else {
        setError('Failed to access camera');
      }
    }
  }, [resolution, facingMode]);

  // Stop the camera stream
  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    
    setIsStreaming(false);
  }, []);

  // Capture current frame as blob
  const captureFrame = useCallback((): Blob | null => {
    if (!videoRef.current || !isStreaming) {
      return null;
    }

    const video = videoRef.current;
    
    // Create canvas if needed
    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
    }
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    if (!ctx || video.readyState < 2) {
      return null;
    }

    // Set canvas size to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw current frame
    ctx.drawImage(video, 0, 0);

    // Convert to blob synchronously is not possible, 
    // so we'll return a data URL converted to blob
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    const byteString = atob(dataUrl.split(',')[1]);
    const mimeType = dataUrl.split(',')[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    
    return new Blob([ab], { type: mimeType });
  }, [isStreaming]);

  // Auto-start if configured
  useEffect(() => {
    if (autoStart) {
      startStream();
    }

    return () => {
      stopStream();
    };
  }, [autoStart, startStream, stopStream]);

  return {
    isStreaming,
    hasPermission,
    error,
    videoRef,
    stream: streamRef.current,
    startStream,
    stopStream,
    captureFrame,
  };
}

export default useCameraStream;
