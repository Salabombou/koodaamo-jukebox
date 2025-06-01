import { useState, Ref } from "react";

import { FixedSizeList } from "react-window";

import {
  DndContext,
  DragOverlay,
  type Modifier,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { getEventCoordinates } from "@dnd-kit/utilities";
import QueueRow from "./QueueRow";
import { QueueItem } from "../types/queue";

const restrictToVerticalAxisCenterY: Modifier = ({
  transform,
  draggingNodeRect,
  activatorEvent,
}) => {
  if (draggingNodeRect && activatorEvent) {
    const activatorCoordinates = getEventCoordinates(activatorEvent);

    if (!activatorCoordinates) {
      return transform;
    }

    const offsetY = activatorCoordinates.y - draggingNodeRect.top;

    return {
      ...transform,
      x: 0,
      y: transform.y + offsetY - draggingNodeRect.height / 2,
    };
  }

  return transform;
};

interface QueueProps {
  ref: Ref<HTMLDivElement>;
  height: number;

  tracks: Map<string, any>;
  queueList: QueueItem[];
}

export default function Queue({ height, tracks, queueList, ref }: QueueProps) {
  const [draggedIndex, setDraggedIndex] = useState<number>(0);

  // if any of the items in queueList is not in tracks, we should not render the queue
  if (queueList.length === 0 || queueList.some((item) => !tracks.has(item.trackId))) {
    return;
  }

  return (
    <DndContext
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxisCenterY]}
      onDragStart={(e) => {
        setDraggedIndex(e.active.data.current?.index ?? 0);
      }}
      onDragEnd={() => {
        setDraggedIndex(0);
      }}
    >
      <SortableContext
        items={queueList.map(({ id }) => id)}
        strategy={verticalListSortingStrategy}
      >
        <FixedSizeList
          outerRef={ref}
          height={height}
          width="100%"
          className="hidden md:flex mx-6"
          itemData={queueList.map(({ trackId }) => tracks.get(trackId))}
          itemCount={queueList.length}
          itemSize={50}
          style={{
            overflowX: "hidden",
            overflowY: "scroll",
            scrollbarWidth: "none",
          }}
        >
          {(props) => QueueRow(props)}
        </FixedSizeList>
      </SortableContext>
      <DragOverlay
        dropAnimation={null}
        children={
          <QueueRow
            index={draggedIndex ?? 0}
            style={{}}
            data={tracks.get(queueList[draggedIndex ?? 0]?.trackId)}
          />
        }
      ></DragOverlay>
    </DndContext>
  );
}
