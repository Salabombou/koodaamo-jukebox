import React, { useRef } from "react";

interface CodeInputProps {
  value: string;
  onChange: (value: string) => void;
  onRandom: () => void;
  onSet: () => void;
}

export const CodeInput: React.FC<CodeInputProps> = ({ value, onChange, onRandom, onSet }) => {
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const handleInput = (e: React.ChangeEvent<HTMLInputElement>, idx: number) => {
    const val = e.target.value.replace(/\D/g, "").slice(0, 1);
    const newValue = value.split("");
    newValue[idx] = val;
    onChange(newValue.join(""));
    if (val && idx < 5) inputs.current[idx + 1]?.focus();
  };
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, idx: number) => {
    if (e.key === "Backspace" && !value[idx] && idx > 0) inputs.current[idx - 1]?.focus();
  };
  return (
    <div className="flex flex-col items-center gap-6">
      <div className="flex gap-2 md:gap-4">
        {[...Array(6)].map((_, idx) => (
          <input
            key={idx}
            ref={(el) => {
              inputs.current[idx] = el;
            }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            className="input input-bordered text-4xl md:text-6xl w-12 md:w-20 text-center font-mono"
            value={value[idx] || ""}
            onChange={(e) => handleInput(e, idx)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
          />
        ))}
      </div>
      <div className="flex gap-4">
        <button className="btn btn-secondary" onClick={onRandom} type="button">
          Random
        </button>
        <button className="btn btn-primary" onClick={onSet} type="button" disabled={value.length !== 6 || !/^[0-9]{6}$/.test(value)}>
          Set Code
        </button>
      </div>
    </div>
  );
};
