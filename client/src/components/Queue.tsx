import {
  useState,
  memo,
  useEffect,
  useCallback,
  useRef,
  useOptimistic,
} from "react";
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
  queueItems: Map<number, QueueItem>;
  currentTrackId: string | null;
  currentTrackIndex?: number | null;
  controlsDisabled?: boolean;
  backgroundColor: string;
  onMove: (fromIndex: number, toIndex: number) => void;
  onSkip: (index: number) => void;
  onDelete: (index: number) => void;
  onPlayNext: (index: number) => void;
}

const Queue = memo(function Queue({
  tracks,
  queueItems,
  currentTrackId,
  currentTrackIndex,
  backgroundColor,
  onMove,
  onSkip,
  onDelete,
  onPlayNext,
  controlsDisabled,
}: QueueProps) {
  const [optimisticQueueList, moveItem] = useOptimistic<
    QueueItem[],
    [number, number]
  >(
    [...queueItems.values()].sort(
      (a, b) => (a.shuffledIndex ?? a.index) - (b.shuffledIndex ?? b.index),
    ),
    (state, [fromIndex, toIndex]) => {
      const newState = [...state];
      const [movedItem] = newState.splice(fromIndex, 1);
      newState.splice(toIndex, 0, movedItem);
      return newState;
    },
  );

  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // Debounced resize handler to avoid rapid state updates
  const resizeTimeout = useRef<number | null>(null);
  const [listHeight, setListHeight] = useState(window.innerHeight);
  useEffect(() => {
    const handleResize = () => {
      if (resizeTimeout.current) clearTimeout(resizeTimeout.current);
      resizeTimeout.current = window.setTimeout(() => {
        const newHeight = window.innerHeight;
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
        currentTrackId={currentTrackId}
        backgroundColor={backgroundColor}
        onSkip={onSkip}
        onDelete={onDelete}
        onPlayNext={onPlayNext}
        controlsDisabled={controlsDisabled}
      />
    ),
    [tracks, currentTrackId, onSkip, backgroundColor, controlsDisabled],
  );

  const list = useRef<FixedSizeList>(null);

  const scrolled = useRef(false);
  useEffect(() => {
    // scroll where the current track is visible as first item
    if (typeof currentTrackIndex === "number" && currentTrackIndex >= 0) {
      if (list.current) {
        if (!scrolled.current) {
          list.current.scrollToItem(Math.min(optimisticQueueList.length - 1, currentTrackIndex + 1), "smart");
        }
        scrolled.current = false;
      }
    }
  }, [currentTrackIndex]);

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
        ) {
          onMove(fromIndex, toIndex);
          moveItem([fromIndex, toIndex]);
        }
      }}
    >
      <SortableContext
        items={optimisticQueueList}
        strategy={verticalListSortingStrategy}
      >
        <FixedSizeList
          ref={list}
          height={listHeight}
          width="100%"
          className="hidden md:flex mx-6"
          itemData={optimisticQueueList}
          itemCount={optimisticQueueList.length}
          onScroll={(e) => {
            if (e.scrollUpdateWasRequested) return;
            scrolled.current = true;
          }}
          itemSize={58}
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
      <DragOverlay>
        {draggedIndex !== null && (
          <QueueRow
            overlay={true}
            index={draggedIndex}
            currentTrackId={currentTrackId}
            backgroundColor={backgroundColor}
            onSkip={() => {}}
            onDelete={() => {}}
            onPlayNext={() => {}}
            style={{}}
            data={optimisticQueueList}
            tracks={tracks}
            controlsDisabled={controlsDisabled}
          />
        )}
      </DragOverlay>
    </DndContext>
  );
});

export default Queue;
