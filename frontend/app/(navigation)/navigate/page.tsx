'use client';

import { useState, useEffect, useCallback } from 'react';
import { useNavigationContext } from '@/components/navigation/NavigationContext';
import { VoiceListener } from '@/components/navigation/VoiceListener';
import { VoiceSpeaker } from '@/components/navigation/VoiceSpeaker';
import { CameraStream } from '@/components/navigation/CameraStream';
import { useNavigation } from '@/hooks/useNavigation';
import type { MapNode } from '@/types/navigation';

// Main Navigation Page - The "Cockpit" for voice-controlled navigation
export default function NavigationPage() {
  const { state, setListening, speakText, addMessage, toggleDebug } = useNavigationContext();
  const {
    isNavigating,
    currentRoute,
    currentInstruction,
    currentStepIndex,
    destination,
    availableDestinations,
    startNavigation,
    stopNavigation,
    nextInstruction,
    processVoiceCommand,
  } = useNavigation({
    onInstructionChange: (instruction) => {
      // Speak the instruction when it changes
      speakText(instruction.spokenText, instruction.priority === 'critical' ? 'urgent' : 'normal');
    },
    onRouteComplete: () => {
      speakText('You have arrived at your destination.', 'high');
    },
    onError: (error) => {
      speakText(`Navigation error: ${error}`, 'high');
    },
  });

  const [showDestinations, setShowDestinations] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize with a greeting
  useEffect(() => {
    if (state.isInitialized && !isInitialized) {
      setIsInitialized(true);
      // Delay greeting to ensure audio context is ready
      setTimeout(() => {
        speakText('Welcome to the Indoor Navigation Assistant. Say "help" for available commands, or tell me where you would like to go.', 'normal');
      }, 1000);
    }
  }, [state.isInitialized, isInitialized, speakText]);

  // Handle voice commands
  const handleVoiceResult = useCallback(
    async (text: string, isFinal: boolean) => {
      if (!isFinal || !text.trim()) return;

      // Process the command
      const result = await processVoiceCommand(text);

      // Execute any action
      if (result.action) {
        result.action();
      }

      // Speak the response
      speakText(result.response, 'normal');
    },
    [processVoiceCommand, speakText]
  );

  // Start listening button handler
  const handleStartListening = () => {
    setListening(true);
  };

  // Stop listening handler
  const handleStopListening = () => {
    setListening(false);
  };

  // Select destination handler
  const handleSelectDestination = async (dest: MapNode) => {
    setShowDestinations(false);
    try {
      await startNavigation(dest.id);
      speakText(`Starting navigation to ${dest.name}. ${currentInstruction?.spokenText || ''}`, 'normal');
    } catch {
      speakText('Sorry, I could not start navigation to that location.', 'high');
    }
  };

  // Quick actions
  const quickActions = [
    {
      label: 'Start Listening',
      icon: '🎤',
      action: handleStartListening,
      active: state.isListening,
      activeLabel: 'Listening...',
    },
    {
      label: 'Show Destinations',
      icon: '📍',
      action: () => setShowDestinations(!showDestinations),
      active: showDestinations,
    },
    {
      label: 'Camera',
      icon: '📷',
      action: () => setShowCamera(!showCamera),
      active: showCamera,
    },
    {
      label: 'Debug',
      icon: '🐛',
      action: toggleDebug,
      active: state.debugMode,
    },
  ];

  return (
    <main className="h-screen w-screen bg-gradient-to-b from-gray-900 to-black text-white flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between p-4 bg-black/50 backdrop-blur-sm border-b border-gray-800">
        <div>
          <h1 className="text-xl font-bold">Navigation Assistant</h1>
          <p className="text-sm text-gray-400">
            {isNavigating && destination
              ? `Navigating to ${destination.name}`
              : 'Ready to assist'}
          </p>
        </div>
        
        {isNavigating && (
          <button
            onClick={stopNavigation}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg text-sm font-medium transition"
            aria-label="Stop navigation"
          >
            Stop Navigation
          </button>
        )}
      </header>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Panel - Navigation Info */}
        <div className="flex-1 p-4 overflow-auto">
          {/* Current Instruction */}
          {isNavigating && currentInstruction ? (
            <div className="bg-gray-800/50 rounded-2xl p-6 mb-4 border border-gray-700">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-2xl">
                  {getActionIcon(currentInstruction.action)}
                </div>
                <div>
                  <p className="text-sm text-gray-400">
                    Step {currentStepIndex + 1} of {currentRoute?.instructions.length}
                  </p>
                  <p className="font-medium">{currentInstruction.action.replace(/_/g, ' ')}</p>
                </div>
              </div>
              
              <p className="text-2xl font-medium leading-relaxed">
                {currentInstruction.spokenText}
              </p>

              {currentInstruction.distance && (
                <p className="text-gray-400 mt-2">
                  Distance: ~{currentInstruction.distance}m
                </p>
              )}

              <div className="flex gap-2 mt-6">
                <button
                  onClick={() => speakText(currentInstruction.spokenText)}
                  className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg transition"
                >
                  🔄 Repeat
                </button>
                <button
                  onClick={nextInstruction}
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg transition"
                  disabled={currentStepIndex >= (currentRoute?.instructions.length ?? 0) - 1}
                >
                  Next ➡️
                </button>
              </div>
            </div>
          ) : (
            /* Welcome / Idle State */
            <div className="bg-gray-800/50 rounded-2xl p-6 mb-4 border border-gray-700 text-center">
              <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 mx-auto mb-4 flex items-center justify-center text-4xl">
                🧭
              </div>
              <h2 className="text-2xl font-bold mb-2">Ready to Navigate</h2>
              <p className="text-gray-400 mb-4">
                Click "Start Listening" and tell me where you want to go, or select a destination below.
              </p>
              <p className="text-sm text-gray-500">
                Try saying: "Take me to room 0806" or "Where is the nearest restroom?"
              </p>
            </div>
          )}

          {/* Conversation History */}
          {state.debugMode && state.conversationHistory.length > 0 && (
            <div className="bg-gray-800/50 rounded-2xl p-4 border border-gray-700 max-h-64 overflow-auto">
              <h3 className="text-sm font-medium text-gray-400 mb-3">Conversation</h3>
              <div className="space-y-2">
                {state.conversationHistory.slice(-10).map((msg) => (
                  <div
                    key={msg.id}
                    className={`p-2 rounded-lg text-sm ${
                      msg.role === 'user'
                        ? 'bg-blue-900/50 ml-8'
                        : msg.role === 'assistant'
                        ? 'bg-gray-700/50 mr-8'
                        : 'bg-yellow-900/50 text-center text-xs'
                    }`}
                  >
                    <span className="text-gray-400 text-xs">
                      {msg.role === 'user' ? 'You: ' : msg.role === 'assistant' ? 'Assistant: ' : ''}
                    </span>
                    {msg.text}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Detected Objects (Debug) */}
          {state.debugMode && state.detectedObjects.length > 0 && (
            <div className="bg-gray-800/50 rounded-2xl p-4 border border-gray-700 mt-4">
              <h3 className="text-sm font-medium text-gray-400 mb-3">Detected Objects</h3>
              <div className="flex flex-wrap gap-2">
                {state.detectedObjects.map((obj) => (
                  <div
                    key={obj.id}
                    className={`px-3 py-1 rounded-full text-sm ${
                      obj.isHazard
                        ? 'bg-red-900/50 text-red-300 border border-red-700'
                        : 'bg-gray-700/50 text-gray-300 border border-gray-600'
                    }`}
                  >
                    {obj.label} ({Math.round(obj.confidence * 100)}%)
                    {obj.depth && ` - ${obj.depth.toFixed(1)}m`}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Panel - Camera (when active) */}
        {showCamera && (
          <div className="w-full lg:w-96 h-64 lg:h-auto border-t lg:border-t-0 lg:border-l border-gray-800">
            <CameraStream showPreview={true} frameRate={1} />
          </div>
        )}
      </div>

      {/* Destination Picker Modal */}
      {showDestinations && (
        <div className="fixed inset-0 bg-black/80 flex items-end lg:items-center justify-center z-50">
          <div className="bg-gray-900 w-full max-w-lg max-h-[70vh] rounded-t-3xl lg:rounded-3xl overflow-hidden">
            <div className="p-4 border-b border-gray-800 flex items-center justify-between">
              <h2 className="text-lg font-bold">Select Destination</h2>
              <button
                onClick={() => setShowDestinations(false)}
                className="p-2 hover:bg-gray-800 rounded-lg transition"
              >
                ✕
              </button>
            </div>
            <div className="p-4 overflow-auto max-h-96">
              <div className="space-y-2">
                {availableDestinations.map((dest) => (
                  <button
                    key={dest.id}
                    onClick={() => handleSelectDestination(dest)}
                    className="w-full p-4 bg-gray-800 hover:bg-gray-700 rounded-xl text-left transition flex items-center gap-3"
                  >
                    <span className="text-2xl">{getNodeIcon(dest.type)}</span>
                    <div>
                      <p className="font-medium">{dest.name}</p>
                      {dest.metadata?.roomNumber && (
                        <p className="text-sm text-gray-400">Room {dest.metadata.roomNumber}</p>
                      )}
                      {dest.metadata?.description && (
                        <p className="text-sm text-gray-500">{dest.metadata.description}</p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions Bar */}
      <div className="p-4 bg-black/50 backdrop-blur-sm border-t border-gray-800">
        <div className="flex gap-2 justify-center max-w-lg mx-auto">
          {quickActions.map((action) => (
            <button
              key={action.label}
              onClick={action.action}
              className={`flex-1 py-3 px-4 rounded-xl transition flex flex-col items-center gap-1 ${
                action.active
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
              }`}
              aria-pressed={action.active}
            >
              <span className="text-xl">{action.icon}</span>
              <span className="text-xs">
                {action.active && action.activeLabel ? action.activeLabel : action.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Voice Components */}
      <VoiceListener 
        onTranscript={handleVoiceResult}
        autoStart={false}
      />
      <VoiceSpeaker />
    </main>
  );
}

// Helper function to get icons for navigation actions
function getActionIcon(action: string): string {
  const icons: Record<string, string> = {
    start: '🚀',
    walk_forward: '⬆️',
    turn_left: '⬅️',
    turn_right: '➡️',
    turn_around: '🔄',
    slight_left: '↖️',
    slight_right: '↗️',
    go_straight: '⬆️',
    take_elevator: '🛗',
    take_stairs_up: '🔼',
    take_stairs_down: '🔽',
    enter_door: '🚪',
    exit_door: '🚪',
    arrive: '🎯',
    caution: '⚠️',
  };
  return icons[action] || '📍';
}

// Helper function to get icons for node types
function getNodeIcon(type: string): string {
  const icons: Record<string, string> = {
    room: '🚪',
    door: '🚪',
    intersection: '➕',
    hallway: '🛤️',
    elevator: '🛗',
    stairs: '🪜',
    entrance: '🚶',
    exit: '🚪',
    restroom: '🚻',
    emergency_exit: '🚨',
  };
  return icons[type] || '📍';
}
