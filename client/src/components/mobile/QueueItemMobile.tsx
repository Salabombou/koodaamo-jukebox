import { memo, useRef, useState } from "react";
import { FaGripLines } from "react-icons/fa";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import type { QueueItem } from "../../types/queue";
import ContextMenu, { type ContextMenuItem, type ContextMenuRef } from "../common/ContextMenu";
import type { QueueItemProps } from "../common/QueueList";

function QueueItemMobileComponent({ index, style, data, track, currentItemId, thumbnailBlob = "/black.jpg", onDelete, onSkip, onPlayNext, controlsDisabled = false }: QueueItemProps) {
  const item = data[index] as QueueItem | undefined;

  const contextMenuRef = useRef<ContextMenuRef>(null);

  // For progress bar indicator
  const [touchActive, setTouchActive] = useState(false);
  const touchTimeoutRef = useRef<number | null>(null);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item?.id ?? `empty-${index}`,
  });

  if (!item) return null;

  const handleDelete = () => onDelete(item.id);
  const handlePlayNext = () => onPlayNext(index);
  const handleCopyUrl = () => {
    if (track?.webpage_url) {
      navigator.clipboard.writeText(track.webpage_url);
    }
  };

  // Create context menu items
  const contextMenuItems: ContextMenuItem[] = [
    {
      children: "Play Next",
      action: handlePlayNext,
    },
    {
      children: "Copy URL",
      action: handleCopyUrl,
    },
    {
      children: "Delete",
      action: handleDelete,
      className: "text-red-500 hover:text-red-700",
    },
  ];

  const highlight = item.id === currentItemId;

  // Touch handlers for context menu progress
  const handleTouchStart = () => {
    if (controlsDisabled || contextMenuRef.current!.isOpen) return;
    touchTimeoutRef.current = window.setTimeout(() => {
      setTouchActive(true);
    }, 100);
  };

  const handleTouchEnd = () => {
    if (touchTimeoutRef.current) {
      clearTimeout(touchTimeoutRef.current);
      touchTimeoutRef.current = null;
    }
    setTouchActive(false);
  };

  return (
    <div
      key={item.id}
      ref={setNodeRef}
      style={{
        ...style,
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={`text-white w-full h-16 relative ${isDragging || !track ? "invisible" : ""} ${controlsDisabled ? "pointer-events-none" : ""} ${!highlight ? "bg-transparent" : "bg-white/5"}`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {/* Full-item overlay progress indicator for context menu hold */}
      <div className="absolute inset-0 z-20 pointer-events-none">
        <div
          className="absolute left-0 top-0 h-full bg-white/5 rounded-xs"
          style={{
            width: `${touchActive ? 100 : 0}%`,
            transition: touchActive ? "width 0.6s linear" : "none",
          }}
        />
      </div>
      <ContextMenu ref={contextMenuRef} items={contextMenuItems} controlsDisabled={controlsDisabled}>
        <div className="h-full flex items-center justify-start ml-4 pr-16">
          <div className="flex items-center flex-1 min-w-0" onDoubleClick={() => onSkip(index)}>
            <div>
              <img src={thumbnailBlob} alt={track?.title || "Track Thumbnail"} className="aspect-square object-cover h-14 min-w-14 rounded-xs" />
            </div>
            <div className="flex flex-col overflow-hidden flex-1 min-w-0 ml-4 select-none justify-center h-full">
              <label className="text-s font-semibold line-clamp-2 break-words leading-tight -mb-1 select-none">{track?.title}</label>
              <label className="text-s truncate select-none opacity-75">{track?.uploader}</label>
            </div>
          </div>
        </div>
      </ContextMenu>
      <div
        {...attributes}
        {...listeners}
        tabIndex={0}
        aria-label="Drag to reorder"
        className="absolute right-0 top-0 w-16 h-16 flex items-center justify-center select-none border-none outline-none touch-none"
      >
        <FaGripLines className="text-xl" />
      </div>
    </div>
  );
}

const QueueItemMobile = memo(QueueItemMobileComponent);

export default QueueItemMobile;
