import React, { useMemo } from "react";
import type { ListChildComponentProps } from "react-window";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Track } from "../types/track";
import { QueueItem } from "../types/queue";
import { useDiscordSDK } from "../hooks/useDiscordSdk";
import { thumbnailUrlCacheLow } from "../services/thumbnailCache";
import ContextMenu from "./ContextMenu";
import { FaGripLines } from "react-icons/fa";

interface QueueRowProps extends ListChildComponentProps {
  data: QueueItem[];
  tracks: Map<string, Track>;
  currentTrackId: string | null;
  backgroundColor: string;
  onSkip: (index: number) => void;
  onDelete: (index: number) => void;
  onPlayNext: (index: number) => void;
  controlsDisabled?: boolean;
  overlay?: boolean; // for drag overlay
}

const QueueRow: React.FC<QueueRowProps> = React.memo(
  ({
    index,
    style,
    data,
    tracks,
    currentTrackId,
    backgroundColor,
    onDelete,
    onSkip,
    onPlayNext,
    controlsDisabled = false,
    overlay = false,
  }) => {
    const item = data[index];
    const track = tracks.get(item.trackId);

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

    const highlighted = item.trackId === currentTrackId;
    const discordSDK = useDiscordSDK();
    const thumbUrl = useMemo(() => {
      if (!track?.id) return "/black.jpg";
      // Use both track.id and embed state as cache key
      const cacheKey = `${track.id}:${discordSDK.isEmbedded ? "1" : "0"}`;
      if (thumbnailUrlCacheLow.has(cacheKey)) {
        return thumbnailUrlCacheLow.get(cacheKey)!;
      }
      const url = `${discordSDK.isEmbedded ? "/.proxy" : ""}/api/track/${track.id}/thumbnail-low`;
      thumbnailUrlCacheLow.set(cacheKey, url);
      return url;
    }, [track?.id, discordSDK.isEmbedded]);

    // Dropdown menu handlers
    const handleDelete = () => onDelete(index);
    const handlePlayNext = () => onPlayNext(index);
    const handleCopyUrl = () => {
      if (track?.webpageUrl) {
        navigator.clipboard.writeText(track.webpageUrl);
      }
    };

    // Utility to determine if a color is bright
    function isColorBright(color: string): boolean {
      // Accepts hex (#RRGGBB or #RGB) or rgb(a) strings
      let r = 0,
        g = 0,
        b = 0;
      if (color.startsWith("#")) {
        let hex = color.slice(1);
        if (hex.length === 3) {
          r = parseInt(hex[0] + hex[0], 16);
          g = parseInt(hex[1] + hex[1], 16);
          b = parseInt(hex[2] + hex[2], 16);
        } else if (hex.length === 6) {
          r = parseInt(hex.slice(0, 2), 16);
          g = parseInt(hex.slice(2, 4), 16);
          b = parseInt(hex.slice(4, 6), 16);
        }
      } else if (color.startsWith("rgb")) {
        const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (match) {
          r = parseInt(match[1], 10);
          g = parseInt(match[2], 10);
          b = parseInt(match[3], 10);
        }
      }
      // Perceived brightness formula
      return (r * 299 + g * 587 + b * 114) / 1000 > 180;
    }

    return (
      <div
        key={item.id}
        ref={setNodeRef}
        style={{
          backgroundColor: highlighted ? backgroundColor : "transparent",
          color: highlighted
            ? isColorBright(backgroundColor)
              ? "#000"
              : "#fff"
            : undefined,
          //opacity: controlsDisabled ? 0.5 : 1,
          ...style,
          width: "100%",
          height: "56px",
          transform: CSS.Transform.toString(transform),
          transition,
          visibility: isDragging || !track ? "hidden" : "visible",
          pointerEvents: controlsDisabled ? "none" : "auto",
        }}
      >
        <div
          className={[
            "flex h-14 max-h-14 w-full px-1",
            `${highlighted && overlay ? "bg-queue-item-highlight-hover" : ""}`,
            `${highlighted && !overlay ? "bg-queue-item-highlight" : ""}`,
            `${!highlighted && !overlay ? "bg-queue-item" : ""}`,
            `${!highlighted && overlay ? "bg-queue-item-hover" : ""}`,
            `${isSorting ? "" : highlighted ? "hover:bg-queue-item-highlight-hover" : "hover:bg-queue-item-hover"}`,
          ].join(" ")}
          onDoubleClick={controlsDisabled ? undefined : () => onSkip(index)}
        >
          <ContextMenu
            onPlayNext={handlePlayNext}
            onCopyUrl={handleCopyUrl}
            onDelete={handleDelete}
            controlsDisabled={controlsDisabled}
          >
            <div className="flex flex-row items-center w-full h-full">
              <div
                {...attributes}
                {...listeners}
                className="h-full px-4 flex items-center"
              >
                <FaGripLines />
              </div>
              <div className="aspect-video h-12 flex flex-shrink-0 items-center justify-center overflow-hidden bg-black relative">
                <img
                  src={thumbUrl}
                  loading="lazy"
                  className="w-full h-full object-cover bg-black"
                  alt={track?.title || "thumbnail"}
                />
              </div>
              <div className="flex flex-col overflow-hidden w-full pl-2">
                <label className="text-s font-bold truncate -mb-1">
                  {track?.title}
                </label>
                <label className="text-s truncate">{track?.uploader}</label>
              </div>
            </div>
          </ContextMenu>
        </div>
      </div>
    );
  },
);

export default QueueRow;
