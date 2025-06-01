/**
 * Represents the names of events that can occur in a room.
 *
 * Possible values:
 * - `"PauseResume"`: Pause or resume the current track.
 * - `"Seek"`: Seek to a specific timestamp in the current track.
 * - `"Skip"`: Skip to a track in the queue.
 * - `"ShuffleToggle"`: Toggle shuffling of the queue.
 * - `"LoopToggle"`: Toggle looping of the current track.
 * - `"QueueChange"`: Notify about a change in the queue (e.g., track added, removed, moved, etc.).
 */
export type QueueEventName =
  | "PauseResume"
  | "Seek"
  | "Skip"
  | "ShuffleToggle"
  | "LoopToggle"
  | "QueueChange";

/**
 * Base event data for all room events.
 * @property {number} sentAt - Timestamp when the event was sent.
 */
export interface QueueBaseEventData {
  sentAt: number;
}

/**
 * Event data for pause or resume actions.
 * @property {boolean} paused - Indicates whether the track is paused or resumed.
 */
export interface QueuePauseResumeEventData {
  paused: boolean;
}

/**
 * Event data for seeking to a specific timestamp.
 * @property {number} timestamp - Timestamp to seek to.
 */
export interface QueueSeekEventData {
  timestamp: number;
}

/**
 * Event data for skipping to a track in the queue.
 * @property {number} index - Index of the track to skip to in the queue.
 */
export interface QueueSkipEventData {
  index: number;
}

/**
 * Event data for toggling the loop state of the current track.
 * @property {boolean} looping - Indicates whether looping is enabled or disabled.
 */
export interface QueueLoopToggleEventData {
  looping: boolean;
}

/**
 * Event data for queue changes.
 * (No additional properties.)
 */
export interface QueueQueueChangeEventData {}

export interface QueueInfo {
  instanceId: string;
  isPaused: boolean;
  isLooping: boolean;
  shuffleSeed: number;
  currentTrackIndex: number;
  playingSince: number;
}

export interface QueueItem {
  id: number;
  trackId: string;
  index: number;
  isDeleted: boolean;
}
