import { DurableObject } from "cloudflare:workers";
import { Router, err, ok } from "@mewhhaha/little-worker";
import { ArkErrors, type } from "arktype";

const parseType = type({
  action: "'send'",
  userId: "string",
  username: "string",
  message: "string",
})
  .or({
    action: "'connected'",
    userId: "string",
    username: "string",
  })
  .or({ action: "'image'", src: "string" });

export type WebSocketMessage = Exclude<
  ReturnType<typeof parseType.out>,
  ArkErrors
>;

const stub = <NAMESPACE extends DurableObject>(
  namespace: DurableObjectNamespace<NAMESPACE>,
  id: DurableObjectId | { name: string } | { id: string },
) => {
  let doid: DurableObjectId;
  if ("equals" in id) {
    doid = id;
  } else if ("name" in id) {
    doid = namespace.idFromName(id.name);
  } else {
    doid = namespace.idFromString(id.id);
  }
  return namespace.get(doid);
};

interface Env {
  CHAT: DurableObjectNamespace<DurableObjectChat>;
}

export type Post = {
  action: "post";
  message: string;
  username: string;
  userId: string;
  id: string;
  date: string;
};

export type Recent = {
  action: "recent";
  posts: Post[];
};

export class DurableObjectChat extends DurableObject {
  ws() {
    const { 0: client, 1: server } = new WebSocketPair();

    this.ctx.acceptWebSocket(server);

    return client;
  }

  async fetch() {
    const { 0: client, 1: server } = new WebSocketPair();

    this.ctx.acceptWebSocket(server);
    this.ctx.getWebSockets();
    return new Response(null, { status: 101, webSocket: client });
  }

  async recent() {
    const recent = await this.ctx.storage.list<Post>({
      prefix: "date#",
      limit: 100,
    });
    return { posts: [...recent.values()] };
  }

  async webSocketMessage(ws: WebSocket, data: string) {
    const parsed = parseType(JSON.parse(data));
    if (parsed instanceof ArkErrors) {
      throw new Error(`Unexpected message, got: ${data}`);
    }

    switch (parsed.action) {
      case "connected": {
        const { posts } = await this.recent();

        ws.send(
          JSON.stringify({
            action: "recent",
            posts,
          } satisfies Recent),
        );
        break;
      }
      case "image":
        break;
      case "send":
        {
          const sockets = this.ctx.getWebSockets();
          const post: Post = {
            action: "post",
            userId: parsed.userId,
            username: parsed.username,
            message: parsed.message,
            id: crypto.randomUUID(),
            date: new Date().toISOString(),
          };

          this.ctx.waitUntil(
            this.ctx.storage.put(`date#${post.date}#id#${post.id}`, post),
          );

          for (const socket of sockets) {
            socket.send(JSON.stringify(post));
          }
        }
        break;
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string) {
    ws.close(code, reason);
  }
}

const router = Router<[Env, ExecutionContext]>()
  .post("/chat", [], (_, env) => {
    const id = env.CHAT.newUniqueId();
    return ok(200, { id: id.toString() });
  })
  .get("/chat/:id/recent", [], async ({ params }, env) => {
    const id = params.id;
    const chat = stub(env.CHAT, { id });
    const { posts } = await chat.recent();
    return ok(200, { posts });
  })
  .options("/chat/:id", [], () => {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Max-Age": "86400",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  })
  .all("/chat/:id", [], async ({ request, params }, env) => {
    if (request.headers.get("Upgrade") !== "websocket") {
      return err(426, "Expected Upgrade: websocket");
    }

    const chat = stub(env.CHAT, { id: params.id });

    return chat.fetch(request);
  });

const routes = router.infer;

export type Routes = typeof routes;

export default {
  fetch: router.handle,
};
