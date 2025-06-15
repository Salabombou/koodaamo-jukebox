import type { ListChildComponentProps } from "react-window";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Track } from "../types/track";
import { QueueItem } from "../types/queue";
import React from "react";
import { useDiscordSDK } from "../hooks/useDiscordSdk";
import { thumbnailUrlCacheLow } from "../services/thumbnailCache";

interface QueueRowProps extends ListChildComponentProps {
  data: QueueItem[];
  tracks: Map<string, Track>;
  currentTrackIndex?: number;
  backgroundColor: string;
  onSkip: (index: number) => void;
  controlsDisabled?: boolean;
}

// Memoized for performance
const QueueRow: React.FC<QueueRowProps> = React.memo(function QueueRow({
  index,
  style,
  data,
  tracks,
  currentTrackIndex,
  backgroundColor,
  onSkip,
  controlsDisabled = false,
}) {
  const item = data[index];
  const track = tracks.get(item.trackId);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging, // when the item itself is being dragged
  } = useSortable({
    id: item.id,
  });

  const highlighted = currentTrackIndex === index;
  const isLastItem = index === data.length - 1;

  const discordSDK = useDiscordSDK();

  // Get thumbnail URL from cache or generate and cache it
  let thumbUrl = "/black.jpg";
  if (track?.id) {
    if (thumbnailUrlCacheLow.has(track.id)) {
      thumbUrl = thumbnailUrlCacheLow.get(track.id)!;
    } else {
      thumbUrl = `${discordSDK.isEmbedded ? "/.proxy/" : ""}/api/track/${track.id}/thumbnail-low`;
      thumbnailUrlCacheLow.set(track.id, thumbUrl);
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        backgroundColor: backgroundColor.replace(
          /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/,
          "rgba($1, $2, $3, 1)",
        ),
        ...style,
        transform: CSS.Transform.toString(transform),
        transition,
        visibility: isDragging || !track ? "hidden" : "visible",
        pointerEvents: controlsDisabled ? "none" : "auto",
      }}
      data-index={index}
    >
      <div
        className={[
          "flex h-14 max-h-14 w-full px-1",
          `${highlighted ? "bg-queue-item-highlight text-text-black" : "bg-queue-item"}`,
          `${!isLastItem && !isDragging ? " border-b-2 border-queue-item-border-bottom" : ""}`,
        ].join(" ")}
      >
        <div className="flex flex-row items-center space-x-4 w-full">
          <div
            {...attributes}
            {...listeners}
            className="aspect-video h-12 flex flex-shrink-0 items-center justify-center overflow-hidden bg-black"
          >
            <img
              src={thumbUrl}
              className="w-full h-full object-cover bg-black"
            />
          </div>
          <div
            className="flex flex-col overflow-hidden"
            onDoubleClick={controlsDisabled ? undefined : () => onSkip(index)}
          >
            <label className="text-s font-bold truncate -mb-1">
              {track?.title}
            </label>
            <label className="text-s truncate">{track?.uploader}</label>
          </div>
        </div>
      </div>
    </div>
  );
});

export default QueueRow;
