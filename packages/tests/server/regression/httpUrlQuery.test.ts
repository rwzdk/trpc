// @vitest-environment node
import {
  createTRPCClient,
  httpBatchLink,
  httpBatchStreamLink,
  httpLink,
} from '@trpc/client';
import { initTRPC } from '@trpc/server';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { z } from 'zod';

describe.each([
  { name: 'httpLink', link: httpLink },
  { name: 'httpBatchLink', link: httpBatchLink },
  { name: 'httpBatchStreamLink', link: httpBatchStreamLink },
])('$name', ({ link }) => {
  test.each(['absolute', 'relative', 'URL'] as const)(
    'preserves question marks in endpoint query parameters (%s)',
    async (urlType) => {
      const t = initTRPC
        .context<{ token: string | null; redirect: string | null }>()
        .create();
      const procedure = t.procedure.input(z.string());
      const router = t.router({
        query: procedure.query(({ ctx, input }) => ({ ...ctx, input })),
        mutation: procedure.mutation(({ ctx, input }) => ({ ...ctx, input })),
      });
      const endpoint = '/api/trpc/';
      const query = '?token=before?after?last&redirect=/next?tab=rpc';
      const absoluteUrl = `https://example.com${endpoint}${query}`;
      const url =
        urlType === 'URL'
          ? new URL(absoluteUrl)
          : urlType === 'relative'
            ? `${endpoint}${query}`
            : absoluteUrl;
      const client = createTRPCClient<typeof router>({
        links: [
          link({
            url,
            fetch: (requestUrl, init) =>
              fetchRequestHandler({
                endpoint,
                req: new Request(
                  new URL(
                    requestUrl instanceof Request ? requestUrl.url : requestUrl,
                    'https://example.com',
                  ),
                  init,
                ),
                router,
                createContext({ req }) {
                  const params = new URL(req.url).searchParams;
                  return {
                    token: params.get('token'),
                    redirect: params.get('redirect'),
                  };
                },
              }),
          }),
        ],
      });

      await expect(
        Promise.all([
          client.query.query('first'),
          client.query.query('second'),
        ]),
      ).resolves.toEqual(
        ['first', 'second'].map((input) => ({
          token: 'before?after?last',
          redirect: '/next?tab=rpc',
          input,
        })),
      );
      await expect(client.mutation.mutate('mutation')).resolves.toEqual({
        token: 'before?after?last',
        redirect: '/next?tab=rpc',
        input: 'mutation',
      });
    },
  );
});
