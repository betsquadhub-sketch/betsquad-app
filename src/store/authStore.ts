import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as api from '../services/api';

interface AuthState {
  user: api.User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, username: string) => Promise<void>;
  logout: () => Promise<void>;
  loadUser: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  isLoading: true,
  isAuthenticated: false,

  login: async (email: string, password: string) => {
    const response = await api.login(email, password);
    await AsyncStorage.setItem('token', response.access_token);
    set({
      user: response.user,
      token: response.access_token,
      isAuthenticated: true,
    });
  },

  register: async (email: string, password: string, username: string) => {
    const response = await api.register(email, password, username);
    await AsyncStorage.setItem('token', response.access_token);
    set({
      user: response.user,
      token: response.access_token,
      isAuthenticated: true,
    });
  },

  logout: async () => {
    await AsyncStorage.removeItem('token');
    set({
      user: null,
      token: null,
      isAuthenticated: false,
    });
  },

  loadUser: async () => {
    try {
      console.log('[Auth] Loading user from storage...');
      const token = await AsyncStorage.getItem('token');
      console.log('[Auth] Token found:', token ? 'YES' : 'NO');
      
      if (token) {
        try {
          const user = await api.getMe();
          console.log('[Auth] User loaded:', user?.username);
          set({
            user,
            token,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (apiError) {
          console.log('[Auth] API error, token might be expired');
          await AsyncStorage.removeItem('token');
          set({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
          });
        }
      } else {
        console.log('[Auth] No token, user not logged in');
        set({ isLoading: false });
      }
    } catch (error) {
      console.error('[Auth] Load user error:', error);
      set({
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  },

  refreshUser: async () => {
    try {
      const user = await api.getMe();
      set({ user });
    } catch (error) {
      console.error('Failed to refresh user:', error);
    }
  },
}));
