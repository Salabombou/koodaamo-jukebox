import React, { forwardRef, useEffect, useState, useRef } from 'react';

import { faCopy, faPlus, faTrashCan } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';

import ActionConfirmationModal from './ActionConfirmationModal';

interface QueueContextMenuProps {
  coordinates: { x: number; y: number } | null;
  onClose: () => void;

  onCopyUrl: () => void;
  onAdd: (query: string, position: 'next' | number) => void;
  onRemove: () => void;
}

export default forwardRef<HTMLUListElement, QueueContextMenuProps>(({ coordinates, onClose }, ref) => {
  const actionConfirmationModal = useRef<HTMLDialogElement>(null);
  
  const [unlockClearQueue, setUnlockClearQueue] = useState(false);

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!ref || !('current' in ref) || !ref.current) return;

    const abortController = new AbortController();

    let acceptClick = false;

    document.addEventListener('mousedown', (e) => {
      acceptClick = !ref.current?.contains(e.target as Node);
    });

    document.addEventListener(
      'click',
      (e) => {
        if (!ref.current?.contains(e.target as Node) && acceptClick) {
          onClose();
        }
      },
      { signal: abortController.signal }
    );

    ref.current.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      onClose();
    });

    return () => {
      abortController.abort();
    };
  }, []);

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (coordinates) {
      timeoutRef.current = setTimeout(() => {
        setUnlockClearQueue(true);
      }, 1000);
    } else {
      setUnlockClearQueue(false);
    }
  }, [coordinates]);

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
            console.log('Copy URL');
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
            console.log('Add to queue (next)');
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
            console.log('Add to queue (end)');
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
            console.log('Remove from queue');
            onClose();
          }}
        >
          <FontAwesomeIcon icon={faTrashCan} />
          <label>Remove from Queue</label>
        </a>
      </li>
      <li>
        <a
          className={`${!unlockClearQueue ? 'text-gray-700' : 'text-red-700'}`}
          onMouseDownCapture={(e) => e.preventDefault()}
          onClick={() => {
            if (!unlockClearQueue) return;
            actionConfirmationModal.current?.showModal();
            onClose();
          }}
        >
          <FontAwesomeIcon icon={faTrashCan} />
          <label>Clear Queue</label>
        </a>
      </li>
      <ActionConfirmationModal
          ref={actionConfirmationModal}
          title='Clear Queue'
          description='Are you sure you want to clear the queue?'
          onConfirm={() => {
            // Clear queue
            console.log('Clear queue');
            onClose();
          }}
          onCancel={() => {
            onClose();
          }}
        />
    </ul>
  );
});
