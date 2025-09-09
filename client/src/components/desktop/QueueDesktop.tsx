import { useEffect, useRef, useState } from "react";
import { FaArrowDown, FaArrowUp } from "react-icons/fa";
import { useListRef } from "react-window";

import type { QueueItem } from "../../types/queue";
import type { Track } from "../../types/track";
import QueueList from "../common/QueueList";

interface QueueDesktopProps {
  tracks: Map<string, Track>;
  queueList: QueueItem[];
  currentItemId: number | null;
  currentItemIndex: number | null;
  controlsDisabled?: boolean;
  onMove: (fromIndex: number, toIndex: number) => void;
  onSkip: (index: number) => void;
  onDelete: (itemId: number) => void;
  onPlayNext: (index: number) => void;
}

export default function QueueDesktop({ tracks, queueList, currentItemId, currentItemIndex, controlsDisabled, onMove, onSkip, onDelete, onPlayNext }: QueueDesktopProps) {
  const listRef = useListRef(null);

  const [startIndex, setStartIndex] = useState(0);
  const [stopIndex, setStopIndex] = useState(0);

  const topArrowVisible = typeof currentItemIndex === "number" && currentItemIndex < startIndex && queueList.length > 0;
  const bottomArrowVisible = typeof currentItemIndex === "number" && currentItemIndex > stopIndex && queueList.length > 0;

  // Auto-scroll to current track when currentItemIndex changes
  useEffect(() => {
    if (currentItemIndex !== null) {
      const currentTime = Date.now();
      const msSinceLastAction = currentTime - lastAction.current;
      if (msSinceLastAction > 1000) {
        listRef.current?.scrollToRow({ index: currentItemIndex, align: "center", behavior: "smooth" });
      }
    }
  }, [currentItemIndex, listRef]);

  const lastAction = useRef<number>(0);
  const handleScroll = () => {
    lastAction.current = Date.now();
  };
  const handleDragEnd = () => {
    lastAction.current = Date.now();
  };

  return (
    <div className="relative w-full h-full flex m-0 ml-6 transition-opacity duration-300 ease-in-out">
      {/* Top arrow */}
      {topArrowVisible && (
        <div className="absolute top-2 right-2 z-10">
          <button
            onClick={() => listRef.current?.scrollToRow({ index: currentItemIndex, align: "center", behavior: "smooth" })}
            className="btn btn-square btn-ghost hover:bg-queue-arrow-button-hover text-3xl text-white"
            aria-label="Scroll to current track"
          >
            <FaArrowUp className="animate-bounce pt-2" />
          </button>
        </div>
      )}
      {/* Bottom arrow */}
      {bottomArrowVisible && (
        <div className="absolute bottom-2 right-2 z-10">
          <button
            onClick={() => listRef.current?.scrollToRow({ index: currentItemIndex, align: "center", behavior: "smooth" })}
            className="btn btn-square btn-ghost hover:bg-queue-arrow-button-hover text-3xl text-white"
            aria-label="Scroll to current track"
          >
            <FaArrowDown className="animate-bounce pt-2" />
          </button>
        </div>
      )}

      <QueueList
        type="desktop"
        listRef={listRef}
        tracks={tracks}
        queueList={queueList}
        currentItemId={currentItemId}
        currentItemIndex={currentItemIndex}
        controlsDisabled={controlsDisabled}
        onMove={onMove}
        onSkip={onSkip}
        onDelete={onDelete}
        onPlayNext={onPlayNext}
        onScroll={handleScroll}
        onDragEnd={handleDragEnd}
        onRowsRendered={(start, stop) => {
          setStartIndex(start);
          setStopIndex(stop);
        }}
      />
    </div>
  );
}
