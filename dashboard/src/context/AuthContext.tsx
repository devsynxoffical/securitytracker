import React, { createContext, useContext, useState, useEffect } from 'react';
import { AuthState } from '../types';
import { fetchCurrentUser, googleLoginExchange } from '../services/api';

interface AuthContextType extends AuthState {
  loginWithGoogleToken: (idToken: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: localStorage.getItem('auth_token'),
    isAuthenticated: false,
    isLoading: true,
  });

  useEffect(() => {
    async function loadUser() {
      if (state.token) {
        try {
          const user = await fetchCurrentUser(state.token);
          setState({
            user,
            token: state.token,
            isAuthenticated: true,
            isLoading: false,
          });
        } catch (_err) {
          localStorage.removeItem('auth_token');
          setState({
            user: null,
            token: null,
            isAuthenticated: false,
            isLoading: false,
          });
        }
      } else {
        setState((prev) => ({ ...prev, isLoading: false }));
      }
    }
    loadUser();
  }, [state.token]);

  const loginWithGoogleToken = async (idToken: string) => {
    setState((prev) => ({ ...prev, isLoading: true }));
    try {
      const { token, user } = await googleLoginExchange(idToken);
      localStorage.setItem('auth_token', token);
      setState({
        user,
        token,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (error) {
      setState((prev) => ({ ...prev, isLoading: false }));
      throw error;
    }
  };

  const logout = () => {
    localStorage.removeItem('auth_token');
    setState({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
    });
  };

  return (
    <AuthContext.Provider value={{ ...state, loginWithGoogleToken, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
