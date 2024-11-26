import React from 'react';

interface TimeDisplayProps {
  readonly duration: number;
  readonly currentTime: number;
}

export default function TimeDisplay({ duration, currentTime }: TimeDisplayProps) {
  return (
    <div className="flex font-monospace text-white select-none">
      {duration >= 3600 && (
        <>
          <span>
            {Math.floor(currentTime / 3600)
              .toString()
              .padStart(2, '0')}
          </span>
          <span>:</span>
        </>
      )}
      <span>
        {Math.floor((currentTime % 3600) / 60)
          .toString()
          .padStart(2, '0')}
      </span>
      <span>:</span>
      <span>
        {Math.floor(currentTime % 60)
          .toString()
          .padStart(2, '0')}
      </span>
      <span className="mx-1">/</span>
      {duration >= 3600 && (
        <>
          <span>
            {Math.floor(duration / 3600)
              .toString()
              .padStart(2, '0')}
          </span>
          <span>:</span>
        </>
      )}
      <span>
        {Math.floor((duration % 3600) / 60)
          .toString()
          .padStart(2, '0')}
      </span>
      <span>:</span>
      <span>
        {Math.floor(duration % 60)
          .toString()
          .padStart(2, '0')}
      </span>
    </div>
  );
}
