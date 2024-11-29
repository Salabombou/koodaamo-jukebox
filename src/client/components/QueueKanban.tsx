import React, { useEffect, useState } from 'react';
import { FixedSizeList, type ListChildComponentProps } from 'react-window';

import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  type Modifier,
  closestCenter
} from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import  { getEventCoordinates } from '@dnd-kit/utilities';

import type { TClientVideo } from '../../shared/types/video';
import QueueItem from './QueueItem';
import QueueAddTrack from './QueueAddTrack';
import QueueContextMenu from './QueueContextMenu';

interface QueueKanbanProps {
  queue: TClientVideo['videoId'][];
  tracks: Map<string, TClientVideo>;
  currentTrack: number;
  onMove: (oldIndex: number, newIndex: number) => void;
}

function Row({ index, style, data }: ListChildComponentProps, tracks: Map<string, TClientVideo>, currentTrack: number) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: data[index][0]
  });

  return (
    <QueueItem
      track={tracks.get(data[index][1])!}
      invisible={isDragging}
      highlight={data[index][0] === currentTrack}
      attributes={attributes}
      listeners={listeners}
      setNodeRef={setNodeRef}
      style={style}
      transform={transform}
      transition={transition}
    />
  );
}

const restrictToVerticalAxisCenterY: Modifier = ({
  transform,
  draggingNodeRect,
  activatorEvent
}) => {
  if (draggingNodeRect && activatorEvent) {
    const activatorCoordinates = getEventCoordinates(activatorEvent);

    if (!activatorCoordinates) {
      return transform;
    }

    const offsetY = activatorCoordinates.y - draggingNodeRect.top;

    return {
      ...transform,
      x: -16,
      y: transform.y + offsetY - draggingNodeRect.height / 2,
    };
  }

  return transform;
}

export default function QueueKanban({ queue, tracks, currentTrack, onMove }: QueueKanbanProps) {
  const kanban = React.useRef<HTMLDivElement>(null);

  const [contextMenuCoordinates, setContextMenuCoordinates] = useState<{x: number; y: number} | null>(null);

  const [windowHeight, setWindowHeight] = useState(window.innerHeight);
  const [draggedTrack, setDraggedTrack] = useState<[number, TClientVideo['videoId']] | null>();

  const [list, setList] = useState<[number, string][]>(queue.map((trackId, i) => [i, trackId]));

  useEffect(() => {
    const newList = queue.map<[number, string]>((trackId, i) => [i, trackId]);
    setList(newList);
  }, [queue]);

  useEffect(() => {
    if (!kanban.current) return;
    
    const abortController = new AbortController();

    window.addEventListener('resize', () => {
      setWindowHeight(window.innerHeight);
    }, { signal: abortController.signal });

    kanban.current.addEventListener('contextmenu', (event) => {
      event.preventDefault();
      
      let x = event.clientX;
      let y = event.clientY;

      const contextMenuWidth = 200;
      const contextMenuHeight = 400;

      if (x + contextMenuWidth > window.innerWidth) {
        x = window.innerWidth - contextMenuWidth;
      }

      if (y + contextMenuHeight > window.innerHeight) {
        y = window.innerHeight - contextMenuHeight;
      }

      setContextMenuCoordinates({ x, y });
    }, { signal: abortController.signal });
    
    return () => {
      abortController.abort();
    }
  }, []);

  const handleDragStart = (event: DragStartEvent) => {
    setDraggedTrack(list[Number(event.active.id)] || null);
    document.body.style.cursor = 'grabbing';
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (active && over && active.id !== over.id) {
      const oldIndex = list.findIndex(([index]) => index === Number(active.id));
      const newIndex = list.findIndex(([index]) => index === Number(over.id));

      console.log('oldIndex', oldIndex, 'newIndex', newIndex);

      const newList = [...list];
      const [removed] = newList.splice(oldIndex, 1);
      if (typeof removed === 'undefined') return;
      newList.splice(newIndex, 0, removed);
      setList(newList);

      onMove(oldIndex, newIndex);
    }

    setDraggedTrack(null);
    document.body.style.cursor = '';
  };

  return (
    <>
        <DndContext
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      modifiers={[restrictToVerticalAxisCenterY]}
    >
      <SortableContext items={list.map(([index]) => index)} strategy={verticalListSortingStrategy}>
        <FixedSizeList
          innerRef={kanban}
          height={windowHeight}
          width="100%"
          itemSize={116}
          itemCount={list.length}
          itemData={list}
          className="bg-base-200"
          style={{
            overflowX: 'hidden',
            overflowY: 'scroll',
            scrollbarWidth: 'none'
          }}
        >
          {(props) => Row(props, tracks, currentTrack)}
        </FixedSizeList>
      </SortableContext>
      <DragOverlay dropAnimation={null}>
        {draggedTrack && <QueueItem track={tracks.get(draggedTrack[1])!} highlight={draggedTrack[0] === currentTrack} />}
      </DragOverlay>
    </DndContext>
    {contextMenuCoordinates && (
      <QueueContextMenu coordinates={contextMenuCoordinates} onClose={() => {
        setContextMenuCoordinates(null);
      }}/>
    )}
    </>
  );
}
