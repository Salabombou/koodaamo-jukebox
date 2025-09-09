import { useRef, useState } from "react";
import { FaGripLines, FaTrash } from "react-icons/fa";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { useDiscordSDK } from "../../hooks/useDiscordSDK";
import type { QueueItem } from "../../types/queue";
import type { QueueItemProps } from "../common/QueueList";

import ContextMenuMobile, { type ContextMenuMobileItem, type ContextMenuMobileRef } from "./ContextMenuMobile";

export default function QueueItemMobile({ index, style, data, currentItemId, tracks, onDelete, onSkip, onPlayNext, controlsDisabled = false, ariaAttributes }: QueueItemProps) {
  const discordSDK = useDiscordSDK();
  const item = data[index] as QueueItem | undefined;
  const contextMenuRef = useRef<ContextMenuMobileRef>(null);

  // --- Swipe state ---
  const [swipeX, setSwipeX] = useState(0);
  const [deletionInProgress, setDeletionInProgress] = useState(false);
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const [isHorizontal, setIsHorizontal] = useState(false);
  const threshold = 100;

  // --- Long-press progress (visual only) ---
  const [touchActive, setTouchActive] = useState(false);
  const touchTimeoutRef = useRef<number | null>(null);

  // Add state for managing swipe animation
  const [swipeAnimating, setSwipeAnimating] = useState(false);

  // Drag/reorder
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item?.id ?? `empty-${index}`,
    animateLayoutChanges: () => false,
  });

  const combinedTransform = {
    x: (transform?.x || 0) + swipeX,
    y: typeof transform?.y === "number" ? transform.y : 0,
    scaleX: typeof transform?.scaleX === "number" ? transform.scaleX : 1,
    scaleY: typeof transform?.scaleY === "number" ? transform.scaleY : 1,
  };

  const dndStyle = {
    transform: CSS.Transform.toString(combinedTransform),
    transition: swipeAnimating ? "transform 0.3s ease" : transition,
  };


  if (!item) return null;

  const track = tracks.get(item.track_id);
  if (!track) return null;

  const handleDelete = () => onDelete(item.id);
  const handlePlayNext = () => onPlayNext(index);
  const handleCopyUrl = () => {
    if (track?.webpage_url) navigator.clipboard.writeText(track.webpage_url);
  };

  const contextMenuItems: ContextMenuMobileItem[] = [
    { children: "Play Next", action: handlePlayNext },
    { children: "Copy URL", action: handleCopyUrl },
    {
      children: "Delete",
      action: handleDelete,
      className: "text-red-500 hover:text-red-700",
    },
  ];

  // --- Touch handlers with direction lock ---
  const onTouchStart = (e: React.TouchEvent) => {
    if (controlsDisabled || contextMenuRef.current?.isOpen) return;

    const t = e.touches[0];
    touchStartXRef.current = t.clientX;
    touchStartYRef.current = t.clientY;
    setSwipeAnimating(false);
    setIsHorizontal(false);

    // start long-press visual progress
    touchTimeoutRef.current = window.setTimeout(() => {
      setTouchActive(true);
    }, 100);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStartXRef.current == null || touchStartYRef.current == null) return;

    const t = e.touches[0];
    const deltaX = t.clientX - touchStartXRef.current;
    const deltaY = t.clientY - touchStartYRef.current;

    // decide direction once
    if (!isHorizontal) {
      const movedEnough = Math.max(Math.abs(deltaX), Math.abs(deltaY)) > 6;
      if (!movedEnough) return;

      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        // horizontal swipe confirmed
        setIsHorizontal(true);
        // cancel long-press visual once swiping horizontally
        if (touchTimeoutRef.current) {
          clearTimeout(touchTimeoutRef.current);
          touchTimeoutRef.current = null;
        }
        setTouchActive(false);
      } else {
        return;
      }
    }

    // horizontal swipe in progress
    setSwipeX(isDragging ? 0 : deltaX);
  };

  const onTouchEnd = () => {
    if (isHorizontal) {
      setSwipeAnimating(true);
      if (Math.abs(swipeX) >= threshold) {
        // Trigger delete animation: slide out
        const direction = swipeX > 0 ? 1 : -1;
        setDeletionInProgress(true);
        setSwipeX(direction * window.innerWidth); // move off-screen
      } else {
        // Not past threshold: animate back
        setSwipeX(0);
      }
      return;
    }

    touchStartXRef.current = null;
    touchStartYRef.current = null;
    setSwipeAnimating(false);
    setIsHorizontal(false);
    setTouchActive(false);
  };

  const swipeDeleteDanger = isHorizontal && Math.abs(swipeX) >= threshold;
  const thumbnailUrl = `${discordSDK.isEmbedded ? "/.proxy" : ""}/api/track/${item.track_id}/thumbnail-low`;
  const highlighted = currentItemId === item.id;

  return (
    <div
      style={{
        ...style,
        width: "100%",
        height: "64px",
      }}
    >
      <div
        ref={setNodeRef}
        style={{
          ...dndStyle,
          position: "relative",
        }}
        {...ariaAttributes}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        className={`${isDragging || !track ? "invisible" : ""} ${controlsDisabled ? "pointer-events-none" : ""} ${highlighted ? "bg-white/10" : ""}`}
        onTransitionEnd={() => {
          if (deletionInProgress) {
            handleDelete();
            setSwipeX(0);
            setDeletionInProgress(false);
          }
        }}
      >
      {/* Swipe right to reveal delete (shows on left side) */}
      <div
        className="absolute top-0 bottom-0 flex items-center"
        style={{
          left: `-${Math.abs(swipeX)}px`, // negative offset
          width: `${Math.abs(swipeX)}px`, // grow in negative direction
          transition: swipeX === 0 ? "left 0.25s ease, width 0.25s ease" : "none",
        }}
        hidden={deletionInProgress || swipeAnimating}
      >
        <div className={`absolute inset-0 bg-red-800 ${swipeDeleteDanger ? "opacity-100" : "opacity-0"} transition-opacity`} />
        <FaTrash className={`text-white font-semibold ml-9 truncate z-10 ${swipeDeleteDanger ? "animate-pulse" : ""}`} />
      </div>

      {/* Swipe left to reveal delete (shows on right side) */}
      <div
        className="absolute top-0 bottom-0 flex items-center justify-end"
        style={{
          right: `-${Math.abs(swipeX)}px`,
          width: `${Math.abs(swipeX)}px`, // grows left as swipeX increases
          transition: swipeX === 0 ? "width 0.25s ease" : "none",
        }}
        hidden={deletionInProgress || swipeAnimating}
      >
        <div className={`absolute inset-0 bg-red-800 ${swipeDeleteDanger ? "opacity-100" : "opacity-0"} transition-opacity`} />
        <FaTrash className={`text-white font-semibold mr-6 z-10 ${swipeDeleteDanger ? "animate-pulse" : ""}`} />
      </div>
      {/* Long-press visual progress overlay (restored) */}
      <div className="absolute inset-0 z-20 pointer-events-none">
        <div
          className="absolute left-0 top-0 h-full bg-white/5 rounded-xs"
          style={{
            width: `${touchActive ? 100 : 0}%`,
            transition: touchActive ? "width 0.3s linear" : "none",
          }}
          onTransitionEnd={() => {
            if (touchActive) setTouchActive(false);
          }}
        />
      </div>

      {/* Foreground content (moves with swipe) */}
      <ContextMenuMobile ref={contextMenuRef} items={contextMenuItems} controlsDisabled={controlsDisabled}>
        <div className="h-full flex items-center justify-start ml-4 pr-16">
          <div className="flex items-center flex-1 min-w-0" onDoubleClick={() => onSkip(index)}>
            <img src={thumbnailUrl} alt={track?.title || "Track Thumbnail"} className="aspect-square object-cover h-14 min-w-14 rounded-xs" />
            <div className="flex flex-col overflow-hidden flex-1 min-w-0 ml-4 select-none justify-center h-full">
              <span className="text-s font-semibold line-clamp-2 break-words leading-tight -mb-1 select-none">{track?.title}</span>
              <span className="text-s truncate select-none opacity-75">{track?.uploader}</span>
            </div>
          </div>
        </div>
      </ContextMenuMobile>

      {/* Drag handle outside ContextMenuMobile */}
      <div
        {...attributes}
        {...listeners}
        tabIndex={0}
        aria-label="Drag to reorder"
        className="absolute right-0 top-0 w-16 h-16 flex items-center justify-center select-none border-none outline-none touch-none z-10"
      >
        <FaGripLines className="text-xl" />
      </div>
    </div>
    </div>
  );
}
