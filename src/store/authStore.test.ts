jest.mock('../api/apiClient', () => ({
  createApiClient: jest.fn(() => ({
    login: jest.fn(),
    register: jest.fn(),
  })),
}));
jest.mock('../api/tokenStorage', () => ({
  tokenStorage: {
    getToken: jest.fn(),
    setToken: jest.fn(),
    clearToken: jest.fn(),
  },
}));

import { useAuthStore } from './authStore';
import { createApiClient } from '../api/apiClient';
import { tokenStorage } from '../api/tokenStorage';

// authStore.ts builds its ApiClient singleton once, synchronously, at module
// load time (`createApiClient(...)` at top level). By the time this test file
// reaches this line, that one-time call has already happened (triggered by
// the `import { useAuthStore } from './authStore'` above), so its recorded
// return value is available here. tokenStorage's mock functions are created
// directly inside the jest.mock factory (no outer-variable indirection), so
// re-importing `tokenStorage` here yields the exact same jest.fn() instances
// authStore.ts calls.
const mockApiClient = (createApiClient as jest.Mock).mock.results[0]!.value as {
  login: jest.Mock;
  register: jest.Mock;
};
const mockTokenStorage = tokenStorage as unknown as {
  getToken: jest.Mock;
  setToken: jest.Mock;
  clearToken: jest.Mock;
};

describe('useAuthStore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({ status: 'checking' });
  });

  it('restoreSession() signs in immediately if a token is already stored', async () => {
    mockTokenStorage.getToken.mockResolvedValue('existing-token');

    await useAuthStore.getState().restoreSession();

    expect(useAuthStore.getState().status).toBe('signedIn');
  });

  it('restoreSession() ends up signedOut with no stored token', async () => {
    mockTokenStorage.getToken.mockResolvedValue(null);

    await useAuthStore.getState().restoreSession();

    expect(useAuthStore.getState().status).toBe('signedOut');
  });

  it('login() stores the returned token and signs in', async () => {
    mockApiClient.login.mockResolvedValue({ accessToken: 'new-token' });

    await useAuthStore.getState().login('a@example.com', 'password123');

    expect(mockTokenStorage.setToken).toHaveBeenCalledWith('new-token');
    expect(useAuthStore.getState().status).toBe('signedIn');
  });

  it('logout() clears the token and signs out', async () => {
    useAuthStore.setState({ status: 'signedIn' });

    await useAuthStore.getState().logout();

    expect(mockTokenStorage.clearToken).toHaveBeenCalled();
    expect(useAuthStore.getState().status).toBe('signedOut');
  });
});
