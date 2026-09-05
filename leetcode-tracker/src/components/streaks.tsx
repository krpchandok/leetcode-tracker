type StreaksProps = {
  streaks: number;
  onARoll: boolean;
  handleClick: (numStreaks: number) => void;
};



function Streaks({ streaks, onARoll, handleClick }: StreaksProps) {
  return (
    <div className="streaks">
      <h2>Streaks</h2>
      <button onClick={() => handleClick(streaks)}>
        Current Streak: {streaks}
      </button>
      {onARoll && <p>You're on a roll!</p>}
    </div>
  );
}

export default Streaks;
