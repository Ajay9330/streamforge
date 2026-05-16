export default function PlaybackModeSelector({
  activeMode,
  modes,
  onChange
}) {
  return (
    <div className="quality-stack">
      {modes.map((mode) => (
        <button
          className={`quality-chip${activeMode === mode.value ? ' quality-chip--active' : ''}${
            mode.disabled ? ' quality-chip--disabled' : ''
          }`}
          disabled={mode.disabled}
          key={mode.value}
          onClick={() => onChange(mode.value)}
          type="button"
        >
          <span>{mode.label}</span>
          <span>{mode.helper}</span>
        </button>
      ))}
    </div>
  );
}
