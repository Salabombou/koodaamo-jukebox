import { memo, useEffect, useRef, useState } from "react";
import { FaVolumeMute, FaVolumeUp } from "react-icons/fa";

interface VolumeSliderProps {
  volume: number;
  onVolumeChange: (volume: number) => void;
  className?: string;
}

function VolumeSlider({ volume, onVolumeChange, className = "" }: VolumeSliderProps) {
  const volumeSlider = useRef<HTMLInputElement>(null);
  const volumeRef = useRef(1);
  const [isDraggingVolume, setIsDraggingVolume] = useState(false);

  useEffect(() => {
    onVolumeChange(Number(localStorage.getItem("volume") ?? 0.01));
  }, [onVolumeChange]);

  return (
    <div className={`flex z-1 items-center justify-center ${className}`}>
      <div className="-ml-4 -mr-2 -my-4">
        <button
          className="btn btn-xl btn-ghost btn-square rounded-none border-0 focus:outline-none focus:ring-0 focus:border-0 bg-transparent"
          children={volume === 0 ? <FaVolumeMute /> : <FaVolumeUp />}
          onClick={() => {
            if (volume === 0 && volumeRef.current === 0) {
              volumeRef.current = 0.5;
              onVolumeChange(0.5);
            } else if (volume === 0) {
              onVolumeChange(volumeRef.current);
            } else {
              volumeRef.current = volume;
              onVolumeChange(0);
            }
          }}
        />
      </div>
      <div className="w-full mb-1">
        <input
          ref={volumeSlider}
          type="range"
          min={0}
          max={1}
          step={0.01}
          className={`range range-sm w-full focus:outline-none focus:ring-0 focus:border-0${isDraggingVolume ? " ring-2 ring-primary" : ""}`}
          value={volume}
          onChange={(e) => {
            const newVolume = e.target.valueAsNumber;
            volumeRef.current = newVolume;
            onVolumeChange(newVolume);
          }}
          onKeyDown={(e) => e.preventDefault()}
          onMouseDown={() => setIsDraggingVolume(true)}
          onMouseUp={() => setIsDraggingVolume(false)}
          onTouchStart={() => setIsDraggingVolume(true)}
          onTouchEnd={() => setIsDraggingVolume(false)}
        />
      </div>
    </div>
  );
}

export default memo(VolumeSlider);
