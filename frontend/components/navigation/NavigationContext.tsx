'use client';

import React, { createContext, useContext, useReducer, useCallback, useEffect, useRef } from 'react';
import type {
  NavigationState,
  NavigationStatus,
  Route,
  NavigationInstruction,
  DetectedObject,
  VoiceCommand,
  AIResponse,
  Coordinates,
  MapNode,
} from '@/types/navigation';
import { v4 as uuidv4 } from 'uuid';

// ================================
// State Types
// ================================

interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: Date;
}

interface NavigationContextState {
  // Session
  sessionId: string;
  isInitialized: boolean;
  
  // Navigation
  status: NavigationStatus;
  currentRoute: Route | null;
  currentStepIndex: number;
  currentPosition: Coordinates | null;
  destination: MapNode | null;
  
  // Voice
  isListening: boolean;
  isSpeaking: boolean;
  currentTranscript: string;
  lastUserMessage: string;
  
  // Vision
  detectedObjects: DetectedObject[];
  lastFrameTimestamp: Date | null;
  
  // AI
  lastAIResponse: AIResponse | null;
  pendingResponses: AIResponse[];
  
  // Conversation
  conversationHistory: ConversationMessage[];
  
  // UI State
  error: string | null;
  debugMode: boolean;
}

// ================================
// Actions
// ================================

type NavigationAction =
  | { type: 'INITIALIZE'; payload: { sessionId: string } }
  | { type: 'SET_STATUS'; payload: NavigationStatus }
  | { type: 'SET_ROUTE'; payload: Route | null }
  | { type: 'SET_STEP_INDEX'; payload: number }
  | { type: 'SET_POSITION'; payload: Coordinates }
  | { type: 'SET_DESTINATION'; payload: MapNode | null }
  | { type: 'SET_LISTENING'; payload: boolean }
  | { type: 'SET_SPEAKING'; payload: boolean }
  | { type: 'SET_TRANSCRIPT'; payload: string }
  | { type: 'SET_USER_MESSAGE'; payload: string }
  | { type: 'UPDATE_DETECTIONS'; payload: DetectedObject[] }
  | { type: 'SET_AI_RESPONSE'; payload: AIResponse }
  | { type: 'QUEUE_RESPONSE'; payload: AIResponse }
  | { type: 'DEQUEUE_RESPONSE' }
  | { type: 'ADD_CONVERSATION_MESSAGE'; payload: ConversationMessage }
  | { type: 'CLEAR_CONVERSATION' }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'TOGGLE_DEBUG' }
  | { type: 'RESET' };

// ================================
// Initial State
// ================================

const initialState: NavigationContextState = {
  sessionId: '',
  isInitialized: false,
  status: 'idle',
  currentRoute: null,
  currentStepIndex: 0,
  currentPosition: null,
  destination: null,
  isListening: false,
  isSpeaking: false,
  currentTranscript: '',
  lastUserMessage: '',
  detectedObjects: [],
  lastFrameTimestamp: null,
  lastAIResponse: null,
  pendingResponses: [],
  conversationHistory: [],
  error: null,
  debugMode: true, // Enable debug by default for testing
};

// ================================
// Reducer
// ================================

