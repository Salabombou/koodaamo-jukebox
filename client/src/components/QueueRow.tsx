import { memo } from "react";
import type { ListChildComponentProps } from "react-window";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Track } from "../types/track";
import { QueueItem } from "../types/queue";
import ContextMenu from "./ContextMenu";
import { FaGripLines } from "react-icons/fa";

interface QueueRowProps extends ListChildComponentProps {
  data: QueueItem[];
  track: Track | null;
  currentTrack?: (Track & { itemId: number }) | null;
  thumbnailBlob?: string;
  onSkip: (index: number) => void;
  onDelete: (index: number) => void;
  onPlayNext: (index: number) => void;
  controlsDisabled?: boolean;
  overlay?: boolean; // for drag overlay
}

function QueueRowComponent({ index, style, data, track, currentTrack, thumbnailBlob = "/black.jpg", onDelete, onSkip, onPlayNext, controlsDisabled = false, overlay = false }: QueueRowProps) {
  const item = data.at(index);
  if (!item) return null;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isSorting,
  } = useSortable({
    id: item.id,
  });

  const highlighted = currentTrack?.itemId === item.id;

  const handleDelete = () => onDelete(index);
  const handlePlayNext = () => onPlayNext(index);
  const handleCopyUrl = () => {
    if (track?.webpage_url) {
      navigator.clipboard.writeText(track.webpage_url);
    }
  };

  return (
    <div
      key={item.id}
      ref={setNodeRef}
      style={{
        backgroundColor: "transparent",
        color: highlighted ? "#fff" : undefined,
        ...style,
        width: "100%",
        height: "64px",
        transform: CSS.Transform.toString(transform),
        transition,
        visibility: isDragging || !track ? "hidden" : "visible",
        pointerEvents: controlsDisabled ? "none" : "auto",
      }}
    >
      <div
        className={[
          "flex h-16 max-h-16 w-full md:pl-0 pl-4 ",
          `${highlighted && overlay ? "bg-queue-item-highlight-hover" : ""}`,
          `${highlighted && !overlay ? "bg-queue-item-highlight" : ""}`,
          `${!highlighted && !overlay ? "md:bg-queue-item bg-transparent" : ""}`,
          `${!highlighted && overlay ? "bg-queue-item-hover" : ""}`,
          `${isSorting ? "" : highlighted ? "hover:bg-queue-item-highlight-hover" : "hover:bg-queue-item-hover"}`,
        ].join(" ")}
      >
        <ContextMenu onPlayNext={handlePlayNext} onCopyUrl={handleCopyUrl} onDelete={handleDelete} controlsDisabled={controlsDisabled}>
          <div className="flex flex-row-reverse xl:flex-row items-center w-full h-full select-none">
            <div className="flex items-center">
              <button
                type="button"
                {...attributes}
                {...listeners}
                tabIndex={0}
                aria-label="Drag to reorder"
                className={[
                  "h-14 w-14 min-w-14 min-h-14 -mr-1 touch-none p-0 flex items-center justify-center select-none bg-transparent border-none outline-none",
                  overlay ? "cursor-grabbing" : "cursor-grab"
                ].join(" ")}
              >
                <span className="flex items-center justify-center w-full h-full">
                  <FaGripLines className="w-5 h-5 mr-1" />
                </span>
              </button>
            </div>
            <div
              className="flex items-center w-full min-w-0"
              onDoubleClick={controlsDisabled ? undefined : () => onSkip(index)}
            >
              <div className="md:aspect-video aspect-square h-14 w-14 md:w-auto flex flex-shrink-0 items-center justify-center overflow-hidden bg-black relative select-none">
                <img
                  src={thumbnailBlob}
                  loading="lazy"
                  className="w-full h-full object-cover object-center bg-black select-none md:object-cover"
                  alt={track?.title || "thumbnail"}
                  draggable={false}
                />
              </div>
              <div className="flex flex-col overflow-hidden w-full pl-2 select-none">
                <label className="text-s font-semibold line-clamp-2 break-words leading-tight -mb-1 select-none">{track?.title}</label>
                <label className="text-s truncate select-none">{track?.uploader}</label>
              </div>
            </div>
          </div>
        </ContextMenu>
      </div>
    </div>
  );
}

const QueueRow = memo(QueueRowComponent);

export default QueueRow;
