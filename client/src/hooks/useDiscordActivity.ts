import { useEffect, useRef } from "react";

import type { Track } from "../types/track";

import { useDiscordSDK } from "./useDiscordSDK";

interface UseDiscordActivityProps {
  isReady: boolean;
  currentTrack: Track | null;
  duration: number;
  playingSince: number | null;
}

export default function useDiscordActivity({ isReady, currentTrack, duration, playingSince }: UseDiscordActivityProps) {
  const discordSDK = useDiscordSDK();

  const users = useRef<Set<string>>(new Set(discordSDK.clientId));

  useEffect(() => {
    if (!isReady) return;
    if (!currentTrack) return;
    if (typeof playingSince !== "number") return;
    if (duration <= 0) return;

    // Set Discord activity
    const startTime = playingSince;
    const endTime = startTime + duration * 1000;

    discordSDK.commands
      .setActivity({
        activity: {
          type: 2, // ActivityType.LISTENING
          details: currentTrack.title,
          state: currentTrack.uploader,
          assets: {
            large_image: `${window.location.origin}${discordSDK.isEmbedded ? "/.proxy" : ""}/api/track/${currentTrack.id}/thumbnail-high`,
            small_text: !discordSDK.isEmbedded ? `Room Code: ${discordSDK.instanceId}` : undefined,
          },
          timestamps: {
            start: startTime,
            end: endTime,
          },
          party: discordSDK.isEmbedded
            ? {
                id: discordSDK.instanceId,
                size: [users.current.size, 99],
              }
            : {},
        },
      })
      .catch((error: unknown) => {
        console.error("Failed to set Discord activity:", error);
      });
  }, [currentTrack, playingSince, duration, discordSDK, isReady]);

  useEffect(() => {
    const handleParticipantsUpdate = (event: { participants: Array<{ id: string }> }) => {
      users.current = new Set(event.participants.map((p) => p.id));
    };
    if (discordSDK.isEmbedded) {
      discordSDK.subscribe("ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE", handleParticipantsUpdate);
    }
    return () => {
      if (discordSDK.isEmbedded) {
        discordSDK.unsubscribe("ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE", handleParticipantsUpdate);
      }
    };
  }, [discordSDK]);
}
