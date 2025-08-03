import { useState, useRef, useEffect } from "react";
import { FaChevronUp, FaChevronDown, FaPlay, FaPause, FaBars, FaLocationArrow } from "react-icons/fa";
import Queue from "./Queue";
import { FixedSizeList } from "react-window";
import { Track } from "../types/track";
import { QueueItem } from "../types/queue";
import MarqueeText from "./MarqueeText";
import { useDiscordSDK } from "../hooks/useDiscordSdk";
import { useThumbnail } from "../hooks/useThumbnail";
import { useCallback } from "react";

interface QueueMobileProps {
  visible: boolean;
  tracks: Map<string, Track>;
  queueList: QueueItem[];
  currentTrack: (Track & { itemId: number }) | null;
  currentTrackIndex: number | null;
  paused: boolean;
  timestamp: number;
  duration: number;
  controlsDisabled?: boolean;
  onDropdownAction: (action: "close" | "open") => void;
  onPlayToggle: () => void;
  onMove: (fromIndex: number, toIndex: number) => void;
  onSkip: (index: number) => void;
  onDelete: (index: number) => void;
  onPlayNext: (index: number) => void;
}

export default function QueueMobile({ visible, tracks, queueList, currentTrack, currentTrackIndex, paused, duration, timestamp, controlsDisabled, onDropdownAction, onPlayToggle, onMove, onSkip, onDelete, onPlayNext }: QueueMobileProps) {
  const listRef = useRef<FixedSizeList>(null);
  const outerRef = useRef<HTMLDivElement>(null);

  const [startIndex, setStartIndex] = useState(0);
  const [stopIndex, setStopIndex] = useState(0);
  
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  
  const [showScrollToCurrentButton, setShowScrollToCurrentButton] = useState(false);

  const discordSDK = useDiscordSDK();
  const { getThumbnail, removeThumbnail } = useThumbnail();
  const [imageBlobUrl, setImageBlobUrl] = useState<string | null>(null);

  useEffect(() => {}, [startIndex, stopIndex]);

  // Fetch thumbnail for current track
  useEffect(() => {
    let cancelled = false;
    async function fetchThumbnail() {
      if (!currentTrack?.id) {
        setImageBlobUrl(null);
        return;
      }
      const thumbnailUrl = `${discordSDK.isEmbedded ? "/.proxy" : ""}/api/track/${currentTrack.id}/thumbnail-high`;
      const objectUrl = await getThumbnail(thumbnailUrl);
      if (!cancelled) setImageBlobUrl(objectUrl);
    }
    fetchThumbnail();
    return () => {
      cancelled = true;
      removeThumbnail(currentTrack?.id ?? "");
    };
  }, [currentTrack?.id, discordSDK.isEmbedded, getThumbnail, removeThumbnail]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      
      // Don't close if clicking within the dropdown
      if (dropdownRef.current && dropdownRef.current.contains(target)) {
        return;
      }
      
      // Don't close if clicking within a context menu
      const contextMenu = (target as Element).closest('[data-custom-context-menu]');
      if (contextMenu) {
        return;
      }
      
      setIsOpen(false);
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Close dropdown when component becomes invisible due to screen resize (mobile to desktop)
  useEffect(() => {
    const handleResize = () => {
      // Check if we're now on desktop (768px+ based on Tailwind's md breakpoint)
      const isDesktop = window.matchMedia("(min-width: 768px)").matches;
      
      // If queue is open and we've switched to desktop view, close it
      if (isOpen && isDesktop) {
        setIsOpen(false);
        onDropdownAction("close");
      }
    };

    window.addEventListener("resize", handleResize);
    
    // Also check on mount in case component loads on desktop
    handleResize();

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [isOpen, onDropdownAction]);

  const queueLength = queueList.length;
  const currentTrackNumber = currentTrackIndex !== null ? currentTrackIndex + 1 : 0;

  // Function to scroll to current track
  const scrollToCurrentTrack = () => {
    if (listRef.current && currentTrackIndex !== null) {
      const itemHeight = 66; // Height of each queue item
      // Scroll to put current track at the top
      listRef.current.scrollTo(currentTrackIndex * itemHeight);
      setShowScrollToCurrentButton(false);
    }
  };

  const lastAction = useRef<number>(0);
  const handleScroll = useCallback(() => {
    setShowScrollToCurrentButton(true);
    lastAction.current = Date.now();
  }, []);

  const handleMove = useCallback((fromIndex: number, toIndex: number) => {
    lastAction.current = Date.now();
    onMove(fromIndex, toIndex);
  }, [onMove]);

  const handleSkip = useCallback((index: number) => {
    lastAction.current = Date.now();
    onSkip(index);
  }, [onSkip]);

  // Auto-scroll to current track when currentTrackIndex changes
  useEffect(() => {
    if (currentTrackIndex !== null && isOpen) {
      const currentTime = Date.now();
      const msSinceLastAction = currentTime - lastAction.current;
      if (msSinceLastAction > 1000) {
        scrollToCurrentTrack();
      }
    }
  }, [currentTrackIndex]);

  // Hide scroll button when current track becomes visible or after some time
  useEffect(() => {
    if (currentTrackIndex !== null) {
      const isCurrentTrackVisible = currentTrackIndex >= startIndex && currentTrackIndex <= stopIndex;
      if (isCurrentTrackVisible && showScrollToCurrentButton) {
        // Auto-hide the button after 3 seconds when current track is visible
        const timer = setTimeout(() => {
          setShowScrollToCurrentButton(false);
        }, 3000);
        return () => clearTimeout(timer);
      }
    }
  }, [startIndex, stopIndex, currentTrackIndex, showScrollToCurrentButton]);

  return (
    <div ref={dropdownRef} className={["md:hidden fixed bottom-0 left-0 right-0 z-50 transition-all duration-500 ease-in-out", isOpen ? "h-full" : "h-20", visible ? 'opacity-100' : 'opacity-0 pointer-events-none'].join(" ")}>
      {/* Full-screen queue overlay for mobile */}
      <div className={`absolute inset-0 bg-queue-dropdown-backdrop backdrop-blur-lg transition-all duration-500 ${isOpen ? "opacity-100 translate-y-0" : "opacity-0 translate-y-full pointer-events-none"}`}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-0 relative">
          {/* Progress bar background */}
          <div className="absolute inset-0 bg-transparent">
            <div 
              className="h-full bg-white/20"
              style={{ 
                width: duration > 0 ? `${Math.min((timestamp / duration) * 100, 100)}%` : '0%',
                transition: 'width 0.2s linear',
              }}
            />
          </div>
          <div className="flex items-center gap-3 flex-1 min-w-0 relative z-10">
            <div className="aspect-square h-16 w-16 flex flex-shrink-0 items-center justify-center overflow-hidden bg-black relative select-none">
              <img
                src={imageBlobUrl || "/black.jpg"}
                className="w-full h-full object-cover object-center bg-black select-none"
                alt={currentTrack?.title || "thumbnail"}
                draggable={false}
              />
            </div>
            <div className="flex flex-col min-w-0 flex-1">
              <MarqueeText>
                <h2 className="text-lg font-semibold text-white truncate">
                  {currentTrack?.title || "No track playing"}
                </h2>
              </MarqueeText>
              <MarqueeText>
                <p className="text-sm text-white/70 truncate">
                  {currentTrack?.uploader || "Unknown artist"}
                </p>
              </MarqueeText>
            </div>
          </div>
          <div className="flex items-center gap-2 ml-4 relative z-10">
            <button 
              onClick={onPlayToggle}
              disabled={controlsDisabled}
              className="p-2 text-white hover:bg-white/10 rounded-lg transition-colors disabled:opacity-50"
            >
              {paused ? <FaPlay className="text-lg" /> : <FaPause className="text-lg" />}
            </button>
          </div>
        </div>

        {/* Queue content */}
        <div className="flex-1 overflow-hidden relative" style={{ height: "calc(100vh - 120px)" }}>
          <Queue
            listRef={listRef}
            outerRef={outerRef}
            tracks={tracks}
            queueList={queueList}
            currentTrack={currentTrack}
            currentTrackIndex={currentTrackIndex}
            controlsDisabled={controlsDisabled}
            onItemsRendered={(visibleStartIndex, visibleStopIndex) => {
              setStartIndex(visibleStartIndex);
              setStopIndex(visibleStopIndex);
            }}
            onMove={handleMove}
            onSkip={handleSkip}
            onDelete={onDelete}
            onPlayNext={onPlayNext}
            onScroll={handleScroll}
          />
        </div>
        
        {/* Scroll to current track button - positioned above mobile toggle button */}
        {showScrollToCurrentButton && currentTrackIndex !== null && (
          <button
            onClick={scrollToCurrentTrack}
            className="absolute bottom-24 left-4 right-4 py-3 px-4 bg-queue-mobile-scroll-button hover:bg-queue-mobile-scroll-button-hover text-white rounded-lg shadow-lg transition-colors z-10 flex items-center justify-center gap-2"
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
          setIsOpen(!isOpen);
          onDropdownAction(isOpen ? "close" : "open");
        }}
        className="absolute bottom-0 left-0 right-0 h-20 bg-queue-dropdown backdrop-blur-md border-0 flex items-center justify-between px-6 text-white active:bg-white/10 transition-colors touch-manipulation"
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
