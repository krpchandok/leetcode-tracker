import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const client = axios.create({ baseURL: API_URL });

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

export type LoginResponse = {
  token: string;
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

export default client;
