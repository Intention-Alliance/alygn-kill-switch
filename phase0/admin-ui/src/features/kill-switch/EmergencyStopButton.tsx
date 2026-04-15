import React, { useState, useCallback, useEffect } from 'react';
import type { KillSwitchState } from './types';
import { KILL_SWITCH_CONFIG } from './types';
import { activateChaos } from './api';

interface EmergencyStopButtonProps {
  currentState: KillSwitchState;
  userRole: string;
  onActivation?: () => void;
}

interface AudioFeedback {
  playBeep: () => void;
}

function useAudioFeedback(): AudioFeedback {
  const audioContextRef = React.useRef<AudioContext | null>(null);

  const playBeep = useCallback(() => {
    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;

      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContextClass();
      }

      const ctx = audioContextRef.current;
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.frequency.value = 800;
      oscillator.type = 'square';
      
      gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.3);
    } catch (error) {
      console.error('Audio feedback failed:', error);
    }
  }, []);

  return { playBeep };
}

export const EmergencyStopButton: React.FC<EmergencyStopButtonProps> = ({
  currentState,
  userRole,
  onActivation,
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [isActivating, setIsActivating] = useState(false);
  const [activationError, setActivationError] = useState<string | null>(null);
  const [showFlash, setShowFlash] = useState(false);
  
  const { playBeep } = useAudioFeedback();

  const canActivate = userRole === 'admin' || userRole === 'sre';
  const isVisible = currentState === 'ARMED' || currentState === 'RUNNING';
  const isConfirmEnabled = confirmText === KILL_SWITCH_CONFIG.confirmPhrase;

  useEffect(() => {
    if (isModalOpen) {
      setConfirmText('');
      setActivationError(null);
    }
  }, [isModalOpen]);

  const handleButtonClick = useCallback(() => {
    if (!canActivate) return;
    setIsModalOpen(true);
  }, [canActivate]);

  const handleConfirm = useCallback(async () => {
    if (!isConfirmEnabled || isActivating) return;

    setIsActivating(true);
    setActivationError(null);

    try {
      await activateChaos('Manual activation');
      
      // Visual and audio feedback
      playBeep();
      setShowFlash(true);
      setTimeout(() => setShowFlash(false), 500);

      setIsModalOpen(false);
      setConfirmText('');
      onActivation?.();
    } catch (error) {
      setActivationError(error instanceof Error ? error.message : 'Activation failed');
    } finally {
      setIsActivating(false);
    }
  }, [isConfirmEnabled, isActivating, playBeep, onActivation]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setConfirmText(e.target.value);
  }, []);

  if (!isVisible) {
    return null;
  }

  return (
    <>
      {/* Screen flash overlay */}
      {showFlash && (
        <div
          className="fixed inset-0 bg-red-600 opacity-50 z-50 pointer-events-none"
          aria-hidden="true"
        />
      )}

      {/* Emergency Stop Button */}
      <div className="relative">
        <button
          onClick={handleButtonClick}
          disabled={!canActivate}
          className={`
            px-8 py-4 text-lg font-bold rounded-lg uppercase tracking-wider
            transition-all duration-200
            ${canActivate
              ? 'bg-red-600 hover:bg-red-700 text-white cursor-pointer shadow-lg hover:shadow-xl'
              : 'bg-gray-400 text-gray-200 cursor-not-allowed'
            }
          `}
          aria-label="Emergency stop - activate kill switch"
        >
          🚨 Emergency Stop
        </button>

        {/* Tooltip for unauthorized users */}
        {!canActivate && (
          <div
            role="tooltip"
            className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 px-3 py-2 bg-gray-800 text-white text-sm rounded whitespace-nowrap z-10"
          >
            Only SRE/Admin can activate
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {isModalOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40"
          onClick={() => setIsModalOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
        >
          <div
            className="bg-white rounded-lg p-8 max-w-md w-full mx-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="modal-title" className="text-2xl font-bold text-red-600 mb-4">
              ⚠️ WARNING: Emergency Activation
            </h2>

            <div className="mb-6">
              <p className="text-gray-700 mb-3">
                This will immediately stop ALL experiments and chaos activities.
              </p>
              <p className="text-gray-700 mb-3">
                This action is irreversible and will affect all running experiments.
              </p>
              <p className="text-gray-900 font-semibold">
                Type <span className="text-red-600 font-mono bg-red-50 px-2 py-1 rounded">STOP ALL CHAOS</span> to confirm:
              </p>
            </div>

            <input
              type="text"
              value={confirmText}
              onChange={handleInputChange}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-red-500 focus:outline-none text-lg font-mono"
              placeholder="Type confirmation phrase..."
              autoFocus
              disabled={isActivating}
              aria-label="Confirmation phrase input"
            />

            {activationError && (
              <p className="text-red-600 mt-3 text-sm" role="alert">
                {activationError}
              </p>
            )}

            <div className="flex gap-4 mt-6">
              <button
                onClick={() => setIsModalOpen(false)}
                disabled={isActivating}
                className="flex-1 px-4 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={!isConfirmEnabled || isActivating}
                className={`
                  flex-1 px-4 py-3 rounded-lg font-bold transition-all
                  ${isConfirmEnabled && !isActivating
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }
                `}
              >
                {isActivating ? 'Activating...' : 'CONFIRM'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
