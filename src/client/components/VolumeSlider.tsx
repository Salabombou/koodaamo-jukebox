import React, { useEffect, useState } from 'react';

import { faVolumeDown, faVolumeMute, faVolumeUp } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

export default function VolumeSlider() {
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const storedVolume = parseFloat(localStorage.getItem('volume')!);
    if (!isNaN(storedVolume)) {
      setVolume(storedVolume);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('volume', volume.toString());
  }, [volume]);

  return (
    <div className="card flex-row justify-center items-center h-full w-full bg-base-200 p-2 space-x-1 rounded-xl">
      <button className="btn btn-circle btn-sm" onClick={() => setMuted((muted) => !muted)}>
        <FontAwesomeIcon
          icon={volume === 0 || muted ? faVolumeMute : volume < 0.5 ? faVolumeDown : faVolumeUp}
          size="lg"
        />
      </button>
      <input
        type="range"
        className="range range-sm pr-1"
        min={0}
        max={1}
        step={0.01}
        value={muted ? 0 : volume}
        onTouchStart={() => setMuted(false)}
        onMouseDown={() => setMuted(false)}
        onChange={(e) => setVolume(e.target.valueAsNumber)}
      />
    </div>
  );
}
