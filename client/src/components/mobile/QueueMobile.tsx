import { useEffect, useRef, useState } from "react";
import { useCallback } from "react";
import { FaBars, FaChevronDown, FaChevronUp, FaLocationArrow, FaPause, FaPlay } from "react-icons/fa";
import { FaRepeat } from "react-icons/fa6";
import { useListRef } from "react-window";

import { QUEUE_ITEM_HEIGHT_MOBILE } from "../../constants";
import { useDiscordSDK } from "../../hooks/useDiscordSDK";
import * as thumbnailService from "../../services/thumbnailService";
import type { QueueItem } from "../../types/queue";
import type { Track } from "../../types/track";
import MarqueeText from "../common/MarqueeText";
import QueueList from "../common/QueueList";

interface QueueMobileProps {
  tracks: Map<string, Track>;
  queueList: QueueItem[];
  currentTrack: Track | null;
  currentItemIndex: number | null;
  currentItemId: number | null;
  paused: boolean;
  timestamp: number;
  duration: number;
  loop?: boolean;
  controlsDisabled?: boolean;
  onDropdownAction: (action: "close" | "open") => void;
  onPlayToggle: () => void;
  onLoopToggle?: () => void;
  onMove: (fromIndex: number, toIndex: number) => void;
  onSkip: (index: number) => void;
  onDelete: (itemId: number) => void;
  onPlayNext: (index: number) => void;
}

