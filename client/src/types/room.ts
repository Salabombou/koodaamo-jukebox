export interface RoomInfo {
  instanceId: string;
  isPaused: boolean;
  isLooping: boolean;
  isShuffled: boolean;
  currentTrackIndex: number;
  playingSince: number;
}
