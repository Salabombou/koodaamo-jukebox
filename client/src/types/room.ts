export interface RoomInfo {
  roomCode: string;
  isPaused: boolean;
  isLooping: boolean;
  isShuffled: boolean;
  currentTrackIndex: number;
  playingSince: number;
}
