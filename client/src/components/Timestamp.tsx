interface TimestampProps {
  timestamp: number;
}

export default function Timestamp({ timestamp }: TimestampProps) {
  return (
    <>
      {timestamp >= 3600 && (
        <>
          <span>
            {Math.floor(timestamp / 3600)
              .toString()
              .padStart(2, "0")}
          </span>
          <span>:</span>
        </>
      )}
      <span>
        {Math.floor((timestamp % 3600) / 60)
          .toString()
          .padStart(2, "0")}
      </span>
      <span>:</span>
      <span>
        {Math.floor(timestamp % 60)
          .toString()
          .padStart(2, "0")}
      </span>
    </>
  );
}
