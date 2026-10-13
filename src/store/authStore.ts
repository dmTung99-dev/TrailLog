import { create } from 'zustand';
import { createApiClient } from '../api/apiClient';
import { tokenStorage } from '../api/tokenStorage';
import { appConfig } from '../config/appConfig';

const apiClient = createApiClient(appConfig.apiBaseUrl, () => tokenStorage.getToken());

interface AuthStoreState {
  status: 'checking' | 'signedOut' | 'signedIn';
  restoreSession: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthStoreState>((set) => ({
  status: 'checking',

  async restoreSession() {
    const token = await tokenStorage.getToken();
    set({ status: token ? 'signedIn' : 'signedOut' });
  },

  async login(email, password) {
    const { accessToken } = await apiClient.login(email, password);
    await tokenStorage.setToken(accessToken);
    set({ status: 'signedIn' });
  },

  async register(email, password) {
    const { accessToken } = await apiClient.register(email, password);
    await tokenStorage.setToken(accessToken);
    set({ status: 'signedIn' });
  },

  async logout() {
    await tokenStorage.clearToken();
    set({ status: 'signedOut' });
  },
}));

export { apiClient };