function navigationReducer(
  state: NavigationContextState,
  action: NavigationAction
): NavigationContextState {
  switch (action.type) {
    case 'INITIALIZE':
      return {
        ...state,
        sessionId: action.payload.sessionId,
        isInitialized: true,
      };

    case 'SET_STATUS':
      return { ...state, status: action.payload };

    case 'SET_ROUTE':
      return {
        ...state,
        currentRoute: action.payload,
        currentStepIndex: 0,
        status: action.payload ? 'navigating' : 'idle',
      };

    case 'SET_STEP_INDEX':
      return { ...state, currentStepIndex: action.payload };

    case 'SET_POSITION':
      return { ...state, currentPosition: action.payload };

    case 'SET_DESTINATION':
      return { ...state, destination: action.payload };

    case 'SET_LISTENING':
      return { ...state, isListening: action.payload };

    case 'SET_SPEAKING':
      return { ...state, isSpeaking: action.payload };

    case 'SET_TRANSCRIPT':
      return { ...state, currentTranscript: action.payload };

    case 'SET_USER_MESSAGE':
      return { ...state, lastUserMessage: action.payload, currentTranscript: '' };

    case 'UPDATE_DETECTIONS':
      return {
        ...state,
        detectedObjects: action.payload,
        lastFrameTimestamp: new Date(),
      };

    case 'SET_AI_RESPONSE':
      return { ...state, lastAIResponse: action.payload };

    case 'QUEUE_RESPONSE':
      return {
        ...state,
        pendingResponses: [...state.pendingResponses, action.payload],
      };

    case 'DEQUEUE_RESPONSE':
      return {
        ...state,
        pendingResponses: state.pendingResponses.slice(1),
      };

    case 'ADD_CONVERSATION_MESSAGE':
      return {
        ...state,
        conversationHistory: [...state.conversationHistory, action.payload].slice(-50),
      };

    case 'CLEAR_CONVERSATION':
      return { ...state, conversationHistory: [] };

    case 'SET_ERROR':
      return { ...state, error: action.payload };

    case 'TOGGLE_DEBUG':
      return { ...state, debugMode: !state.debugMode };

    case 'RESET':
      return { ...initialState, sessionId: state.sessionId };

    default:
      return state;
  }
}

// ================================
// Context
// ================================

interface NavigationContextValue {
  state: NavigationContextState;
  
  // Core actions
  initialize: () => void;
  reset: () => void;
  
  // Navigation
  setRoute: (route: Route | null) => void;
  nextStep: () => void;
  previousStep: () => void;
  setDestination: (node: MapNode | null) => void;
  setStatus: (status: NavigationStatus) => void;
  
  // Voice
  setListening: (listening: boolean) => void;
  setSpeaking: (speaking: boolean) => void;
  setTranscript: (transcript: string) => void;
  submitUserMessage: (message: string) => void;
  
  // Vision
  updateDetections: (detections: DetectedObject[]) => void;
  
  // AI
  addAIResponse: (response: AIResponse) => void;
  speakText: (text: string, priority?: AIResponse['priority']) => Promise<void>;
  
  // Conversation
  addMessage: (role: 'user' | 'assistant' | 'system', text: string) => void;
  
  // Utilities
  setError: (error: string | null) => void;
  toggleDebug: () => void;
}

const NavigationContext = createContext<NavigationContextValue | null>(null);

// ================================
// Provider
// ================================

