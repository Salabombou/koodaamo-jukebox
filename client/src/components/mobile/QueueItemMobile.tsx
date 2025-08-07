import { memo, useRef, useEffect } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import ContextMenu from "../common/ContextMenu";
import { FaGripLines } from "react-icons/fa";
import { QueueItemProps } from "../common/QueueList";

interface QueueItemMobileProps extends QueueItemProps {}

function QueueRowComponent({ index, style, data, track, thumbnailBlob = "/black.jpg", onDelete, onSkip, onPlayNext, controlsDisabled = false }: QueueItemMobileProps) {
  const item = data.at(index);
  if (!item) return null;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  const touchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleDelete = () => onDelete(index);
  const handlePlayNext = () => onPlayNext(index);
  const handleCopyUrl = () => {
    if (track?.webpage_url) {
      navigator.clipboard.writeText(track.webpage_url);
    }
  };

  // Create context menu items
  const contextMenuItems = [
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

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (touchTimeoutRef.current) {
        clearTimeout(touchTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div
      key={item.id}
      ref={setNodeRef}
      style={{
        ...style,
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={`text-white bg-transparent w-full h-16 relative ${isDragging || !track ? "invisible" : ""} ${controlsDisabled ? "pointer-events-none" : ""}`}
    >
      <ContextMenu items={contextMenuItems} controlsDisabled={controlsDisabled}>
        <div className="h-full flex items-center justify-start ml-4 pr-16">
          <div className="flex items-center flex-1 min-w-0" onClick={() => onSkip(index)}>
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

const QueueRow = memo(QueueRowComponent);

export default QueueRow;
