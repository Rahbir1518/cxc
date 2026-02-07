'use client';

import { useEffect, useCallback } from 'react';
import { useNavigationContext } from './NavigationContext';

interface HapticFeedbackProps {
  enabled?: boolean;
}

/**
 * Haptic Feedback Component
 * 
 * Provides tactile feedback for navigation events using the Vibration API.
 * Patterns are designed to convey different types of information:
 * - Short pulse: confirmation/acknowledgment
 * - Double pulse: turn direction
 * - Long vibration: warning/hazard
 * - Pattern: arrived at destination
 */

// Vibration patterns (in milliseconds)
const HAPTIC_PATTERNS = {
  // Single short pulse - acknowledgment
  confirm: [50],
  
  // Double pulse - turn notification
  turn: [100, 50, 100],
  
  // Triple pulse - important waypoint
  waypoint: [75, 50, 75, 50, 75],
  
  // Long vibration - warning
  warning: [300],
  
  // Urgent pattern - danger/obstacle
  danger: [100, 50, 100, 50, 100, 50, 300],
  
  // Success pattern - arrived
  success: [50, 100, 50, 100, 200],
  
  // Soft nudge - gentle reminder
  nudge: [30],
};

type HapticPattern = keyof typeof HAPTIC_PATTERNS;

/**
 * Trigger haptic feedback
 */
export function triggerHaptic(pattern: HapticPattern): boolean {
  if (typeof navigator === 'undefined' || !navigator.vibrate) {
    return false;
  }

  const vibrationPattern = HAPTIC_PATTERNS[pattern];
  if (!vibrationPattern) {
    return false;
  }

  try {
    navigator.vibrate(vibrationPattern);
    return true;
  } catch {
    return false;
  }
}

/**
 * Stop any ongoing haptic feedback
 */
export function stopHaptic(): void {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    navigator.vibrate(0);
  }
}

/**
 * Check if haptic feedback is supported
 */
export function isHapticSupported(): boolean {
  return typeof navigator !== 'undefined' && 'vibrate' in navigator;
}

export function HapticFeedback({ enabled = true }: HapticFeedbackProps) {
  const { state } = useNavigationContext();

  // Respond to hazard detections with haptic warning
  useEffect(() => {
    if (!enabled) return;

    const hasHazard = state.detectedObjects.some((obj) => obj.isHazard);
    if (hasHazard) {
      triggerHaptic('warning');
    }
  }, [enabled, state.detectedObjects]);

  // Could add more haptic responses based on navigation events
  // For example, vibrate on turn instructions, arrival, etc.

  return null; // This is a non-visual component
}

/**
 * Hook for haptic feedback control
 */
export function useHapticFeedback() {
  const isSupported = isHapticSupported();

  const vibrate = useCallback((pattern: HapticPattern) => {
    if (!isSupported) return false;
    return triggerHaptic(pattern);
  }, [isSupported]);

  const stop = useCallback(() => {
    stopHaptic();
  }, []);

  return {
    isSupported,
    vibrate,
    stop,
    patterns: Object.keys(HAPTIC_PATTERNS) as HapticPattern[],
  };
}

export default HapticFeedback;
