import React, { forwardRef } from 'react';

import { DragOverlay, type DraggableAttributes } from '@dnd-kit/core';
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';
import type { Transform } from '@dnd-kit/utilities';
import { CSS } from '@dnd-kit/utilities';
import { faBars } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import type { TClientVideo } from '../../shared/types/video';

interface QueueItemProps {
  track: TClientVideo;
  index?: number;
  invisible?: boolean;
  highlight?: boolean;
  disableHover?: boolean;
  dragOverlay?: boolean;
  style?: React.CSSProperties;
  attributes?: DraggableAttributes;
  listeners?: SyntheticListenerMap;
  transform?: Transform | null;
  transition?: string;
}

export default forwardRef<HTMLDivElement, QueueItemProps>(
  (
    {
      track,
      index,
      invisible,
      highlight,
      disableHover,
      dragOverlay,
      style,
      attributes,
      listeners,
      transform,
      transition
    },
    ref
  ) => {
    return (
      <div
        ref={ref}
        data-index={index}
        style={{
          ...style,
          height: '116px',
          transform: CSS.Transform.toString(transform!),
          transition,
          visibility: invisible ? 'hidden' : 'visible'
        }}
        className={[
          'flex flex-row items-center select-none space-x-4 w-full p-4',
          highlight
            ? 'bg-base-300'
            : dragOverlay
              ? 'bg-base-200'
              : disableHover
                ? 'bg-base-100'
                : 'bg-base-100 hover:bg-base-200'
        ].join(' ')}
      >
        <div {...attributes} {...listeners} className="flex items-center h-full cursor-grab active:cursor-grabbing">
          <FontAwesomeIcon icon={faBars} size="xl" />
        </div>
        <div className="w-[100px] h-[100px] flex items-center bg-black rounded-md overflow-hidden">
            <div>
              <img src={track.thumbnail} alt={track.title} className='object-cover' />
            </div>
          </div>
        <div className="flex flex-col overflow-hidden">
          <label className="text-xl font-bold truncate">{track.title}</label>
          <label className="text-sm truncate">{track.uploader}</label>
        </div>
      </div>
    );
  }
);
