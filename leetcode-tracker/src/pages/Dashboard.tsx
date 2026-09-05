import { useEffect, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { getUserStats, getReviewsDue } from '../api/client';
import type { UserStats, ReviewDue } from '../api/client';
import Streaks from '../components/streaks';

const DIFFICULTY_ORDER = ['Easy', 'Medium', 'Hard', 'Unknown'];

const handleStreakClick = (numStreaks: number) => {
  if (numStreaks >= 3) {
    alert(`You're on a roll with ${numStreaks} streaks! Keep it up!`);
  } else {
    alert(`You have ${numStreaks} streaks. Keep going!`);
  }
};

function Dashboard() {
  const userId = localStorage.getItem('userId');
  const [stats, setStats] = useState<UserStats | null>(null);
  const [reviewsDue, setReviewsDue] = useState<ReviewDue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Streaks isn't computed anywhere in the backend's stats response yet, so
  // this stays wired to the same placeholder value the component already
  // had rather than inventing a data source for it.
  const streaks = 0;

  useEffect(() => {
    if (!userId) {
      return;
    }

    Promise.all([getUserStats(userId), getReviewsDue(userId)])
      .then(([statsResult, reviewsResult]) => {
        setStats(statsResult);
        setReviewsDue(reviewsResult);
      })
      .catch(() => {
        setError('Failed to load dashboard data.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [userId]);

  if (!userId) {
    return <p className="dashboard-error">No user id found, please log in again.</p>;
  }

  if (loading) {
    return <p>Loading dashboard...</p>;
  }

  if (error || !stats) {
    return <p className="dashboard-error">{error || 'Something went wrong.'}</p>;
  }

  const difficultyData = DIFFICULTY_ORDER.filter(
    (difficulty) => stats.solvedByDifficulty[difficulty] !== undefined,
  ).map((difficulty) => ({ difficulty, count: stats.solvedByDifficulty[difficulty] }));

  const tagData = Object.entries(stats.solvedByTag)
    .sort((a, b) => a[1] - b[1])
    .map(([tag, count]) => ({ tag, count }));

  return (
    <div className="dashboard">
      <Streaks
        streaks={streaks}
        onARoll={streaks >= 3}
        handleClick={() => handleStreakClick(streaks)}
      />

      <h1>Dashboard</h1>

      <section>
        <h2>Solved by difficulty</h2>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={difficultyData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="difficulty" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="count" fill="#4f46e5" />
          </BarChart>
        </ResponsiveContainer>
      </section>

      <section>
        <h2>Weak areas (solved by tag, ascending)</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={tagData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" allowDecimals={false} />
            <YAxis type="category" dataKey="tag" width={140} />
            <Tooltip />
            <Bar dataKey="count" fill="#f59e0b" />
          </BarChart>
        </ResponsiveContainer>
      </section>

      <section>
        <h2>Reviews due ({stats.reviewsDueCount})</h2>
        {reviewsDue.length === 0 ? (
          <p>Nothing due right now.</p>
        ) : (
          <ul>
            {reviewsDue.map((review) => (
              <li key={review.id}>
                <a href={review.questionId.questionLink} target="_blank" rel="noreferrer">
                  {review.questionId.questionName}
                </a>{' '}
                ({review.questionId.difficulty})
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default Dashboard;
