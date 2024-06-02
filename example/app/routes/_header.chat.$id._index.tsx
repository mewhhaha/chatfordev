import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { parseUserCookie } from "../cookie/chat";
import { redirect, useLoaderData } from "@remix-run/react";
import { useEffect, useRef, useState } from "react";
import type { Post, Recent, Routes, WebSocketMessage } from "chatfordev-worker";
import { cx } from "~/styles/cx";
import { fetcher } from "@mewhhaha/little-fetcher";

export const loader = async ({
  request,
  params,
  context,
}: LoaderFunctionArgs) => {
  const id = params.id as string;
  try {
    const { username, userId } = await parseUserCookie(
      context.cloudflare,
      id,
      request.headers.get("Cookie") ?? "",
    );

    const chat = fetcher<Routes>(context.cloudflare.env.CHAT);

    const swr = async () => {
      const data = chat.get(`/chat/${id}/recent`).then((r) => r.json());
      const cache = await context.cloudflare.caches.open("recent");

      const revalidate = async () => {
        const { posts } = await data;
        const cacheKey = new Request(request.url, {
          headers: {
            "Cache-Control": "max-age=6031536000",
            method: "GET",
          },
        });
        const response = new Response(JSON.stringify(posts), {
          headers: { "Content-Type": "application/json" },
        });
        await cache.put(cacheKey, response);
      };

      const cached: Response = await cache.match(request);
      context.cloudflare.ctx.waitUntil(revalidate());
      if (cached) {
        return (await cached.json()) as Awaited<typeof data>;
      }

      return await data;
    };

    return {
      username,
      userId,
      id,
      wsOrigin: import.meta.env.DEV
        ? "ws://localhost:8787"
        : context.cloudflare.env.WORKER_ORIGIN,
      initialPosts: (await swr()).posts,
    };
  } catch {
    throw redirect(`/chat/${id}/register`);
  }
};

const useWebSocket = (
  url: string,
  setup?: (ws: WebSocket) => undefined | (() => void),
) => {
  const callback = useRef(setup);
  callback.current = setup;
  const [ws, setWs] = useState<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket(url);
    const close = callback.current?.(ws);
    setWs(ws);

    return () => {
      ws.close();
      close?.();
    };
  }, [url]);

  return ws;
};

const usePosts = (
  wsOrigin: string,
  id: string,
  user: { username: string; userId: string },
  initialPosts: Post[] = [],
) => {
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const ws = useWebSocket(`${wsOrigin}/chat/${id}`, (ws) => {
    const onconnected = () => {
      ws.send(
        JSON.stringify({
          action: "connected",
          userId: user.userId,
          username: user.username,
        } satisfies WebSocketMessage),
      );
    };

    const onmessage = (event: MessageEvent<string>) => {
      const byDate = (a: Post, b: Post) => (a.date < b.date ? -1 : 1);
      const message = JSON.parse(event.data) as Recent | Post;

      if (message.action === "post") {
        setPosts((prev) => [...prev, message].toSorted(byDate));
      }

      if (message.action === "recent") {
        setPosts(message.posts);
      }
    };

    ws.addEventListener("open", onconnected, { once: true });
    ws.addEventListener("message", onmessage);
    return () => {
      ws.removeEventListener("open", onconnected);
      ws.removeEventListener("message", onmessage);
    };
  });

  return {
    posts,
    send: (message: string) => {
      ws?.send(
        JSON.stringify({
          action: "send",
          message,
          username: user.username,
          userId: user.userId,
        } satisfies WebSocketMessage),
      );
    },
  };
};

export default function Route() {
  const { username, userId, wsOrigin, id, initialPosts } =
    useLoaderData<typeof loader>();
  const { posts, send } = usePosts(
    wsOrigin,
    id,
    { username, userId },
    initialPosts,
  );
  return (
    <main>
      <div className="mx-auto flex h-3/4 w-full max-w-2xl flex-col rounded-md bg-white p-8 shadow-md">
        <ol className="mb-4 grow space-y-5 overflow-y-auto border-2 border-black p-4">
          {posts.map((post) => {
            const self = post.userId === userId;
            return (
              <li
                key={post.id}
                className={cx("mb-2", self ? "text-right" : "text-left")}
              >
                <article
                  className={cx(
                    "inline-block relative max-w-xs break-words rounded-xl px-3 pb-2 pt-4",
                    {
                      "bg-blue-500 text-white": self,
                      "bg-gray-300 text-black": !self,
                    },
                  )}
                >
                  <dl
                    className={cx(
                      "absolute -top-3 px-2 py-1 rounded flex whitespace-nowrap bg-black",
                      {
                        "right-0": self,
                        "left-0": !self,
                      },
                    )}
                  >
                    <dt className="sr-only">Author</dt>
                    <dd className="mr-1 text-xs font-medium text-white">
                      {post.username},{" "}
                    </dd>
                    <dt className="sr-only">Posted at</dt>
                    <dd className="text-xs text-white">
                      <time dateTime={post.date}>
                        {new Date(post.date).toLocaleDateString("en-us", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </time>
                    </dd>
                  </dl>
                  <p>{post.message}</p>
                </article>
              </li>
            );
          })}
        </ol>
        <div className="flex">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const formData = new FormData(event.currentTarget);
              const message = formData.get("message") as string;
              send(message);
              event.currentTarget.reset();
            }}
          >
            <textarea
              onKeyDown={(event) => {
                // Parity with input, by pressing enter
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              name="message"
              id="message"
              required
              className="mr-2 w-full border-2 border-black p-2 focus:outline-none focus:ring-2 focus:ring-black"
              placeholder="Type a message..."
            />
            <button className="bg-black px-4 py-2 font-bold text-white transition-colors hover:bg-gray-800">
              Send
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
