import axios from 'axios';
import type { InternalAxiosRequestConfig } from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const client = axios.create({ baseURL: API_URL });

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

const clearSession = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('refreshToken');
  localStorage.removeItem('username');
  localStorage.removeItem('userId');
};

const redirectToLogin = () => {
  clearSession();
  window.location.href = '/login';
};

// Marks a request as already having gone through one refresh-and-retry
// cycle, so a request that still comes back "token expired" after that
// (the refresh itself succeeded but something else is wrong) fails instead
// of looping forever.
type RetryableRequestConfig = InternalAxiosRequestConfig & { _retriedAfterRefresh?: boolean };

// A burst of requests that all see their access token expire at once (e.g.
// the dashboard's Promise.all([getUserStats, getReviewsDue])) would each
// otherwise trigger their own POST /auth/refresh — and since refresh tokens
// rotate on use, only the first of those would actually succeed. Coalescing
// into one in-flight refresh, shared by every request that arrives while it
// is pending, avoids that.
let refreshInFlight: Promise<string> | null = null;

const refreshAccessToken = async (): Promise<string> => {
  const storedRefreshToken = localStorage.getItem('refreshToken');
  if (!storedRefreshToken) {
    throw new Error('No refresh token available');
  }

  // Plain axios, not the `client` instance: this call needs to skip both
  // interceptors above — the request interceptor's (already-expired)
  // Authorization header would be pointless here, and this response
  // shouldn't be run back through the 401-retry logic below (a rejected
  // refresh should propagate straight to the caller, not attempt to
  // "refresh the refresh").
  const response = await axios.post<{ token: string; refreshToken: string }>(
    `${API_URL}/auth/refresh`,
    { refreshToken: storedRefreshToken }
  );

  localStorage.setItem('token', response.data.token);
  localStorage.setItem('refreshToken', response.data.refreshToken);
  return response.data.token;
};

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as RetryableRequestConfig | undefined;
    // Matches only the specific { error: "token expired" } shape the access
    // token path returns (utils/middleware.js's TokenExpiredError handling)
    // — not "token invalid", "token missing", or /auth/refresh's own "refresh
    // token expired/invalid" errors, none of which a retry-after-refresh can
    // fix.
    const isExpiredAccessToken =
      error.response?.status === 401 && error.response?.data?.error === 'token expired';

    if (!isExpiredAccessToken || !originalRequest || originalRequest._retriedAfterRefresh) {
      return Promise.reject(error);
    }

    originalRequest._retriedAfterRefresh = true;

    try {
      if (!refreshInFlight) {
        refreshInFlight = refreshAccessToken().finally(() => {
          refreshInFlight = null;
        });
      }
      const newAccessToken = await refreshInFlight;

      originalRequest.headers = originalRequest.headers ?? {};
      originalRequest.headers['Authorization'] = `Bearer ${newAccessToken}`;
      return client(originalRequest);
    } catch (refreshError) {
      // The refresh token itself is missing/invalid/expired — nothing left
      // to try short of logging in again.
      redirectToLogin();
      return Promise.reject(refreshError);
    }
  }
);

export type LoginResponse = {
  token: string;
  refreshToken: string;
  username: string;
  id: string;
};

export type UserStats = {
  cached: boolean;
  totalSolved: number;
  totalAttempted: number;
  solvedByDifficulty: Record<string, number>;
  solvedByTag: Record<string, number>;
  reviewsDueCount: number;
};

export type ReviewDue = {
  id: string;
  nextReviewDate: string;
  intervalDays: number;
  questionId: {
    id: string;
    questionName: string;
    questionLink: string;
    difficulty: string;
  };
};

export type RegisterResponse = {
  id: string;
  username: string;
};

export const login = async (username: string, password: string): Promise<LoginResponse> => {
  const response = await client.post<LoginResponse>('/login', { username, password });
  return response.data;
};

export const register = async (username: string, password: string): Promise<RegisterResponse> => {
  const response = await client.post<RegisterResponse>('/users', { username, password });
  return response.data;
};

export const getUserStats = async (userId: string): Promise<UserStats> => {
  const response = await client.get<UserStats>(`/users/${userId}/stats`);
  return response.data;
};

export const getReviewsDue = async (userId: string): Promise<ReviewDue[]> => {
  const response = await client.get<ReviewDue[]>(`/users/${userId}/reviews/due`);
  return response.data;
};

export type LogSolveInput = {
  titleSlug: string;
  title: string;
  difficulty?: string;
  tags?: string[];
  timeTakenMinutes?: number;
  notes?: string;
};

export const logSolve = async (input: LogSolveInput): Promise<{ published: boolean }> => {
  const response = await client.post<{ published: boolean }>('/leetcode/submissions/log', input);
  return response.data;
};

// Best-effort: revokes the refresh token server-side (see
// backend/router/authRoutes.js) so it can't be used again even if it leaked,
// then always clears the local session regardless of whether that call
// succeeds — a logout button shouldn't get stuck because the network dropped.
export const logout = async (): Promise<void> => {
  const refreshToken = localStorage.getItem('refreshToken');
  try {
    if (refreshToken) {
      await axios.post(`${API_URL}/auth/logout`, { refreshToken });
    }
  } finally {
    clearSession();
  }
};

export default client;
