import * as signalR from "@microsoft/signalr";
import { act, renderHook } from "@testing-library/react";

import type { QueueItem } from "../../types/queue";
import type { RoomInfo } from "../../types/room";
import useRoomHub from "../useRoomHub";

// Mock dependencies
jest.mock("@microsoft/signalr");
jest.mock("../useDiscordSDK", () => ({
  useDiscordSDK: () => ({ isEmbedded: false }),
}));
jest.mock("../../services/shuffleService", () => ({
  shuffle: (items: QueueItem[]) => [...items].reverse(),
}));
jest.mock("../../services/timeService", () => ({
  getServerNow: () => Date.now(),
}));

const mockQueueItems: QueueItem[] = [
  { id: 1, track_id: "track1-hash", index: 0, shuffled_index: null, is_deleted: false, created_at: Date.now(), updated_at: Date.now() },
  { id: 2, track_id: "track2-hash", index: 1, shuffled_index: null, is_deleted: false, created_at: Date.now(), updated_at: Date.now() },
  { id: 3, track_id: "track3-hash", index: 2, shuffled_index: null, is_deleted: false, created_at: Date.now(), updated_at: Date.now() },
  { id: 4, track_id: "track4-hash", index: 3, shuffled_index: null, is_deleted: false, created_at: Date.now(), updated_at: Date.now() },
  { id: 5, track_id: "track5-hash", index: 4, shuffled_index: null, is_deleted: false, created_at: Date.now(), updated_at: Date.now() },
];

const mockRoomInfo: RoomInfo = {
  room_code: "test-room",
  is_paused: true,
  is_looping: false,
  is_shuffled: false,
  playing_since: null,
  current_item: {
    index: 0,
    shuffle_index: null,
    id: 1,
    track_id: "track1-hash",
  },
};

