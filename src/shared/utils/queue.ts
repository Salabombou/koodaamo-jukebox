import seedrandom from 'seedrandom';

import type { TClientQueue } from '../types/queue.ts';
import type { TClientTrack } from '../types/track.ts';

export function shuffle(queue: TClientQueue, seed: string) {
  if (queue.currentIndex === null) {
    throw new Error('No current track');
  }

  const currentTrack = queue.playlist[queue.currentIndex];
  if (!currentTrack) {
    throw new Error('Current track not found');
  }

  queue.playlist.splice(queue.currentIndex, 1);

  const rng = seedrandom(seed);

  for (let i = queue.playlist.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));

    const temp = queue.playlist[i]!;
    queue.playlist[i] = queue.playlist[j]!;
    queue.playlist[j] = temp;
  }

  queue.playlist.unshift(currentTrack);
  queue.currentIndex = 0;
}

export function move(queue: TClientQueue, from: number, to: number) {
  if (from < 0 || from >= queue.playlist.length) {
    throw new Error('Invalid from index');
  }

  if (to < 0 || to >= queue.playlist.length) {
    throw new Error('Invalid to index');
  }

  const [track] = queue.playlist.splice(from, 1);
  queue.playlist.splice(to, 0, track!);
}

export function remove(queue: TClientQueue, index: number) {
  if (index < 0 || index >= queue.playlist.length || index === queue.currentIndex) {
    throw new Error('Invalid index');
  }

  queue.playlist.splice(index, 1);
  if (queue.playlist.length === 0) {
    queue.currentIndex = null;
  }
}

export function clear(queue: TClientQueue) {
  if (queue.currentIndex !== null) {
    const currentTrack = queue.playlist[queue.currentIndex];
    if (currentTrack) {
      queue.playlist = [currentTrack];
      queue.currentIndex = 0;
      return;
    }
  }

  queue.playlist = [];
  queue.currentIndex = null;
}

export function add(queue: TClientQueue, ...tracks: TClientTrack[]) {
  const { playlist, tracks: queueTracks } = queue as TClientQueue & { tracks?: TClientQueue<true>['tracks'] };

  if (queueTracks) {
    for (const track of tracks) {
      queueTracks.set(track.videoId, track);
      playlist.push(track.videoId);
    }
  } else {
    playlist.push(...tracks.map((track) => track.videoId));
  }
}
