import React from 'react';

import MusicPlayerCard from './components/MusicPlayerCard';

import VolumeSlider from './components/VolumeSlider';

export default function App() {
  return (
    <div className="fixed h-full w-full">
      <div className="flex h-full w-full items-center justify-start">
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
      </div>
    </div>
  );
}
