import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { register, login } from '../api/client';

function Register() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    try {
      await register(username, password);
    } catch (err) {
      const message =
        axios.isAxiosError(err) && err.response?.data?.error
          ? String(err.response.data.error)
          : 'Could not create account';
      setError(message);
      return;
    }

    try {
      const response = await login(username, password);
      localStorage.setItem('token', response.token);
      localStorage.setItem('username', response.username);
      localStorage.setItem('userId', response.id);
      navigate('/');
    } catch {
      setError('Account created, but automatic login failed — try logging in manually.');
    }
  };

  return (
    <div className="login-page">
      <h1>Sign up</h1>
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
            minLength={6}
          />
        </label>
        <button type="submit">Sign up</button>
      </form>
      {error && <p className="login-error">{error}</p>}
      <p>
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </div>
  );
}

export default Register;
