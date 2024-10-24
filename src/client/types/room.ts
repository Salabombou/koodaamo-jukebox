export type TRoomInfo = {
  src: string;
  timestamp: number;
  users: Map<
    string,
    {
      ready: boolean;
      avatar: string | null;
    }
  >;
  ready: boolean;
  host: string;
  isHost: boolean;
  playing: boolean;
};
