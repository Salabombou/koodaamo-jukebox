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
import { MemoizedQueueRow } from "./QueueRow";
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
  currentTrackIndex?: number;
  dragging: boolean;

  onMove: (fromIndex: number, toIndex: number) => void;
  onSkip: (index: number) => void;
}

export default function Queue({
  height,
  tracks,
  queueList,
  currentTrackIndex,
  dragging,
  onMove,
  onSkip,
  ref,
}: QueueProps) {
  /*if (
    queueList.length === 0 ||
    queueList.some((item) => !tracks.has(item.trackId))
  ) {
    return null;
  }*/

  const [draggedIndex, setDraggedIndex] = useState<number>(0);

  return (
    <DndContext
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxisCenterY]}
      onDragStart={(e) => {
        console.log("drag start", e.active.data.current?.sortable.index);
        setDraggedIndex(e.active.data.current?.sortable.index as number);
      }}
      onDragEnd={(e) => {
        const fromIndex = draggedIndex;
        const toIndex = e.over?.data.current?.sortable.index;
        setDraggedIndex(0);
        if (
          typeof fromIndex === "number" &&
          typeof toIndex === "number" &&
          fromIndex !== toIndex &&
          !dragging
        ) {
          onMove(fromIndex, toIndex);
        }
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
          itemData={queueList}
          itemCount={queueList.length}
          itemSize={50}
          style={{
            overflowX: "hidden",
            overflowY: "scroll",
            scrollbarWidth: "none",
          }}
        >
          {(props) => (
            <MemoizedQueueRow
              {...props}
              tracks={tracks}
              currentTrackIndex={currentTrackIndex}
              dragging={dragging}
              onSkip={onSkip}
            />
          )}
        </FixedSizeList>
      </SortableContext>
      <DragOverlay
        dropAnimation={null}
        children={
          <MemoizedQueueRow
            index={draggedIndex ?? 0}
            currentTrackIndex={currentTrackIndex}
            dragging={dragging}
            onSkip={() => {}}
            style={{}}
            data={queueList}
            tracks={tracks}
          />
        }
      ></DragOverlay>
    </DndContext>
  );
}
