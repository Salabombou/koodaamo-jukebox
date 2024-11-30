import React from 'react';

import { faPlus } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

interface QueueAddTrackProps {
  setNodeRef: (node: HTMLElement | null) => void;
  style: React.CSSProperties;
}

export default function QueueAddTrack({ setNodeRef, style }: QueueAddTrackProps) {
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="h-[116px] w-full bg-neutral-400 flex flex-row items-center space-x-4"
    >
      <button className="btn btn-square bg-neutral-300 hover:bg-neutral-300 text-white hover:text-black border-none h-[100px] w-[100px] ml-[53px]">
        <FontAwesomeIcon icon={faPlus} size="4x" />
      </button>
      <div className="flex flex-col overflow-hidden text-neutral-600">
        <label className="text-xl font-bold truncate">Add a track</label>
        <label className="text-sm truncate">Click the plus button to add a track</label>
      </div>
    </div>
  );
}
