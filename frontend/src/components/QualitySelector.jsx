export default function QualitySelector({
  activeLevel,
  levels,
  onChange
}) {
  return (
    <div className="player-quality">
      <span className="player-quality__label">Quality</span>

      <div className="player-quality__choices">
        {levels.map((level) => (
          <button
            aria-label={`Set quality to ${level.label}`}
            className={`quality-toggle${
              activeLevel === level.value ? ' quality-toggle--active' : ''
            }`}
            key={level.value}
            onClick={() => onChange(level.value)}
            type="button"
          >
            {level.label}
          </button>
        ))}
      </div>
    </div>
  );
}
