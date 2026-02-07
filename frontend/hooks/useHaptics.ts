'use client';

import { useCallback, useState, useEffect } from 'react';

/**
 * Haptic feedback patterns (vibration durations in milliseconds)
 */
const HAPTIC_PATTERNS = {
  // Single short pulse - acknowledgment
  tap: [50],
  
  // Double pulse - notification
  doubleTap: [50, 50, 50],
  
  // Triple pulse - attention
  tripleTap: [50, 50, 50, 50, 50],
  
  // Long single - warning
  hold: [200],
  
  // Strong warning
  warning: [100, 50, 100, 50, 200],
  
  // Success pattern
  success: [50, 100, 50, 100, 100],
  
  // Error pattern
  error: [200, 100, 200],
  
  // Turn left (asymmetric pattern - short-short-long)
  turnLeft: [50, 50, 50, 50, 150],
  
  // Turn right (asymmetric pattern - long-short-short)
  turnRight: [150, 50, 50, 50, 50],
  
  // Arrival celebration
  arrived: [50, 50, 50, 50, 50, 50, 200],
  
  // Danger - urgent
  danger: [100, 30, 100, 30, 100, 30, 300],
} as const;

type HapticPattern = keyof typeof HAPTIC_PATTERNS;

interface UseHapticsReturn {
  isSupported: boolean;
  isEnabled: boolean;
  setEnabled: (enabled: boolean) => void;
  vibrate: (pattern: HapticPattern | number | number[]) => boolean;
  stop: () => void;
  patterns: readonly HapticPattern[];
}

/**
 * Hook for haptic feedback control
 * Uses the Vibration API for tactile feedback on mobile devices
 */
export function useHaptics(): UseHapticsReturn {
  const [isSupported, setIsSupported] = useState(false);
  const [isEnabled, setEnabled] = useState(true);

  // Check support on mount
  useEffect(() => {
    const supported = typeof navigator !== 'undefined' && 'vibrate' in navigator;
    setIsSupported(supported);
  }, []);

  // Vibrate with a pattern or duration
  const vibrate = useCallback(
    (pattern: HapticPattern | number | number[]): boolean => {
      if (!isSupported || !isEnabled) {
        return false;
      }

      try {
        // If it's a named pattern, look it up
        if (typeof pattern === 'string') {
          const vibrationPattern = HAPTIC_PATTERNS[pattern];
          if (!vibrationPattern) {
            console.warn(`Unknown haptic pattern: ${pattern}`);
            return false;
          }
          return navigator.vibrate([...vibrationPattern]);
        }

        // If it's a number, use as single duration
        if (typeof pattern === 'number') {
          return navigator.vibrate(pattern);
        }

        // If it's an array, use directly
        return navigator.vibrate(pattern);
      } catch (error) {
        console.error('Haptic feedback error:', error);
        return false;
      }
    },
    [isSupported, isEnabled]
  );

  // Stop any ongoing vibration
  const stop = useCallback(() => {
    if (isSupported) {
      try {
        navigator.vibrate(0);
      } catch {
        // Ignore errors
      }
    }
  }, [isSupported]);

  return {
    isSupported,
    isEnabled,
    setEnabled,
    vibrate,
    stop,
    patterns: Object.keys(HAPTIC_PATTERNS) as unknown as readonly HapticPattern[],
  };
}

export default useHaptics;
