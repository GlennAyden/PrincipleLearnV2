describe('apiFetch', () => {
  const originalFetch = global.fetch;
  const originalDocument = global.document;

  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    Object.defineProperty(globalThis, 'document', {
      value: originalDocument,
      configurable: true,
    });
  });

  it('rebuilds the csrf header after a successful token refresh', async () => {
    let cookie = 'csrf_token=old-token';
    Object.defineProperty(globalThis, 'document', {
      value: {
        get cookie() {
          return cookie;
        },
      },
      configurable: true,
    });

    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockImplementationOnce(async () => {
        cookie = 'csrf_token=new-token';
        return new Response(null, { status: 200 });
      })
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    global.fetch = fetchMock;

    const { apiFetch } = await import('@/lib/api-client');
    const response = await apiFetch('/api/example', {
      method: 'POST',
      body: JSON.stringify({ ok: true }),
    });

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect((fetchMock.mock.calls[0][1]?.headers as Headers).get('x-csrf-token')).toBe('old-token');
    expect((fetchMock.mock.calls[2][1]?.headers as Headers).get('x-csrf-token')).toBe('new-token');
  });

  it('coalesces concurrent 401 responses into a single refresh request', async () => {
    Object.defineProperty(globalThis, 'document', {
      value: { cookie: 'csrf_token=current-token' },
      configurable: true,
    });

    let resolveRefresh: (response: Response) => void = () => {};
    const refreshResponse = new Promise<Response>((resolve) => {
      resolveRefresh = resolve;
    });
    let protectedCallCount = 0;
    const fetchMock = jest.fn((url: RequestInfo | URL) => {
      if (String(url) === '/api/auth/refresh') {
        return refreshResponse;
      }

      protectedCallCount += 1;
      return Promise.resolve(
        new Response(null, {
          status: protectedCallCount <= 2 ? 401 : 200,
        }),
      );
    });
    global.fetch = fetchMock;

    const { apiFetch } = await import('@/lib/api-client');
    const first = apiFetch('/api/first');
    const second = apiFetch('/api/second');

    await Promise.resolve();
    expect(fetchMock.mock.calls.filter(([url]) => String(url) === '/api/auth/refresh')).toHaveLength(1);

    resolveRefresh(new Response(null, { status: 200 }));
    await expect(first).resolves.toHaveProperty('status', 200);
    await expect(second).resolves.toHaveProperty('status', 200);
    expect(fetchMock.mock.calls.filter(([url]) => String(url) === '/api/auth/refresh')).toHaveLength(1);
  });
});
