import { useState, memo, useEffect } from "react";
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
import { Track } from "../types/track";

// Restrict drag to vertical axis
const restrictToVerticalAxisCenterY: Modifier = ({
  transform,
  draggingNodeRect,
  activatorEvent,
}) => {
  if (draggingNodeRect && activatorEvent) {
    const activatorCoordinates = getEventCoordinates(activatorEvent);
    if (!activatorCoordinates) return transform;
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
  tracks: Map<string, Track>;
  queueList: QueueItem[];
  currentTrackIndex?: number;
  controlsDisabled?: boolean;
  backgroundColor: string;
  onMove: (fromIndex: number, toIndex: number) => void;
  onSkip: (index: number) => void;
}

const Queue = memo(function Queue({
  tracks,
  queueList,
  currentTrackIndex,
  backgroundColor,
  onMove,
  onSkip,
  controlsDisabled,
}: QueueProps) {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const [listHeight, setListHeight] = useState<number>(window.innerHeight - 24);
  useEffect(() => {
    const handleResize = () => {
      setListHeight(window.innerHeight - 24);
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  return (
    <DndContext
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxisCenterY]}
      onDragStart={(e) => {
        setDraggedIndex(e.active.data.current?.sortable.index as number);
      }}
      onDragEnd={(e) => {
        const fromIndex = draggedIndex;
        const toIndex = e.over?.data.current?.sortable.index;
        setDraggedIndex(null);
        if (
          typeof fromIndex === "number" &&
          typeof toIndex === "number" &&
          fromIndex !== toIndex &&
          !controlsDisabled
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
          height={listHeight}
          width="100%"
          className="hidden md:flex mx-6"
          itemData={queueList}
          itemCount={queueList.length}
          itemSize={56}
          itemKey={(index, data) => data[index].id}
          style={{
            overflowX: "hidden",
            overflowY: "scroll",
            scrollbarWidth: "none",
          }}
        >
          {(props) => (
            <QueueRow
              {...props}
              tracks={tracks}
              currentTrackIndex={currentTrackIndex}
              backgroundColor={backgroundColor}
              onSkip={onSkip}
              controlsDisabled={controlsDisabled}
            />
          )}
        </FixedSizeList>
      </SortableContext>
      <DragOverlay dropAnimation={null}>
        {draggedIndex !== null && (
          <QueueRow
            index={draggedIndex}
            currentTrackIndex={currentTrackIndex}
            backgroundColor={backgroundColor}
            onSkip={() => {}}
            style={{}}
            data={queueList}
            tracks={tracks}
            controlsDisabled={controlsDisabled}
          />
        )}
      </DragOverlay>
    </DndContext>
  );
});

export default Queue;
