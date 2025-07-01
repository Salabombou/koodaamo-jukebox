import type { ListChildComponentProps } from "react-window";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Track } from "../types/track";
import { QueueItem } from "../types/queue";
import { useDiscordSDK } from "../hooks/useDiscordSdk";
import ContextMenu from "./ContextMenu";
import { FaGripLines } from "react-icons/fa";

interface QueueRowProps extends ListChildComponentProps {
  data: QueueItem[];
  track: Track | null;
  currentTrack?: (Track & { itemId: number }) | null;
  onSkip: (index: number) => void;
  onDelete: (index: number) => void;
  onPlayNext: (index: number) => void;
  controlsDisabled?: boolean;
  overlay?: boolean; // for drag overlay
}

export default function QueueRow({ index, style, data, track, currentTrack, onDelete, onSkip, onPlayNext, controlsDisabled = false, overlay = false }: QueueRowProps) {
  const item = data.at(index);
  if (!item) return;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging, // when the item itself is being dragged
    isSorting,
  } = useSortable({
    id: item.id,
  });

  const highlighted = currentTrack?.itemId === item.id;

  const discordSDK = useDiscordSDK();

  // Dropdown menu handlers
  const handleDelete = () => onDelete(index);
  const handlePlayNext = () => onPlayNext(index);
  const handleCopyUrl = () => {
    if (track?.webpageUrl) {
      navigator.clipboard.writeText(track.webpageUrl);
    }
  };

  return (
    <div
      key={item.id}
      ref={setNodeRef}
      style={{
        backgroundColor: "transparent",
        color: highlighted ? "#fff" : undefined,
        //opacity: controlsDisabled ? 0.5 : 1,
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
          "flex h-16 max-h-16 w-full px-1",
          `${highlighted && overlay ? "bg-queue-item-highlight-hover" : ""}`,
          `${highlighted && !overlay ? "bg-queue-item-highlight" : ""}`,
          `${!highlighted && !overlay ? "bg-queue-item" : ""}`,
          `${!highlighted && overlay ? "bg-queue-item-hover" : ""}`,
          `${isSorting ? "" : highlighted ? "hover:bg-queue-item-highlight-hover" : "hover:bg-queue-item-hover"}`,
        ].join(" ")}
        onDoubleClick={controlsDisabled ? undefined : () => onSkip(index)}
      >
        <ContextMenu onPlayNext={handlePlayNext} onCopyUrl={handleCopyUrl} onDelete={handleDelete} controlsDisabled={controlsDisabled}>
          <div className="flex flex-row items-center w-full h-full select-none">
            <div {...attributes} {...listeners} className={`h-full p-4 mr-1 flex items-center justify-center select-none ${!overlay && !isDragging ? "cursor-grab" : ""}`}>
              <FaGripLines />
            </div>
            <div className="aspect-video h-14 flex flex-shrink-0 items-center justify-center overflow-hidden bg-black relative select-none">
              <img
                src={track?.id ? `${discordSDK.isEmbedded ? "/.proxy" : ""}/api/track/${track.id}/thumbnail-low` : "/black.jpg"}
                loading="lazy"
                className="w-full h-full object-cover object-center aspect-square bg-black select-none"
                alt={track?.title || "thumbnail"}
                draggable={false}
              />
            </div>
            <div className="flex flex-col overflow-hidden w-full pl-2 select-none">
              <label className="text-s font-bold truncate -mb-1 select-none">{track?.title}</label>
              <label className="text-s truncate select-none">{track?.uploader}</label>
            </div>
          </div>
        </ContextMenu>
      </div>
    </div>
  );
}
