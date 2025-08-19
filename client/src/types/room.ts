import type { QueueItem } from "./queue";

export interface RoomInfo {
  room_code: string;
  is_paused: boolean;
  is_looping: boolean;
  is_shuffled: boolean;
  current_item: {
    index: number | null;
    shuffle_index: number | null;
    id: number | null;
    track_id: string | null;
  };
  playing_since: number | null;
}

// Base event interface
export interface RoomEvent {
  room_code: string;
  timestamp: number;
}

// Pause/Unpause event
export interface PauseToggledEvent extends RoomEvent {
  is_paused: boolean;
  playing_since: number | null;
}

// Loop toggle event
export interface LoopToggledEvent extends RoomEvent {
  is_looping: boolean;
}

// Shuffle toggle event
export interface ShuffleToggledEvent extends RoomEvent {
  is_shuffled: boolean;
  seed?: number | null; // Only set when enabling shuffle
  current_item_index: number | null;
  current_item_shuffle_index: number | null;
  current_item_id: number | null;
  current_item_track_id: string | null;
}

// Seek event
export interface TrackSeekedEvent extends RoomEvent {
  playing_since: number | null;
}

// Skip event
export interface TrackSkippedEvent extends RoomEvent {
  current_item_index: number | null;
  current_item_shuffle_index: number | null;
  current_item_id: number | null;
  current_item_track_id: string | null;
}

// Move event
export interface QueueMovedEvent extends RoomEvent {
  from: number;
  to: number;
  current_item_index: number | null;
  current_item_shuffle_index: number | null;
  current_item_id: number | null;
  current_item_track_id: string | null;
}

// Add event
export interface QueueAddedEvent extends RoomEvent {
  added_items: QueueItem[];
  current_item_index: number | null;
  current_item_shuffle_index: number | null;
  current_item_id: number | null;
  current_item_track_id: string | null;
}

// Clear event
export interface QueueClearedEvent extends RoomEvent {
  current_item_id: number;
}

// Delete event
export interface QueueDeletedEvent extends RoomEvent {
  deleted_item_id: number;
  current_item_index: number;
  current_item_shuffle_index: number | null;
}
