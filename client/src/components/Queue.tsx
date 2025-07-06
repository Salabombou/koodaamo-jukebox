import { useState, useEffect, useCallback, useRef, useOptimistic, useMemo } from "react";
import type { ListChildComponentProps } from "react-window";
import { FixedSizeList } from "react-window";
import { DndContext, DragOverlay, type Modifier, closestCenter } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { getEventCoordinates } from "@dnd-kit/utilities";
import QueueRow from "./QueueRow";
import { QueueItem } from "../types/queue";
import { Track } from "../types/track";
import { FaArrowDown, FaArrowUp } from "react-icons/fa";
import AutoSizer from "react-virtualized-auto-sizer";

const restrictToVerticalAxisCenterY: Modifier = ({ transform, draggingNodeRect, activatorEvent }) => {
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

export default function Queue({ tracks, queueList, currentTrack, currentTrackIndex, onMove, onSkip, onDelete, onPlayNext, controlsDisabled }: QueueProps) {
  const [optimisticQueueList, moveItem] = useOptimistic<QueueItem[], [number, number]>(queueList, (state, [fromIndex, toIndex]) => {
    const newState = [...state];
    const [movedItem] = newState.splice(fromIndex, 1);
    newState.splice(toIndex, 0, movedItem);
    return newState;
  });

  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  const itemKey = useCallback((index: number, data: QueueItem[]) => data[index].id, []);

  // Memoize stable props for rowRenderer
  const stableProps = useMemo(
    () => ({
      onDelete,
      onPlayNext,
      controlsDisabled,
    }),
    [onDelete, onPlayNext, controlsDisabled],
  );

  // Memoize rowRenderer to avoid recreation on height/width changes
  const rowRenderer = useMemo(() => {
    return (props: ListChildComponentProps<QueueItem[]>) => {
      const track = tracks.get(props.data[props.index].trackId) ?? null;
      return (
        <QueueRow
          {...props}
          track={track}
          currentTrack={currentTrack}
          onSkip={(i) => {
            scrolledSince.current = Date.now();
            onSkip(i);
          }}
          onDelete={stableProps.onDelete}
          onPlayNext={stableProps.onPlayNext}
          controlsDisabled={stableProps.controlsDisabled}
        />
      );
    };
    // Only depend on things that should trigger a re-render of rows
    // tracks and currentTrack are assumed stable (from parent or memoized)
  }, [tracks, currentTrack, onSkip, stableProps]);

  useEffect(() => {
    if (draggedIndex !== null) {
      document.body.style.cursor = "grabbing";
    } else {
      document.body.style.cursor = "default";
    }
  }, [draggedIndex]);

  const list = useRef<FixedSizeList>(null);

  const scrolledSince = useRef<number | null>(null);

  const isScrolled = useCallback(() => {
    if (scrolledSince.current === null) return false;
    return Date.now() - scrolledSince.current < 5000;
  }, []);

  useEffect(() => {
    if (typeof currentTrackIndex === "number" && currentTrackIndex >= 0) {
      if (list.current) {
        if (!isScrolled() && draggedIndex === null) {
          list.current.scrollToItem(currentTrackIndex, "center");
        }
        scrolledSince.current = null;
      }
    }
  }, [currentTrack, currentTrackIndex, isScrolled]);

  // Scroll to current track when arrow is clicked
  const scrollToCurrentTrack = useCallback(() => {
    if (typeof currentTrackIndex === "number" && currentTrackIndex >= 0 && list.current) {
      list.current.scrollToItem(currentTrackIndex, "center");
    }
  }, [currentTrackIndex]);

  const [visibleRange, setVisibleRange] = useState<{
    start: number;
    stop: number;
  }>({ start: 0, stop: 0 });

  const topArrowVisible = typeof currentTrackIndex === "number" && currentTrackIndex < visibleRange.start && optimisticQueueList.length > 0;
  const bottomArrowVisible = typeof currentTrackIndex === "number" && currentTrackIndex > visibleRange.stop && optimisticQueueList.length > 0;

  return (
    <div style={{ height: "100%" }} className="relative ml-6 w-full hidden md:flex">
      {/* Top arrow */}
      {topArrowVisible && (
        <div className="hidden md:flex absolute top-2 right-2 z-10 pointer-events-none">
          <button
            onClick={scrollToCurrentTrack}
            className="btn btn-square btn-ghost hover:bg-queue-arrow-button-hover text-3xl text-white cursor-pointer pointer-events-auto"
            aria-label="Scroll to current track"
          >
            <FaArrowUp className="animate-bounce pt-2" />
          </button>
        </div>
      )}
      {/* Bottom arrow */}
      {bottomArrowVisible && (
        <div className="hidden md:flex absolute bottom-2 right-2 z-10 pointer-events-none">
          <button
            onClick={scrollToCurrentTrack}
            className="btn btn-square btn-ghost hover:bg-queue-arrow-button-hover text-3xl text-white cursor-pointer pointer-events-auto"
            aria-label="Scroll to current track"
          >
            <FaArrowDown className="animate-bounce pt-2" />
          </button>
        </div>
      )}
      <AutoSizer>
        {({ height, width }) => (
          <DndContext
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxisCenterY]}
            onDragStart={(e) => setDraggedIndex(e.active.data.current?.sortable.index as number)}
            onDragEnd={(e) => {
              const fromIndex = draggedIndex;
              const toIndex = e.over?.data.current?.sortable.index;
              setDraggedIndex(null);
              if (typeof fromIndex === "number" && typeof toIndex === "number" && fromIndex !== toIndex && !controlsDisabled) {
                scrolledSince.current = Date.now();
                onMove(fromIndex, toIndex);
                moveItem([fromIndex, toIndex]);
              }
            }}
          >
            <SortableContext items={optimisticQueueList} strategy={verticalListSortingStrategy}>
              <FixedSizeList
                ref={list}
                height={height}
                width={width}
                itemData={optimisticQueueList}
                itemCount={optimisticQueueList.length}
                onScroll={(e) => {
                  if (e.scrollUpdateWasRequested) return;
                  scrolledSince.current = Date.now();
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
        )}
      </AutoSizer>
    </div>
  );
}
