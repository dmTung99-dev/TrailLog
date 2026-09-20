export class ApiError extends Error {
  status?: number;
  serverActivity?: unknown;

  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

export interface ServerActivity {
  id: string;
  title: string;
  notes?: string | null;
  visibility?: string;
  updatedAt: string;
}

export interface CreateActivityPayload {
  title: string;
  notes?: string;
  startedAt: string;
  endedAt?: string;
  routePoints: Array<{ lat: number; lng: number; recordedAt: string; sequence: number }>;
}

export type UpdateActivityResult =
  | ServerActivity
  | { conflict: true; serverActivity: ServerActivity };

export interface ApiClient {
  register(email: string, password: string): Promise<{ accessToken: string }>;
  login(email: string, password: string): Promise<{ accessToken: string }>;
  listActivities(): Promise<ServerActivity[]>;
  createActivity(payload: CreateActivityPayload): Promise<ServerActivity>;
  updateActivityMetadata(
    serverActivityId: string,
    dto: { title?: string; notes?: string; visibility?: string; clientUpdatedAt: string },
  ): Promise<UpdateActivityResult>;
  createCheckpoint(
    serverActivityId: string,
    dto: { lat: number; lng: number; capturedAt: string },
  ): Promise<{ id: string }>;
  uploadCheckpointPhoto(
    serverActivityId: string,
    serverCheckpointId: string,
    photo: { uri: string; name: string; type: string },
  ): Promise<{ photoUrl: string }>;
}

type TokenProvider = () => Promise<string | null>;

export function createApiClient(baseUrl: string, getToken: TokenProvider): ApiClient {
  async function request<T>(
    path: string,
    init: { method: string; body?: unknown; isMultipart?: boolean; authenticated?: boolean } = { method: 'GET' },
  ): Promise<T> {
    const headers: Record<string, string> = {};
    if (!init.isMultipart) {
      headers['Content-Type'] = 'application/json';
    }
    if (init.authenticated !== false) {
      const token = await getToken();
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
    }

    let response: { ok: boolean; status: number; json: () => Promise<any> };
    try {
      response = await fetch(`${baseUrl}${path}`, {
        method: init.method,
        headers,
        body: init.isMultipart ? (init.body as any) : init.body !== undefined ? JSON.stringify(init.body) : undefined,
      });
    } catch (error) {
      throw new ApiError(error instanceof Error ? error.message : 'Network request failed');
    }

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new ApiError(body?.message ?? `Request failed with status ${response.status}`, response.status);
    }

    return body as T;
  }

  return {
    register(email, password) {
      return request('/auth/register', { method: 'POST', body: { email, password }, authenticated: false });
    },

    login(email, password) {
      return request('/auth/login', { method: 'POST', body: { email, password }, authenticated: false });
    },

    listActivities() {
      return request('/activities', { method: 'GET' });
    },

    createActivity(payload) {
      return request('/activities', { method: 'POST', body: payload });
    },

    updateActivityMetadata(serverActivityId, dto) {
      return request(`/activities/${serverActivityId}`, { method: 'PATCH', body: dto });
    },

    createCheckpoint(serverActivityId, dto) {
      return request(`/activities/${serverActivityId}/checkpoints`, { method: 'POST', body: dto });
    },

    async uploadCheckpointPhoto(serverActivityId, serverCheckpointId, photo) {
      const form = new FormData();
      form.append('photo', { uri: photo.uri, name: photo.name, type: photo.type } as any);
      return request(`/activities/${serverActivityId}/checkpoints/${serverCheckpointId}/photo`, {
        method: 'POST',
        body: form,
        isMultipart: true,
      });
    },
  };
}