export default function QueueMobile({
  tracks,
  queueList,
  currentTrack,
  currentItemIndex,
  currentItemId,
  paused,
  duration,
  timestamp,
  loop = false,
  controlsDisabled,
  onDropdownAction,
  onPlayToggle,
  onLoopToggle,
  onMove,
  onSkip,
  onDelete,
  onPlayNext,
}: QueueMobileProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const listRef = useListRef(null);

  const [showScrollToCurrentButton, setShowScrollToCurrentButton] = useState(false);

  const discordSDK = useDiscordSDK();
  // Replaced useThumbnail hook with direct service usage
  const [imageBlobUrl, setImageBlobUrl] = useState<string | null>(null);

  // Cleanup on unmount - use a separate ref to track mount status
  const isMountedRef = useRef(true);
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (isOpen) {
        onDropdownAction("close");
      }
    };
  }, [isOpen, onDropdownAction]);

  // Fetch thumbnail for current track
  useEffect(() => {
    let cancelled = false;
    const thumbnailUrl = currentTrack?.id ? `${discordSDK.isEmbedded ? "/.proxy" : ""}/api/track/${currentTrack.id}/thumbnail-high` : null;

    async function fetchThumbnail() {
      if (!currentTrack?.id) {
        setImageBlobUrl(null);
        return;
      }

      const objectUrl = await thumbnailService.getThumbnail(thumbnailUrl!);
      if (!cancelled) setImageBlobUrl(objectUrl);
    }

    if (currentTrack?.id) {
      fetchThumbnail();
    } else {
      setImageBlobUrl(null);
    }

    return () => {
      cancelled = true;
      if (thumbnailUrl) {
        thumbnailService.removeThumbnail(thumbnailUrl);
      }
    };
  }, [currentTrack?.id, discordSDK.isEmbedded]);

  const queueLength = queueList.length;
  const currentTrackNumber = currentItemIndex !== null ? currentItemIndex + 1 : 0;

  // Function to scroll to current track
  const scrollToCurrentTrack = useCallback(() => {
    if (!listRef || currentItemIndex === null) return;
    isScrollingToCurrentTrack.current = true;
    listRef.current?.scrollToRow({
      index: currentItemIndex,
      align: "start",
      behavior: "smooth",
    });
    setShowScrollToCurrentButton(false);
    setTimeout(() => {
      isScrollingToCurrentTrack.current = false;
    }, 100);
  }, [currentItemIndex, listRef]);

  const lastAction = useRef<number>(0);

  const lastScrollPosition = useRef<number>(0);
  const isScrollingToCurrentTrack = useRef<boolean>(false);

  const handleScroll = useCallback(
    (scrollOffset: number, userScrolled: boolean) => {
      const currentTrackPosition = currentItemIndex !== null ? currentItemIndex * QUEUE_ITEM_HEIGHT_MOBILE : 0;

      if (isScrollingToCurrentTrack.current) {
        lastScrollPosition.current = scrollOffset;
        return;
      }
      const showButton = (queueLength > 0 && isOpen && userScrolled) || scrollOffset !== currentTrackPosition;
      setShowScrollToCurrentButton(showButton);
      lastAction.current = Date.now();
      lastScrollPosition.current = scrollOffset;
    },
    [currentItemIndex, isOpen, queueLength],
  );

  const handleMove = useCallback(
    (fromIndex: number, toIndex: number) => {
      lastAction.current = Date.now();
      onMove(fromIndex, toIndex);
    },
    [onMove],
  );

  const handleSkip = useCallback(
    (index: number) => {
      lastAction.current = Date.now();
      onSkip(index);
    },
    [onSkip],
  );

  // Auto-scroll to current track when currentItemIndex changes
  useEffect(() => {
    if (currentItemIndex !== null) {
      const currentTime = Date.now();
      const msSinceLastAction = currentTime - lastAction.current;
      if (msSinceLastAction > 1000) {
        scrollToCurrentTrack();
      } else {
        const showButton = lastScrollPosition.current !== currentItemIndex * QUEUE_ITEM_HEIGHT_MOBILE;
        setShowScrollToCurrentButton(showButton);
      }
    }
  }, [currentItemIndex, scrollToCurrentTrack]);

  return (
    <div ref={dropdownRef} className={["fixed bottom-0 left-0 right-0 z-50 select-none transition-all duration-500 ease-in-out", isOpen ? "h-full" : "h-20"].join(" ")}>
      {/* Full-screen queue overlay for mobile */}
      <div
        className={`absolute inset-0 bg-queue-dropdown-backdrop backdrop-blur-lg transition-all duration-500 ${isOpen ? "opacity-100 translate-y-0" : "opacity-0 translate-y-full pointer-events-none"}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-0 relative p-4 pr-0 bg-black/10">
          {/* Progress bar background */}
          <div className="absolute inset-0 bg-transparent">
            <div
              className="h-full bg-white/20"
              style={{
                width: duration > 0 ? `${Math.min((timestamp / duration) * 100, 100)}%` : "0%",
                transition: "width 0.2s linear",
              }}
            />
          </div>
          <div className="flex items-center gap-3 flex-1 min-w-0 relative z-10">
            <div className="aspect-square h-14 w-14 flex flex-shrink-0 items-center justify-center overflow-hidden bg-black relative select-none">
              <img src={imageBlobUrl || "/black.jpg"} className="w-full h-full object-cover object-center bg-black select-none rounded-xs" alt={currentTrack?.title || "thumbnail"} draggable={false} />
            </div>
            <div className="flex flex-col min-w-0 flex-1 pl-1">
              <MarqueeText>
                <h2 className="text-lg font-semibold text-white truncate">{currentTrack?.title || "No track playing"}</h2>
              </MarqueeText>
              <MarqueeText>
                <p className="text-sm text-white/70 truncate">{currentTrack?.uploader || "Unknown artist"}</p>
              </MarqueeText>
            </div>
          </div>
          <div className="flex justify-end pr-4 z-10">
            <button
              onClick={onLoopToggle}
              disabled={controlsDisabled || !onLoopToggle}
              className={`p-2 rounded-lg transition-colors disabled:opacity-50 ${loop ? "text-white bg-white/20 hover:bg-white/30" : "text-white hover:bg-white/10"}`}
            >
              <FaRepeat className="text-lg" />
            </button>
            <button onClick={onPlayToggle} disabled={controlsDisabled} className="p-2 text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50">
              {paused ? <FaPlay className="text-lg" /> : <FaPause className="text-lg" />}
            </button>
          </div>
        </div>

        {/* Queue content */}
        <div className="flex-1 overflow-hidden relative" style={{ height: "calc(100vh - 168px)" }}>
          <QueueList
            type="mobile"
            listRef={listRef}
            tracks={tracks}
            queueList={queueList}
            currentItemId={currentItemId}
            currentItemIndex={currentItemIndex}
            controlsDisabled={controlsDisabled}
            onMove={handleMove}
            onSkip={handleSkip}
            onDelete={onDelete}
            onPlayNext={onPlayNext}
            onScroll={handleScroll}
          />
        </div>

        {/* Scroll to current track button - positioned above mobile toggle button */}
        {showScrollToCurrentButton && currentItemIndex !== null && (
          <button
            onClick={scrollToCurrentTrack}
            onTouchStart={(e) => {
              // Allow the touch to pass through for scrolling
              e.currentTarget.style.pointerEvents = "none";
              // Re-enable pointer events after a short delay to allow for taps
              setTimeout(() => {
                if (e.currentTarget) {
                  e.currentTarget.style.pointerEvents = "auto";
                }
              }, 100);
            }}
            onTouchEnd={(e) => {
              // Ensure pointer events are re-enabled
              e.currentTarget.style.pointerEvents = "auto";
            }}
            className="absolute bottom-21 left-20 right-20 py-3 px-4 bg-queue-mobile-scroll-button hover:bg-queue-mobile-scroll-button-hover text-white rounded-lg shadow-lg transition-colors z-10 flex items-center justify-center gap-2"
            title="Scroll to current track"
          >
            <FaLocationArrow className="text-sm" />
            <span className="text-sm font-medium">Go to Current Track</span>
          </button>
        )}
      </div>

      {/* Mobile toggle button - always visible at bottom */}
      <button
        onClick={() => {
          setIsOpen((prev) => {
            const newIsOpen = !prev;
            if (newIsOpen) {
              const showScrollToCurrentButton = currentItemIndex !== null && lastScrollPosition.current !== currentItemIndex * QUEUE_ITEM_HEIGHT_MOBILE;
              setShowScrollToCurrentButton(showScrollToCurrentButton);
              onDropdownAction("open");
            } else {
              setShowScrollToCurrentButton(false);
              onDropdownAction("close");
            }
            return newIsOpen;
          });
        }}
        className="absolute bottom-0 left-0 right-0 h-20 bg-queue-dropdown backdrop-blur-md border-0 flex items-center justify-between px-6 text-white transition-colors touch-manipulation select-none focus:outline-none focus:ring-0"
        style={{ WebkitTapHighlightColor: "transparent" }}
      >
        <div className="flex items-center gap-4">
          <FaBars className="text-lg" />
          <div className="flex flex-col items-start">
            <span className="text-xs font-medium opacity-80">
              Track {currentTrackNumber} of {queueLength}
            </span>
            <span className="text-sm font-medium">View Queue</span>
          </div>
        </div>
        <div className="flex items-center">{isOpen ? <FaChevronDown className="text-lg" /> : <FaChevronUp className="text-lg" />}</div>
      </button>
    </div>
  );
}
