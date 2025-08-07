interface TimestampProps {
  timestamp: number;
}
export default function Timestamp({ timestamp }: TimestampProps) {
  return (
    <>
      {timestamp >= 3600 && (
        <>
          <span>{String(Math.floor(timestamp / 3600)).padStart(2, "0")}</span>
          <span>:</span>
        </>
      )}
      <span>{String(Math.floor((timestamp % 3600) / 60)).padStart(2, "0")}</span>
      <span>:</span>
      <span>{String(Math.floor(timestamp % 60)).padStart(2, "0")}</span>
    </>
  );
}
