import React from 'react';
import type { KillSwitchState } from './types';

interface StatusIndicatorProps {
  state: KillSwitchState;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const STATE_COLORS: Record<KillSwitchState, string> = {
  ARMED: '#22c55e',
  RUNNING: '#eab308',
  STOPPING: '#f97316',
  STOPPED: '#ef4444',
  LOCKED: '#ef4444',
};

const STATE_LABELS: Record<KillSwitchState, string> = {
  ARMED: 'ARMED',
  RUNNING: 'RUNNING',
  STOPPING: 'STOPPING',
  STOPPED: 'STOPPED',
  LOCKED: 'LOCKED',
};

const SIZE_CLASSES = {
  sm: { container: 'w-8 h-8', icon: 'w-4 h-4' },
  md: { container: 'w-16 h-16', icon: 'w-8 h-8' },
  lg: { container: 'w-32 h-32', icon: 'w-16 h-16' },
};

const StateIcon: React.FC<{ state: KillSwitchState; className: string }> = ({ state, className }) => {
  switch (state) {
    case 'ARMED':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      );
    case 'RUNNING':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'STOPPING':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case 'STOPPED':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
        </svg>
      );
    case 'LOCKED':
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
      );
  }
};

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  state,
  size = 'md',
  className = '',
}) => {
  const color = STATE_COLORS[state];
  const sizeClasses = SIZE_CLASSES[size];

  return (
    <div className={`relative ${className}`} aria-label={`Kill switch status: ${STATE_LABELS[state]}`}>
      <div
        className={`${sizeClasses.container} rounded-full flex items-center justify-center transition-colors duration-500`}
        style={{ backgroundColor: color }}
      >
        <StateIcon state={state} className={`${sizeClasses.icon} text-white`} />
      </div>
      <div
        className="absolute inset-0 rounded-full animate-ping opacity-75"
        style={{ backgroundColor: color }}
      />
    </div>
  );
};
