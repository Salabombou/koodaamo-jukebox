export interface RoomInfo {
  roomCode: string;
  isPaused: boolean;
  isLooping: boolean;
  isShuffled: boolean;
  currentTrack: {
    index: number | null;
    id: string | null;
  };
  playingSince: number | null;
}
