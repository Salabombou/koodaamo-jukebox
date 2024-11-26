import { faVolumeMute, faVolumeDown, faVolumeUp } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import React, { useEffect, useState } from 'react';

export default function VolumeSlider(
) {
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
    <div className='card flex-row justify-center items-center w-[600px] rotate-[270deg] bg-base-200 p-2 space-x-2 -mx-64 rounded-full '>
      <button className='btn btn-circle btn-sm'
        onClick={() => setMuted((muted) => !muted)}
      >
      <FontAwesomeIcon icon={
        volume === 0 || muted ? faVolumeMute : volume < 0.5 ? faVolumeDown : faVolumeUp
      } className='rotate-90' />
      </button>
      <input type='range' className='range pr-1'
        min={0} max={1} step={0.01}
        value={muted ? 0 : volume}
        onTouchStart={() => setMuted(false)}
        onMouseDown={() => setMuted(false)}
        onChange={(e) => setVolume(e.target.valueAsNumber)}
      />
    </div>
  );
}
