import type { ListChildComponentProps } from "react-window";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Track } from "../types/track";
import { QueueItem } from "../types/queue";
import { memo } from "react";

interface QueueRowProps extends ListChildComponentProps {
  data: QueueItem[];
  tracks: Map<string, Track>;
  currentTrackIndex?: number;
  dragging: boolean;
  onSkip: (index: number) => void;
}

function QueueRow({
  index,
  style,
  data,
  tracks,
  currentTrackIndex,
  dragging, // when the queue list move is happening
  onSkip,
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
        visibility: isDragging ? "hidden" : "visible",
        pointerEvents: dragging ? "none" : "auto",
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
            src={`/.proxy/api/track/${track?.id}/thumbnail-low`}
            className="object-contain w-full h-full bg-black"
            style={{ backgroundColor: "black" }}
          />
        </div>
        <div
          className="flex flex-col overflow-hidden"
          onDoubleClick={() => onSkip(index)}
        >
          <label className="text-xs font-bold truncate">{track?.title}</label>
          <label className="text-xs truncate">{track?.uploader}</label>
        </div>
      </div>
    </div>
  );
}

const MemoizedQueueRow = memo(QueueRow);

export { MemoizedQueueRow };
