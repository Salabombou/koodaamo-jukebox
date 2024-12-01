import React, { useRef, useState } from 'react';

import { v4 as uuid } from 'uuid';

import type { TClientVideo } from '../shared/types/video';
import MusicPlayerCard from './components/MusicPlayerCard';
import QueueKanban from './components/QueueKanban';
import VolumeSlider from './components/VolumeSlider';

export default function App() {
  const tracks = useRef<Map<string, TClientVideo>>(
    new Map([
      [
        '',
        {
          videoId: '',
          title: '',
          duration: 0,
          uploader: '',
          thumbnail: ''
        }
      ],
      [
        'R6XDAC55iss',
        {
          videoId: 'R6XDAC55iss',
          title: 'Peacemaker',
          duration: 204,
          uploader: 'Green Day',
          thumbnail:
            'https://lh3.googleusercontent.com/FnRYR-BT3RONNVBVF0Ws8IzCnzZYu7qbulZ3LL99NadPK8kEK_dvyldmJEGg_DZpJ0UsKoqwALI8SEz6=w544-h544-l90-rj'
        }
      ]
    ])
  );

  const [queue, setQueue] = useState<TClientVideo['videoId'][]>(Array.from({ length: 3000 }).map(() => 'R6XDAC55iss'));

  return (
    <div className="flex items-center h-screen ml-4">
      <div className="flex items-center justify-start h-full w-full space-x-4">
        <MusicPlayerCard
          video={{
            videoId: 'R6XDAC55iss',
            title: 'Peacemaker',
            duration: 204,
            uploader: 'Green Day',
            thumbnail:
              'https://lh3.googleusercontent.com/FnRYR-BT3RONNVBVF0Ws8IzCnzZYu7qbulZ3LL99NadPK8kEK_dvyldmJEGg_DZpJ0UsKoqwALI8SEz6=w544-h544-l90-rj'
          }}
        />
        <QueueKanban
          queue={queue}
          tracks={tracks.current}
          currentTrack={2}
          onMove={(oldIndex, newIndex) => {
            // move item at oldIndex to newIndex
            const newQueue = [...queue];
            const [removed] = newQueue.splice(oldIndex, 1);
            if (typeof removed === 'undefined') return;
            newQueue.splice(newIndex, 0, removed);
            setQueue(newQueue);
          }}
          onRemove={(index) => {
            // remove item at index
            const newQueue = [...queue];
            newQueue.splice(index, 1);
            setQueue(newQueue);
          }}
          onAdd={(videoId, next) => {
            // add item to the end of the queue
            setQueue([...queue, videoId]);
          }}
        />
      </div>
    </div>
  );
}
