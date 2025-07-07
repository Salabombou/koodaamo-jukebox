import axios from "axios";

let serverTimeOffset: number | null = null;

export async function syncServerTime(isEmbedded: boolean) {
  const clientSend = Date.now();
  const response = await axios.get(`${isEmbedded ? "/.proxy" : ""}/api/time`);
  const clientReceive = Date.now();
  const serverUnix = response.data.unix_timestamp;
  // Estimate RTT and offset
  const rtt = clientReceive - clientSend;
  const estimatedServerTime = serverUnix + rtt / 2;
  serverTimeOffset = estimatedServerTime - clientReceive;
  console.log("Server time offset set to:", serverTimeOffset);
}

export function getServerNow(): number {
  if (serverTimeOffset === null) {
    // fallback to client time
    return Date.now();
  }
  return Date.now() + serverTimeOffset;
}
