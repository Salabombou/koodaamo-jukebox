import type { ListChildComponentProps } from "react-window";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Track } from "../types/track";

interface QueueRowProps extends ListChildComponentProps {}

export default function QueueRow({ index, style, data }: QueueRowProps) {
  console.log("QueueRow", index, data);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: `${index}:${data[index].trackId}`,
  });

  const track = data[index] as Track;

  return (
    <div
      ref={setNodeRef}
      data-index={data[index][0]}
      style={{
        ...style,
        transform: CSS.Transform.toString(transform),
        transition,
        visibility: isDragging ? "hidden" : "visible",
      }}
      className="flex h-12 max-h-12 bg-base-100"
    >
      <div className="flex flex-row items-center space-x-4 w-full">
        <div
          {...attributes}
          {...listeners}
          className="w-12 flex flex-shrink-0 items-center overflow-hidden"
        >
          <div className="select-none bg-base-300 dark:bg-black">
            <img
              src={`/.proxy/api/track/${track.trackId}/thumbnail.jpg`}
              className="object-cover"
            />
          </div>
        </div>
        <div className="flex flex-col overflow-hidden">
          <label className="text-xs font-bold truncate">{track.title}</label>
          <label className="text-xs truncate">{track.uploader}</label>
        </div>
      </div>
    </div>
  );
}