export function NavigationProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(navigationReducer, initialState);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speechQueueRef = useRef<Array<{ text: string; priority: AIResponse['priority'] }>>([]);
  const isSpeakingRef = useRef(false);

  // Initialize on mount
  useEffect(() => {
    dispatch({ type: 'INITIALIZE', payload: { sessionId: uuidv4() } });
  }, []);

  // Process speech queue
  const processQueue = useCallback(async () => {
    if (isSpeakingRef.current || speechQueueRef.current.length === 0) {
      return;
    }

    const next = speechQueueRef.current.shift();
    if (!next) return;

    isSpeakingRef.current = true;
    dispatch({ type: 'SET_SPEAKING', payload: true });

    try {
      const response = await fetch('/api/speech/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: next.text, priority: next.priority }),
      });

      if (!response.ok) {
        throw new Error('Speech synthesis failed');
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);

      if (!audioRef.current) {
        audioRef.current = new Audio();
      }

      audioRef.current.src = audioUrl;
      
      await new Promise<void>((resolve, reject) => {
        if (!audioRef.current) {
          reject(new Error('No audio element'));
          return;
        }

        audioRef.current.onended = () => {
          URL.revokeObjectURL(audioUrl);
          resolve();
        };

        audioRef.current.onerror = () => {
          URL.revokeObjectURL(audioUrl);
          reject(new Error('Audio playback failed'));
        };

        audioRef.current.play().catch(reject);
      });

    } catch (error) {
      console.error('Speech error:', error);
    } finally {
      isSpeakingRef.current = false;
      dispatch({ type: 'SET_SPEAKING', payload: false });
      
      // Process next in queue
      if (speechQueueRef.current.length > 0) {
        processQueue();
      }
    }
  }, []);

  // Speak text
  const speakText = useCallback(async (text: string, priority: AIResponse['priority'] = 'normal') => {
    // Add to conversation
    dispatch({
      type: 'ADD_CONVERSATION_MESSAGE',
      payload: {
        id: uuidv4(),
        role: 'assistant',
        text,
        timestamp: new Date(),
      },
    });

    // Handle priority - urgent interrupts current speech
    if (priority === 'urgent') {
      // Clear queue and stop current speech
      speechQueueRef.current = [];
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      isSpeakingRef.current = false;
    }

    // Add to queue based on priority
    if (priority === 'high' || priority === 'urgent') {
      speechQueueRef.current.unshift({ text, priority });
    } else {
      speechQueueRef.current.push({ text, priority });
    }

    processQueue();
  }, [processQueue]);

  // Context value
  const value: NavigationContextValue = {
    state,

    initialize: useCallback(() => {
      dispatch({ type: 'INITIALIZE', payload: { sessionId: uuidv4() } });
    }, []),

    reset: useCallback(() => {
      dispatch({ type: 'RESET' });
    }, []),

    setRoute: useCallback((route: Route | null) => {
      dispatch({ type: 'SET_ROUTE', payload: route });
    }, []),

    nextStep: useCallback(() => {
      const newIndex = state.currentStepIndex + 1;
      if (state.currentRoute && newIndex < state.currentRoute.instructions.length) {
        dispatch({ type: 'SET_STEP_INDEX', payload: newIndex });
      }
    }, [state.currentStepIndex, state.currentRoute]),

    previousStep: useCallback(() => {
      if (state.currentStepIndex > 0) {
        dispatch({ type: 'SET_STEP_INDEX', payload: state.currentStepIndex - 1 });
      }
    }, [state.currentStepIndex]),

    setDestination: useCallback((node: MapNode | null) => {
      dispatch({ type: 'SET_DESTINATION', payload: node });
    }, []),

    setStatus: useCallback((status: NavigationStatus) => {
      dispatch({ type: 'SET_STATUS', payload: status });
    }, []),

    setListening: useCallback((listening: boolean) => {
      dispatch({ type: 'SET_LISTENING', payload: listening });
    }, []),

    setSpeaking: useCallback((speaking: boolean) => {
      dispatch({ type: 'SET_SPEAKING', payload: speaking });
    }, []),

    setTranscript: useCallback((transcript: string) => {
      dispatch({ type: 'SET_TRANSCRIPT', payload: transcript });
    }, []),

    submitUserMessage: useCallback((message: string) => {
      dispatch({ type: 'SET_USER_MESSAGE', payload: message });
      dispatch({
        type: 'ADD_CONVERSATION_MESSAGE',
        payload: {
          id: uuidv4(),
          role: 'user',
          text: message,
          timestamp: new Date(),
        },
      });
    }, []),

    updateDetections: useCallback((detections: DetectedObject[]) => {
      dispatch({ type: 'UPDATE_DETECTIONS', payload: detections });
    }, []),

    addAIResponse: useCallback((response: AIResponse) => {
      dispatch({ type: 'SET_AI_RESPONSE', payload: response });
      if (response.interruptCurrent) {
        dispatch({ type: 'QUEUE_RESPONSE', payload: response });
      }
    }, []),

    speakText,

    addMessage: useCallback((role: 'user' | 'assistant' | 'system', text: string) => {
      dispatch({
        type: 'ADD_CONVERSATION_MESSAGE',
        payload: {
          id: uuidv4(),
          role,
          text,
          timestamp: new Date(),
        },
      });
    }, []),

    setError: useCallback((error: string | null) => {
      dispatch({ type: 'SET_ERROR', payload: error });
    }, []),

    toggleDebug: useCallback(() => {
      dispatch({ type: 'TOGGLE_DEBUG' });
    }, []),
  };

  return (
    <NavigationContext.Provider value={value}>
      {children}
    </NavigationContext.Provider>
  );
}

// ================================
// Hook
// ================================

export function useNavigationContext(): NavigationContextValue {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigationContext must be used within NavigationProvider');
  }
  return context;
}

export default NavigationProvider;
