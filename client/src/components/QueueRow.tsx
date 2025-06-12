import type { ListChildComponentProps } from "react-window";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Track } from "../types/track";
import { QueueItem } from "../types/queue";

interface QueueRowProps extends ListChildComponentProps {
  data: QueueItem[];
  tracks: Map<string, Track>;
  currentTrackIndex?: number;
  onSkip: (index: number) => void;
  controlsDisabled?: boolean;
}

export default function QueueRow({
  index,
  style,
  data,
  tracks,
  currentTrackIndex,
  onSkip,
  controlsDisabled = false,
}: QueueRowProps) {
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

  const higlighted = currentTrackIndex === index;
  const isLastItem = index === data.length - 1;

  return (
    <div
      ref={setNodeRef}
      data-index={index}
      style={{
        ...style,
        transform: CSS.Transform.toString(transform),
        transition,
        visibility: isDragging || !track ? "hidden" : "visible",
        pointerEvents: controlsDisabled ? "none" : "auto",
      }}
      className={`flex h-12 max-h-12 ${!isLastItem && isDragging && "isLastItemborder-b border-base-300"} ${higlighted ? "bg-base-200" : "bg-base-100"}`}
    >
      <div className="flex flex-row items-center space-x-4 w-full">
        <div
          {...attributes}
          {...listeners}
          className="w-12 h-12 flex flex-shrink-0 items-center justify-center overflow-hidden bg-black"
        >
          <img
            src={track?.id ? `/.proxy/api/track/${track?.id}/thumbnail-low` : "/black.jpg"}
            className="object-contain w-full h-full bg-black"
            style={{ backgroundColor: "black" }}
          />
        </div>
        <div
          className="flex flex-col overflow-hidden"
          onDoubleClick={controlsDisabled ? undefined : () => onSkip(index)}
        >
          <label className="text-xs font-bold truncate">{track?.title}</label>
          <label className="text-xs truncate">{track?.uploader}</label>
        </div>
      </div>
    </div>
  );
}
