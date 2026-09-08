import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import axios from 'axios';
import { getUserStats, getReviewsDue, logSolve } from '../api/client';
import type { UserStats, ReviewDue } from '../api/client';
import Streaks from '../components/streaks';

const DIFFICULTY_ORDER = ['Easy', 'Medium', 'Hard', 'Unknown'];
const CHART_COLORS = ['#b8e8d8', '#f6a8cf', '#d6c6f7', '#ffc2dd'];

const handleStreakClick = (numStreaks: number) => {
  if (numStreaks >= 3) {
    alert(`You're on a roll with ${numStreaks} streaks! Keep it up!`);
  } else {
    alert(`You have ${numStreaks} streaks. Keep going!`);
  }
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-');

function LogSolveForm() {
  const [title, setTitle] = useState('');
  const [titleSlug, setTitleSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [difficulty, setDifficulty] = useState('Medium');
  const [tags, setTags] = useState('');
  const [timeTakenMinutes, setTimeTakenMinutes] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleTitleChange = (value: string) => {
    setTitle(value);
    if (!slugTouched) {
      setTitleSlug(slugify(value));
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus(null);
    setSubmitting(true);

    try {
      await logSolve({
        title,
        titleSlug,
        difficulty,
        tags: tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
        timeTakenMinutes: timeTakenMinutes ? Number(timeTakenMinutes) : undefined,
        notes: notes || undefined,
      });
      setStatus({ kind: 'success', message: 'Logged! It may take a moment to show up below.' });
      setTitle('');
      setTitleSlug('');
      setSlugTouched(false);
      setTags('');
      setTimeTakenMinutes('');
      setNotes('');
    } catch (err) {
      const message =
        axios.isAxiosError(err) && err.response?.data?.error
          ? String(err.response.data.error)
          : 'Could not log this solve. Please try again.';
      setStatus({ kind: 'error', message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card">
      <h2>
        <span className="dot-cluster" />
        Log a solve
      </h2>
      <form className="log-solve-form" onSubmit={handleSubmit}>
        <label className="full-width">
          Problem name
          <input value={title} onChange={(event) => handleTitleChange(event.target.value)} required />
        </label>
        <label>
          Problem slug
          <input
            value={titleSlug}
            onChange={(event) => {
              setSlugTouched(true);
              setTitleSlug(event.target.value);
            }}
            placeholder="two-sum"
            required
          />
        </label>
        <label>
          Difficulty
          <select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}>
            <option value="Easy">Easy</option>
            <option value="Medium">Medium</option>
            <option value="Hard">Hard</option>
          </select>
        </label>
        <label>
          Time taken (minutes)
          <input
            type="number"
            min={0}
            value={timeTakenMinutes}
            onChange={(event) => setTimeTakenMinutes(event.target.value)}
          />
        </label>
        <label>
          Pattern / tags
          <input
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="Array, Two Pointers"
          />
        </label>
        <label className="full-width">
          Notes
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
          />
        </label>
        <button type="submit" disabled={submitting}>
          {submitting ? 'Logging...' : 'Log solve'}
        </button>
      </form>
      {status && <p className={`log-solve-message ${status.kind}`}>{status.message}</p>}
    </div>
  );
}

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
    return <p className="dashboard-error">Loading dashboard...</p>;
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

      <div className="dashboard-header">
        <h1>
          <span className="dot-cluster" />
          Dashboard
        </h1>
        <span className="badge">{stats.totalSolved} solved</span>
      </div>

      <LogSolveForm />

      <div className="dashboard-grid">
        <section className="card">
          <h2>
            <span className="dot-cluster" />
            Solved by difficulty
          </h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={difficultyData}>
              <CartesianGrid stroke="#fce4f0" strokeDasharray="3 3" />
              <XAxis dataKey="difficulty" stroke="#a58ea0" />
              <YAxis allowDecimals={false} stroke="#a58ea0" />
              <Tooltip contentStyle={{ borderRadius: 14, border: '1px solid #fce4f0' }} />
              <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                {difficultyData.map((entry, index) => (
                  <Cell key={entry.difficulty} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </section>

        <section className="card">
          <h2>
            <span className="dot-cluster" />
            Weak areas
          </h2>
          <p className="muted">Solved by tag, ascending — lowest counts first</p>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={tagData} layout="vertical">
              <CartesianGrid stroke="#fce4f0" strokeDasharray="3 3" />
              <XAxis type="number" allowDecimals={false} stroke="#a58ea0" />
              <YAxis type="category" dataKey="tag" width={130} stroke="#a58ea0" />
              <Tooltip contentStyle={{ borderRadius: 14, border: '1px solid #fce4f0' }} />
              <Bar dataKey="count" fill="#f6a8cf" radius={[0, 8, 8, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </section>
      </div>

      <section className="card">
        <h2>
          <span className="dot-cluster" />
          Reviews due ({stats.reviewsDueCount})
        </h2>
        {reviewsDue.length === 0 ? (
          <p className="muted">Nothing due right now.</p>
        ) : (
          <ul className="reviews-list">
            {reviewsDue.map((review) => (
              <li key={review.id}>
                <a href={review.questionId.questionLink} target="_blank" rel="noreferrer">
                  {review.questionId.questionName}
                </a>
                <span className="badge badge-lavender">{review.questionId.difficulty}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default Dashboard;
