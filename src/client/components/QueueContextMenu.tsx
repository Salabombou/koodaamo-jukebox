import React from 'react';

import { faPlus } from '@fortawesome/free-solid-svg-icons';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

interface QueueAddTrackProps {
  coordinates: { x: number; y: number };
  onClose: () => void;
}

export default function QueueAddTrack({ coordinates, onClose }: QueueAddTrackProps) {  
  
  return (
    <div
      className="absolute z-50 bg-base-200 p-4 rounded-md"
      style={{
        top: coordinates.y,
        left: coordinates.x
      }}
    >
      <button
        onClick={onClose}
        className="absolute top-0 right-0 m-2 p-2 rounded-full bg-base-300 text-base-50"
      >
        X
      </button>
      <div className="flex flex-col items-center space-y-4">
        <FontAwesomeIcon icon={faPlus} size="4x" />
        <label className="text-xl font-bold">Add a track</label>
        <label className="text-sm">Click the plus button to add a track</label>
      </div>
    </div>
  );
}