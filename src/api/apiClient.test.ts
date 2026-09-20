import { createApiClient, ApiError } from './apiClient';

function mockFetchOnce(status: number, body: unknown) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

describe('createApiClient', () => {
  beforeEach(() => {
    (global as any).fetch = jest.fn();
  });

  it('register() posts credentials and returns an access token', async () => {
    mockFetchOnce(201, { accessToken: 'tok-123' });
    const client = createApiClient('https://api.example.com', async () => null);

    const result = await client.register('a@example.com', 'password123');

    expect(result).toEqual({ accessToken: 'tok-123' });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.com/auth/register',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'a@example.com', password: 'password123' }),
      }),
    );
  });

  it('attaches a bearer token from the token provider on authenticated calls', async () => {
    mockFetchOnce(200, []);
    const client = createApiClient('https://api.example.com', async () => 'stored-token');

    await client.listActivities();

    const [, options] = (global.fetch as jest.Mock).mock.calls[0];
    expect(options.headers.Authorization).toBe('Bearer stored-token');
  });

  it('createActivity() sends nested route points and returns the server-assigned id', async () => {
    mockFetchOnce(201, { id: 'server-id-1', title: 'Hike', updatedAt: '2026-09-21T00:00:00.000Z' });
    const client = createApiClient('https://api.example.com', async () => 'tok');

    const result = await client.createActivity({
      title: 'Hike',
      startedAt: '2026-09-21T00:00:00.000Z',
      endedAt: '2026-09-21T01:00:00.000Z',
      routePoints: [{ lat: 10.1, lng: 106.1, recordedAt: '2026-09-21T00:00:00.000Z', sequence: 0 }],
    });

    expect(result).toEqual({ id: 'server-id-1', title: 'Hike', updatedAt: '2026-09-21T00:00:00.000Z' });
  });

  it('updateActivityMetadata() surfaces a conflict body without throwing', async () => {
    mockFetchOnce(200, { conflict: true, serverActivity: { id: 's1', title: 'Server title', updatedAt: '2026-09-21T02:00:00.000Z' } });
    const client = createApiClient('https://api.example.com', async () => 'tok');

    const result = await client.updateActivityMetadata('s1', { title: 'My title', clientUpdatedAt: '2026-09-21T00:00:00.000Z' });

    expect(result).toEqual({
      conflict: true,
      serverActivity: { id: 's1', title: 'Server title', updatedAt: '2026-09-21T02:00:00.000Z' },
    });
  });

  it('throws a typed ApiError on a non-2xx, non-conflict response', async () => {
    mockFetchOnce(401, { message: 'Invalid email or password' });
    const client = createApiClient('https://api.example.com', async () => null);

    await expect(client.login('a@example.com', 'wrong')).rejects.toMatchObject({
      status: 401,
      message: 'Invalid email or password',
    });
  });

  it('throws a typed ApiError with no status on a network failure', async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('network down'));
    const client = createApiClient('https://api.example.com', async () => null);

    await expect(client.listActivities()).rejects.toBeInstanceOf(ApiError);
  });
});
