import React, { type ReactNode, createContext, useContext, useEffect, useRef, useState } from 'react';

import { useDiscordAuth } from './useDiscordAuth.tsx';
import { useDiscordSDK } from './useDiscordSdk.tsx';

const RoomContext = createContext<WebSocket | null>(null);

export function useRoom() {
  return useContext(RoomContext)!;
}

export function RoomProvider({ children }: { children: ReactNode }) {
  const setupRoom = () => {
    const pathname = `${discordSdk.isEmbedded ? '/.proxy' : ''}/api/room/${discordSdk.instanceId}`;

    const url = new URL(location.href);
    url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = pathname;

    console.log(url.toString());

    const room = new WebSocket(url, [discordAuth.user.id, discordAuth.access_token]);

    let timeout: NodeJS.Timeout | null = null;
    let pingInterval: NodeJS.Timeout | null = null;

    room.onopen = () => {
      console.log('Connected to room');

      timeout = setTimeout(() => {
        setRoom(room);
        pingInterval = setInterval(() => {
          room.send('ping');
        }, 5000);
        reconnectAttempts.current = 0;
      }, 1000);
    };

    room.onclose = (event) => {
      console.log('Disconnected from room', event.code, event.reason);

      if (timeout) {
        clearTimeout(timeout);
      }

      if (pingInterval) {
        clearInterval(pingInterval);
      }

      /*if (event.code === ERoomCloseCode.DuplicateConnection) {
        console.log('Duplicate connection');
        return;
      }*/

      if (event.code === 1008) {
        sessionStorage.removeItem('mock_user_id');
        sessionStorage.removeItem('mock_access_token');
        window.location.reload();
      }

      if (reconnectAttempts.current < maxReconnectAttempts) {
        reconnectAttempts.current++;
        setTimeout(() => setupRoom(), 1000);
      } else {
        console.log('Failed to reconnect');
      }
    };

    room.onerror = (error) => {
      console.error('Room error', error);
    };
  };

  const [room, setRoom] = useState<WebSocket | null>(null);

  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;

  const discordSdk = useDiscordSDK();
  const discordAuth = useDiscordAuth();

  const settingUp = useRef(false);
  useEffect(() => {
    if (!settingUp.current) {
      settingUp.current = true;
      setupRoom();
    }

    return () => {
      if (room) {
        room.close();
      }
    };
  }, [discordSdk, discordAuth]);

  if (room === null) {
    return <p>Joining room...</p>;
  }

  return <RoomContext.Provider value={room}>{children}</RoomContext.Provider>;
}
