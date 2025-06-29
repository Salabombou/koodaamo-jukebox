import { useState, useEffect, useCallback, useRef, useOptimistic } from "react";
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
import { FaArrowDown, FaArrowUp } from "react-icons/fa";

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
  currentTrack: (Track & { itemId: number }) | null;
  currentTrackIndex: number | null;
  controlsDisabled?: boolean;
  onMove: (fromIndex: number, toIndex: number) => void;
  onSkip: (index: number) => void;
  onDelete: (index: number) => void;
  onPlayNext: (index: number) => void;
}
export default function Queue({
  tracks,
  queueList,
  currentTrack,
  currentTrackIndex,
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
    queueList,
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
    (props: ListChildComponentProps<QueueItem[]>) => {
      const track = tracks.get(props.data[props.index].trackId) ?? null;

      return (
        <QueueRow
          {...props}
          track={track}
          currentTrack={currentTrack}
          onSkip={(i) => {
            scrolled.current = true;
            if (scrollTimeout.current) {
              clearTimeout(scrollTimeout.current);
            }
            scrollTimeout.current = window.setTimeout(() => {
              scrolled.current = false;
            }, 5000);
            onSkip(i);
          }}
          onDelete={onDelete}
          onPlayNext={onPlayNext}
          controlsDisabled={controlsDisabled}
        />
      )},
    [tracks, currentTrack, onSkip, controlsDisabled],
  );

  const list = useRef<FixedSizeList>(null);

  const scrolled = useRef(false);
  const scrollTimeout = useRef<number | null>(null);

  useEffect(() => {
    if (typeof currentTrackIndex === "number" && currentTrackIndex >= 0) {
      if (list.current) {
        if (!scrolled.current) {
          list.current.scrollToItem(currentTrackIndex, "center");
        }
        scrolled.current = false;
      }
    }
  }, [currentTrack, currentTrackIndex]);

  // Scroll to current track when arrow is clicked
  const scrollToCurrentTrack = useCallback(() => {
    if (
      typeof currentTrackIndex === "number" &&
      currentTrackIndex >= 0 &&
      list.current
    ) {
      list.current.scrollToItem(currentTrackIndex, "center");
    }
  }, [currentTrackIndex]);

  const [visibleRange, setVisibleRange] = useState<{
    start: number;
    stop: number;
  }>({ start: 0, stop: 0 });

  const topArrowVisible =
    typeof currentTrackIndex === "number" &&
    currentTrackIndex < visibleRange.start &&
    optimisticQueueList.length > 0;
  const bottomArrowVisible =
    typeof currentTrackIndex === "number" &&
    currentTrackIndex > visibleRange.stop &&
    optimisticQueueList.length > 0;

  return (
    <div style={{ height: listHeight }} className="relative w-full">
      {/* Top arrow */}
      {topArrowVisible && (
        <div className="hidden md:flex absolute top-2 left-0 w-full justify-center z-10">
          <button
            onClick={scrollToCurrentTrack}
            className="btn btn-wide btn-active border-0 hover:bg-queue-arrow-button-hover text-xl cursor-pointer"
            aria-label="Scroll to current track"
          >
            <FaArrowUp />
          </button>
        </div>
      )}
      {/* Bottom arrow */}
      {bottomArrowVisible && (
        <div className="hidden md:flex absolute bottom-2 left-0 w-full justify-center z-10">
          <button
            onClick={scrollToCurrentTrack}
            className="btn btn-wide btn-active border-0 hover:bg-queue-arrow-button-hover text-xl cursor-pointer"
            aria-label="Scroll to current track"
          >
            <FaArrowDown />
          </button>
        </div>
      )}
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
            scrolled.current = true;
            if (scrollTimeout.current) {
              clearTimeout(scrollTimeout.current);
            }
            scrollTimeout.current = window.setTimeout(() => {
              scrolled.current = false;
            }, 5000);
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
            className="hidden md:flex ml-6"
            itemData={optimisticQueueList}
            itemCount={optimisticQueueList.length}
            onScroll={(e) => {
              if (e.scrollUpdateWasRequested) return;
              scrolled.current = true;
              if (scrollTimeout.current) {
                clearTimeout(scrollTimeout.current);
              }
              scrollTimeout.current = window.setTimeout(() => {
                scrolled.current = false;
              }, 5000);
            }}
            itemSize={66}
            itemKey={itemKey}
            style={{
              overflowX: "hidden",
              overflowY: "scroll",
              scrollbarWidth: "none",
            }}
            onItemsRendered={({ visibleStartIndex, visibleStopIndex }) => {
              setVisibleRange({
                start: visibleStartIndex,
                stop: visibleStopIndex,
              });
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
              track={tracks.get(optimisticQueueList[draggedIndex].trackId) ?? null}
              currentTrack={currentTrack}
              onSkip={() => {}}
              onDelete={() => {}}
              onPlayNext={() => {}}
              style={{}}
              data={optimisticQueueList}
              controlsDisabled={controlsDisabled}
            />
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
