export interface QueueItem {
  id: number;
  track_id: string;
  index: number;
  shuffled_index?: number | null;
  is_deleted: boolean;
  created_at: number;
  updated_at: number;
}
