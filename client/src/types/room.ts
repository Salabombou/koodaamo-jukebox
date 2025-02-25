export interface RoomInfo {
  room_code: string;
  is_paused: boolean;
  is_looping: boolean;
  is_shuffled: boolean;
  current_track: {
    index: number | null;
    id: string | null;
  };
  playing_since: number | null;
}
