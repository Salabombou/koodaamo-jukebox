import axios from "axios";

import { LS_KEY_AUTH_TOKEN, LS_KEY_IS_EMBEDDED, TIME_SYNC_INTERVAL, TIME_SYNC_SAMPLE_DELAY_MS, TIME_SYNC_SAMPLES } from "../constants";

let serverTimeOffset: number | null = null;
let lastSyncTime: number | null = null;

interface TimeSample {
  offset: number;
  rtt: number;
  delay: number;
}

async function performTimeSample(): Promise<TimeSample> {
  const isEmbedded = !!localStorage.getItem(LS_KEY_IS_EMBEDDED);

  const clientSend = performance.now();
  const response = await axios.get(`${isEmbedded ? "/.proxy" : ""}/api/time`, {
    headers: {
      Authorization: `Bearer ${localStorage.getItem(LS_KEY_AUTH_TOKEN)}`,
    },
  });
  const clientReceive = performance.now();
  const serverUnix = response.data.unix_timestamp;

  const rtt = clientReceive - clientSend;
  const delay = rtt / 2;

  // Convert performance.now() timestamps to Date.now() equivalent
  const now = Date.now();
  const performanceToDateOffset = now - performance.now();
  const clientReceiveDate = clientReceive + performanceToDateOffset;

  // Calculate offset: server time at receive minus client time at receive
  const estimatedServerTimeAtReceive = serverUnix + delay;
  const offset = estimatedServerTimeAtReceive - clientReceiveDate;

  return { offset, rtt, delay };
}

function calculateMedian(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function removeOutliers(samples: TimeSample[]): TimeSample[] {
  if (samples.length < 3) return samples;

  // Remove samples with RTT outliers (beyond 1.5 * IQR)
  const rtts = samples.map((s) => s.rtt).sort((a, b) => a - b);
  const q1 = rtts[Math.floor(rtts.length * 0.25)];
  const q3 = rtts[Math.floor(rtts.length * 0.75)];
  const iqr = q3 - q1;
  const rttThreshold = q3 + 1.5 * iqr;

  return samples.filter((s) => s.rtt <= rttThreshold);
}

/**
 * Synchronize local time with the server clock using multiple round‑trip samples.
 * Stores a calculated offset (server - client) so subsequent calls to getServerNow()
 * return a server‑aligned timestamp without continuous network calls.
 * Uses median of lowest‑RTT samples after outlier removal for stability.
 * @param isEmbedded Whether the client runs inside the embedded Discord context (affects base URL).
 */
export async function syncServerTime() {
  const numSamples = TIME_SYNC_SAMPLES; // number of samples (configurable)
  const samples: TimeSample[] = [];

  console.log("Starting time synchronization with", numSamples, "samples...");

  // Collect multiple samples with shorter delay
  for (let i = 0; i < numSamples; i++) {
    try {
      const sample = await performTimeSample();
      samples.push(sample);
      console.log(`Sample ${i + 1}: offset=${sample.offset.toFixed(2)}ms, rtt=${sample.rtt.toFixed(2)}ms`);

      // Shorter delay between samples
      if (i < numSamples - 1) {
        await new Promise((resolve) => setTimeout(resolve, TIME_SYNC_SAMPLE_DELAY_MS));
      }
    } catch (error) {
      console.warn(`Time sample ${i + 1} failed:`, error);
    }
  }

  if (samples.length === 0) {
    console.error("No successful time samples collected");
    lastSyncTime = null;
    return;
  }

  // Remove outliers
  const filteredSamples = removeOutliers(samples);
  console.log(`Using ${filteredSamples.length} of ${samples.length} samples after outlier removal`);

  if (filteredSamples.length === 0) {
    console.warn("All samples were outliers, using original samples");
    filteredSamples.push(...samples);
  }

  // Use median offset from samples with lowest RTT for best accuracy
  const bestSamples = filteredSamples.sort((a, b) => a.rtt - b.rtt).slice(0, Math.max(1, Math.floor(filteredSamples.length / 2)));

  const finalOffset = calculateMedian(bestSamples.map((s) => s.offset));

  serverTimeOffset = finalOffset;

  const avgRtt = bestSamples.reduce((sum, s) => sum + s.rtt, 0) / bestSamples.length;
  console.log(`Server time offset set to: ${finalOffset.toFixed(2)}ms (avg RTT: ${avgRtt.toFixed(2)}ms)`);
}

/**
 * Return an adjusted timestamp approximating current server time (ms Unix epoch).
 * Falls back to Date.now() if synchronization hasn't occurred yet.
 */
export function getServerNow(): number {
  if (serverTimeOffset === null) {
    return Date.now();
  }
  if (Date.now() - (lastSyncTime || 0) > TIME_SYNC_INTERVAL) {
    lastSyncTime = Date.now();
    syncServerTime().catch(() => {
      lastSyncTime = null;
    });
  }
  return Date.now() + serverTimeOffset;
}
