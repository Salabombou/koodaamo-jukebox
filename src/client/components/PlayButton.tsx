import React, { useRef } from 'react';
import { FaPause, FaPlay } from 'react-icons/fa';

interface PlayButtonProps {
  onPlay: () => void;
  onPause: () => void;
}

export default function PlayButton({ onPlay, onPause }: PlayButtonProps) {
  const [play, setPlay] = React.useState(false);

  return (
    <button
      onClick={() => {
        setPlay((prev) => {
          if (prev) {
            onPause();
            return false;
          } else {
            onPlay();
            return true;
          }
        });
      }}
      className="btn btn-square btn-sm"
    >
      {play ? <FaPause /> : <FaPlay />}
    </button>
  );
}
