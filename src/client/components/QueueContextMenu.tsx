import React, { forwardRef, useEffect, useState } from 'react';

import { faCopy, faPlus, faTrashCan } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

interface QueueContextMenuProps {
  coordinates: { x: number; y: number } | null;
  onClose: () => void;

  onCopyUrl: () => void;
  onRemove: () => void;
  onAdd: (query: string, position: 'next' | 'end') => void;
}

export default forwardRef<HTMLUListElement, QueueContextMenuProps>(({ coordinates, onClose }, ref) => {
  useEffect(() => {
    if (!ref || !('current' in ref) || !ref.current) return;
    
    const abortController = new AbortController();

    let acceptClick = false;

    document.addEventListener('mousedown', (e) => {
      acceptClick = !ref.current?.contains(e.target as Node);
    });

    document.addEventListener('click', (e) => {
      if (!ref.current?.contains(e.target as Node) && acceptClick) {
        onClose();
      }
    }, { signal: abortController.signal });

    ref.current.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      onClose();
    });

    return () => {
      abortController.abort();
    };
  }, []);

  return (
    <ul
      ref={ref}
      className="absolute z-50 menu bg-base-100 rounded-box w-56"
      style={{
        top: coordinates?.y,
        left: coordinates?.x,
        visibility: coordinates ? 'visible' : 'hidden'
      }}
    >
      <li>
        <a
          onMouseDownCapture={(e) => e.preventDefault()}
          onClick={() => {
            //navigator.clipboard.writeText(window.location.href);
            onClose();
          }}
        >
          <FontAwesomeIcon icon={faCopy} />
          <label>Copy URL</label>
        </a>
      </li>
      <li>
        <a
          className="text-green-400"
          onMouseDownCapture={(e) => e.preventDefault()}
          onClick={() => {
            // Add to queue (next)
            onClose();
          }}
        >
          <FontAwesomeIcon icon={faPlus} />
          <label>Add to Queue (Next)</label>
        </a>
      </li>
      <li>
        <a
          className="text-green-400"
          onMouseDownCapture={(e) => e.preventDefault()}
          onClick={() => {
            // Add to queue (end)
            onClose();
          }}
        >
          <FontAwesomeIcon icon={faPlus} />
          <label>Add to Queue (End)</label>
        </a>
      </li>
      <li>
        <a
          className="text-red-500"
          onMouseDownCapture={(e) => e.preventDefault()}
          onClick={() => {
            // Remove from queue
            onClose();
          }}
        >
          <FontAwesomeIcon icon={faTrashCan} />
          <label>Remove from Queue</label>
        </a>
      </li>
    </ul>
  );
});
