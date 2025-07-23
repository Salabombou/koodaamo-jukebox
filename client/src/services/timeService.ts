import axios from "axios";

let serverTimeOffset: number | null = null;

interface TimeSample {
  offset: number;
  rtt: number;
  delay: number;
}

async function performTimeSample(isEmbedded: boolean): Promise<TimeSample> {
  const clientSend = performance.now();
  const response = await axios.get(`${isEmbedded ? "/.proxy" : ""}/api/time`, {
    headers: {
      Authorization: `Bearer ${localStorage.getItem("auth_token")}`,
    }
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
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function removeOutliers(samples: TimeSample[]): TimeSample[] {
  if (samples.length < 3) return samples;
  
  // Remove samples with RTT outliers (beyond 1.5 * IQR)
  const rtts = samples.map(s => s.rtt).sort((a, b) => a - b);
  const q1 = rtts[Math.floor(rtts.length * 0.25)];
  const q3 = rtts[Math.floor(rtts.length * 0.75)];
  const iqr = q3 - q1;
  const rttThreshold = q3 + 1.5 * iqr;
  
  return samples.filter(s => s.rtt <= rttThreshold);
}

export async function syncServerTime(isEmbedded: boolean) {
  const numSamples = 8;
  const samples: TimeSample[] = [];
  
  console.log("Starting time synchronization with", numSamples, "samples...");
  
  // Collect multiple samples
  for (let i = 0; i < numSamples; i++) {
    try {
      const sample = await performTimeSample(isEmbedded);
      samples.push(sample);
      console.log(`Sample ${i + 1}: offset=${sample.offset.toFixed(2)}ms, rtt=${sample.rtt.toFixed(2)}ms`);
      
      // Small delay between samples to avoid overwhelming the server
      if (i < numSamples - 1) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    } catch (error) {
      console.warn(`Time sample ${i + 1} failed:`, error);
    }
  }
  
  if (samples.length === 0) {
    console.error("No successful time samples collected");
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
  const bestSamples = filteredSamples
    .sort((a, b) => a.rtt - b.rtt)
    .slice(0, Math.max(1, Math.floor(filteredSamples.length / 2)));
  
  const finalOffset = calculateMedian(bestSamples.map(s => s.offset));
  
  serverTimeOffset = finalOffset;
  
  const avgRtt = bestSamples.reduce((sum, s) => sum + s.rtt, 0) / bestSamples.length;
  console.log(`Server time offset set to: ${finalOffset.toFixed(2)}ms (avg RTT: ${avgRtt.toFixed(2)}ms)`);
}

export function getServerNow(): number {
  if (serverTimeOffset === null) {
    // fallback to client time
    return Date.now();
  }
  return Date.now() + serverTimeOffset;
}
