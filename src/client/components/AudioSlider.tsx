import React from 'react';

interface AudioSliderProps {
  value: number;
  duration: number;
  onChange: (value: number) => void;
}

export default function AudioSlider({ value, duration, onChange }: AudioSliderProps) {
  const ref = React.useRef<HTMLInputElement>(null);

  return (
    <input
      ref={ref}
      type="range"
      className="range range-xs"
      min={0}
      max={duration}
      step={1}
      value={value}
      onChange={(e) => onChange(e.target.valueAsNumber)}
    />
  );
}
