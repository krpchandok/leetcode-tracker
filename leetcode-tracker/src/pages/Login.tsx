import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { login } from '../api/client';

function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    try {
      const response = await login(username, password);
      localStorage.setItem('token', response.token);
      localStorage.setItem('username', response.username);
      localStorage.setItem('userId', response.id);
      navigate('/');
    } catch (err) {
      const message =
        axios.isAxiosError(err) && err.response?.status === 401
          ? 'Invalid username or password'
          : 'Something went wrong logging in. Please try again.';
      setError(message);
    }
  };

  return (
    <div className="login-page">
      <div className="card">
        <h1>
          <span className="dot-cluster" />
          Log in
        </h1>
        <form onSubmit={handleSubmit}>
          <label>
            Username
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <button type="submit">Log in</button>
        </form>
        {error && <p className="login-error">{error}</p>}
        <p className="muted-link muted">
          Don't have an account? <Link to="/register">Sign up</Link>
        </p>
      </div>
    </div>
  );
}

export default Login;
