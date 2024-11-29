import React from 'react';

import type { DraggableAttributes } from '@dnd-kit/core';
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';
import type { Transform } from '@dnd-kit/utilities';
import { CSS } from '@dnd-kit/utilities';
import { faBars } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import type { TClientVideo } from '../../shared/types/video';

interface QueueItemProps {
  track: TClientVideo;
  invisible?: boolean;
  highlight?: boolean;
  setNodeRef?: (node: HTMLElement | null) => void;
  style?: React.CSSProperties;
  attributes?: DraggableAttributes;
  listeners?: SyntheticListenerMap;
  transform?: Transform | null;
  transition?: string;
}

export default function QueueItem({
  setNodeRef,
  track,
  invisible,
  highlight,
  style,
  attributes,
  listeners,
  transform,
  transition
}: QueueItemProps) {
  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        height: '116px',
        transform: CSS.Transform.toString(transform!),
        transition,
        opacity: invisible ? 0 : 1,
      }}
      className={`${highlight ? 'bg-base-300' : 'bg-base-200'} flex flex-row items-center select-none space-x-4 w-full p-4`}
    >
      <div {...attributes} {...listeners} className="flex items-center h-full cursor-grab active:cursor-grabbing">
        <FontAwesomeIcon icon={faBars} size="xl" />
      </div>
      <img src={track.thumbnail} width={100} className="rounded-md"></img>
      <div className="flex flex-col overflow-hidden">
        <label className="text-xl font-bold truncate">{track.title}</label>
        <label className="text-sm truncate">{track.uploader}</label>
      </div>
    </div>
  );
}
