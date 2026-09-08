type StreaksProps = {
  streaks: number;
  onARoll: boolean;
  handleClick: (numStreaks: number) => void;
};

function Streaks({ streaks, onARoll, handleClick }: StreaksProps) {
  return (
    <div className="card streaks-card">
      <div>
        <h2>
          <span className="dot-cluster" />
          Streak
        </h2>
        {onARoll && <p className="muted">You're on a roll!</p>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span className="streak-count">{streaks}</span>
        <button onClick={() => handleClick(streaks)}>Current streak</button>
      </div>
    </div>
  );
}

export default Streaks;