describe("useRoomHub", () => {
  let mockConnection: {
    state: signalR.HubConnectionState;
    start: jest.Mock;
    stop: jest.Mock;
    invoke: jest.Mock;
    on: jest.Mock;
    off: jest.Mock;
  };
  let mockHubConnectionBuilder: {
    withUrl: jest.Mock;
    withAutomaticReconnect: jest.Mock;
    withHubProtocol: jest.Mock;
    configureLogging: jest.Mock;
    build: jest.Mock;
  };

  beforeEach(() => {
    // Mock localStorage
    Object.defineProperty(window, "localStorage", {
      value: {
        getItem: jest.fn(() => "mock-token"),
        setItem: jest.fn(),
        removeItem: jest.fn(),
      },
      writable: true,
    });

    // Mock SignalR
    mockConnection = {
      state: signalR.HubConnectionState.Connected,
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn(),
      invoke: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
      off: jest.fn(),
    };

    mockHubConnectionBuilder = {
      withUrl: jest.fn().mockReturnThis(),
      withAutomaticReconnect: jest.fn().mockReturnThis(),
      withHubProtocol: jest.fn().mockReturnThis(),
      configureLogging: jest.fn().mockReturnThis(),
      build: jest.fn().mockReturnValue(mockConnection),
    };

    (signalR.HubConnectionBuilder as jest.Mock).mockReturnValue(mockHubConnectionBuilder);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should initialize with default state", () => {
    const { result } = renderHook(() => useRoomHub());

    expect(result.current.isPaused).toBeNull();
    expect(result.current.isLooping).toBeNull();
    expect(result.current.isShuffled).toBeNull();
    expect(result.current.queueItems.size).toBe(0);
  });

  it("should handle RoomInfo event", () => {
    const { result } = renderHook(() => useRoomHub());

    act(() => {
      // Simulate RoomInfo event
      const roomInfoCallback = mockConnection.on.mock.calls.find((call) => call[0] === "RoomInfo")?.[1];
      if (roomInfoCallback) {
        roomInfoCallback(mockRoomInfo, mockQueueItems);
      }
    });

    expect(result.current.isPaused).toBe(true);
    expect(result.current.isLooping).toBe(false);
    expect(result.current.isShuffled).toBe(false);
    expect(result.current.currentItemId).toBe(1);
    expect(result.current.queueItems.size).toBe(5);
  });

  it("should handle PauseToggled event", () => {
    const { result } = renderHook(() => useRoomHub());

    act(() => {
      const roomInfoCallback = mockConnection.on.mock.calls.find((call) => call[0] === "RoomInfo")?.[1];
      if (roomInfoCallback) {
        roomInfoCallback(mockRoomInfo, mockQueueItems);
      }
    });

    act(() => {
      const pauseCallback = mockConnection.on.mock.calls.find((call) => call[0] === "PauseToggled")?.[1];
      if (pauseCallback) {
        pauseCallback({ is_paused: false, playing_since: 1000 });
      }
    });

    expect(result.current.isPaused).toBe(false);
    expect(result.current.playingSince).toBe(1000);
  });

  it("should handle LoopToggled event", () => {
    const { result } = renderHook(() => useRoomHub());

    act(() => {
      const roomInfoCallback = mockConnection.on.mock.calls.find((call) => call[0] === "RoomInfo")?.[1];
      if (roomInfoCallback) {
        roomInfoCallback(mockRoomInfo, mockQueueItems);
      }
    });

    act(() => {
      const loopCallback = mockConnection.on.mock.calls.find((call) => call[0] === "LoopToggled")?.[1];
      if (loopCallback) {
        loopCallback({ is_looping: true });
      }
    });

    expect(result.current.isLooping).toBe(true);
  });

  it("should handle ShuffleToggled event", () => {
    const { result } = renderHook(() => useRoomHub());

    act(() => {
      const roomInfoCallback = mockConnection.on.mock.calls.find((call) => call[0] === "RoomInfo")?.[1];
      if (roomInfoCallback) {
        roomInfoCallback(mockRoomInfo, mockQueueItems);
      }
    });

    act(() => {
      const shuffleCallback = mockConnection.on.mock.calls.find((call) => call[0] === "ShuffleToggled")?.[1];
      if (shuffleCallback) {
        shuffleCallback({
          is_shuffled: true,
          seed: 123,
          current_item_index: 0,
          current_item_shuffle_index: 0,
          current_item_id: 1,
          current_item_track_id: "track1-hash",
        });
      }
    });

    expect(result.current.isShuffled).toBe(true);
    expect(result.current.currentItemShuffleIndex).toBe(0);
  });

  it("should handle TrackSeeked event", () => {
    const { result } = renderHook(() => useRoomHub());

    act(() => {
      const roomInfoCallback = mockConnection.on.mock.calls.find((call) => call[0] === "RoomInfo")?.[1];
      if (roomInfoCallback) {
        roomInfoCallback(mockRoomInfo, mockQueueItems);
      }
    });

    act(() => {
      const seekCallback = mockConnection.on.mock.calls.find((call) => call[0] === "TrackSeeked")?.[1];
      if (seekCallback) {
        seekCallback({ playing_since: 2000 });
      }
    });

    expect(result.current.playingSince).toBe(2000);
  });

  it("should handle TrackSkipped event", () => {
    const { result } = renderHook(() => useRoomHub());

    act(() => {
      const roomInfoCallback = mockConnection.on.mock.calls.find((call) => call[0] === "RoomInfo")?.[1];
      if (roomInfoCallback) {
        roomInfoCallback(mockRoomInfo, mockQueueItems);
      }
    });

    act(() => {
      const skipCallback = mockConnection.on.mock.calls.find((call) => call[0] === "TrackSkipped")?.[1];
      if (skipCallback) {
        skipCallback({
          current_item_index: 2,
          current_item_shuffle_index: null,
          current_item_id: 3,
          current_item_track_id: "track3-hash",
        });
      }
    });

    expect(result.current.currentItemIndex).toBe(2);
    expect(result.current.currentItemId).toBe(3);
    expect(result.current.playingSince).toBeNull();
  });

  it("should handle QueueMoved event", () => {
    const { result } = renderHook(() => useRoomHub());

    act(() => {
      const roomInfoCallback = mockConnection.on.mock.calls.find((call) => call[0] === "RoomInfo")?.[1];
      if (roomInfoCallback) {
        roomInfoCallback(mockRoomInfo, mockQueueItems);
      }
    });

    act(() => {
      const moveCallback = mockConnection.on.mock.calls.find((call) => call[0] === "QueueMoved")?.[1];
      if (moveCallback) {
        moveCallback({
          from: 0,
          to: 2,
          current_item_index: 2,
          current_item_shuffle_index: null,
          current_item_id: 3,
          current_item_track_id: "track3-hash",
        });
      }
    });

    const queueList = result.current.queueList;
    expect(queueList[0].track_id).toBe("track2-hash");
    expect(queueList[2].track_id).toBe("track1-hash");
  });

  it("should handle QueueCleared event", () => {
    const { result } = renderHook(() => useRoomHub());

    act(() => {
      const roomInfoCallback = mockConnection.on.mock.calls.find((call) => call[0] === "RoomInfo")?.[1];
      if (roomInfoCallback) {
        roomInfoCallback(mockRoomInfo, mockQueueItems);
      }
    });

    act(() => {
      const clearCallback = mockConnection.on.mock.calls.find((call) => call[0] === "QueueCleared")?.[1];
      if (clearCallback) {
        clearCallback({ current_item_id: 1 });
      }
    });

    expect(result.current.queueItems.size).toBe(1);
    expect(result.current.queueItems.get(1)?.index).toBe(0);
  });

  it("should handle QueueDeleted event", () => {
    const { result } = renderHook(() => useRoomHub());

    act(() => {
      const roomInfoCallback = mockConnection.on.mock.calls.find((call) => call[0] === "RoomInfo")?.[1];
      if (roomInfoCallback) {
        roomInfoCallback(mockRoomInfo, mockQueueItems);
      }
    });

    act(() => {
      const deleteCallback = mockConnection.on.mock.calls.find((call) => call[0] === "QueueDeleted")?.[1];
      if (deleteCallback) {
        deleteCallback({
          deleted_item_id: 2,
          current_item_index: 0,
          current_item_shuffle_index: null,
          current_item_id: 1,
          current_item_track_id: "track1-hash",
        });
      }
    });

    expect(result.current.queueItems.size).toBe(4);
    expect(result.current.queueItems.has(2)).toBe(false);
  });

  it("should maintain consistency after complex operations", () => {
    const { result } = renderHook(() => useRoomHub());

    act(() => {
      const roomInfoCallback = mockConnection.on.mock.calls.find((call) => call[0] === "RoomInfo")?.[1];
      if (roomInfoCallback) {
        roomInfoCallback(mockRoomInfo, mockQueueItems);
      }
    });

    // Perform a series of operations
    act(() => {
      const skipCallback = mockConnection.on.mock.calls.find((call) => call[0] === "TrackSkipped")?.[1];
      if (skipCallback) {
        skipCallback({
          current_item_index: 1,
          current_item_shuffle_index: null,
          current_item_id: 2,
          current_item_track_id: "track2-hash",
        });
      }
    });

    act(() => {
      const pauseCallback = mockConnection.on.mock.calls.find((call) => call[0] === "PauseToggled")?.[1];
      if (pauseCallback) {
        pauseCallback({ is_paused: true, playing_since: null });
      }
    });

    act(() => {
      const moveCallback = mockConnection.on.mock.calls.find((call) => call[0] === "QueueMoved")?.[1];
      if (moveCallback) {
        moveCallback({
          from: 2,
          to: 0,
          current_item_index: 1,
          current_item_shuffle_index: null,
          current_item_id: 2,
          current_item_track_id: "track2-hash",
        });
      }
    });

    act(() => {
      const shuffleCallback = mockConnection.on.mock.calls.find((call) => call[0] === "ShuffleToggled")?.[1];
      if (shuffleCallback) {
        shuffleCallback({
          is_shuffled: true,
          seed: 456,
          current_item_index: 1,
          current_item_shuffle_index: 1,
          current_item_id: 2,
          current_item_track_id: "track2-hash",
        });
      }
    });

    act(() => {
      const loopCallback = mockConnection.on.mock.calls.find((call) => call[0] === "LoopToggled")?.[1];
      if (loopCallback) {
        loopCallback({ is_looping: true });
      }
    });

    act(() => {
      const seekCallback = mockConnection.on.mock.calls.find((call) => call[0] === "TrackSeeked")?.[1];
      if (seekCallback) {
        seekCallback({ playing_since: 3000 });
      }
    });

    act(() => {
      const deleteCallback = mockConnection.on.mock.calls.find((call) => call[0] === "QueueDeleted")?.[1];
      if (deleteCallback) {
        deleteCallback({
          deleted_item_id: 3,
          current_item_index: 1,
          current_item_shuffle_index: 1,
          current_item_id: 2,
          current_item_track_id: "track2-hash",
        });
      }
    });

    // Assert final state consistency
    expect(result.current.isShuffled).toBe(true);
    expect(result.current.isLooping).toBe(true);
    expect(result.current.isPaused).toBe(true);
    expect(result.current.playingSince).toBe(3000);
    expect(result.current.currentItemId).toBe(2);
    expect(result.current.queueItems.size).toBe(4);
    expect(result.current.queueItems.has(3)).toBe(false);
  });
});
