import { useState, memo, useEffect, useCallback, useRef } from "react";
import type { ListChildComponentProps } from "react-window";
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
  currentTrackIndex?: number | null;
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

  // Debounced resize handler to avoid rapid state updates
  const resizeTimeout = useRef<number | null>(null);
  const [listHeight, setListHeight] = useState(window.innerHeight - 24);
  useEffect(() => {
    const handleResize = () => {
      if (resizeTimeout.current) clearTimeout(resizeTimeout.current);
      resizeTimeout.current = window.setTimeout(() => {
        const newHeight = window.innerHeight - 24;
        setListHeight((prev) => (prev !== newHeight ? newHeight : prev));
      }, 100); // 100ms debounce
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      if (resizeTimeout.current) clearTimeout(resizeTimeout.current);
    };
  }, []);

  const itemKey = useCallback(
    (index: number, data: QueueItem[]) => data[index].id,
    [],
  );

  const rowRenderer = useCallback(
    (props: ListChildComponentProps) => (
      <QueueRow
        {...props}
        tracks={tracks}
        currentTrackIndex={currentTrackIndex}
        backgroundColor={backgroundColor}
        onSkip={onSkip}
        controlsDisabled={controlsDisabled}
      />
    ),
    [tracks, currentTrackIndex, backgroundColor, onSkip, controlsDisabled],
  );

  return (
    <DndContext
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxisCenterY]}
      onDragStart={(e) =>
        setDraggedIndex(e.active.data.current?.sortable.index as number)
      }
      onDragEnd={(e) => {
        const fromIndex = draggedIndex;
        const toIndex = e.over?.data.current?.sortable.index;
        setDraggedIndex(null);
        if (
          typeof fromIndex === "number" &&
          typeof toIndex === "number" &&
          fromIndex !== toIndex &&
          !controlsDisabled
        )
          onMove(fromIndex, toIndex);
      }}
    >
      <SortableContext items={queueList} strategy={verticalListSortingStrategy}>
        <FixedSizeList
          height={listHeight}
          width="100%"
          className="hidden md:flex mx-6"
          itemData={queueList}
          itemCount={queueList.length}
          itemSize={56}
          itemKey={itemKey}
          style={{
            overflowX: "hidden",
            overflowY: "scroll",
            scrollbarWidth: "none",
          }}
        >
          {rowRenderer}
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
