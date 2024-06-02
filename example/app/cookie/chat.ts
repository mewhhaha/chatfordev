import { createCookie } from "@remix-run/cloudflare";
import type { Cloudflare } from "~/load-context";

type UserCookie = { username: string; userId: string };

const createUserCookie = (id: string, secret: string) => {
  return createCookie(id, {
    httpOnly: true,
    sameSite: true,
    path: "/",
    secure: true,
    secrets: [secret],
  });
};

export const serializeUserCookie = (
  cf: Cloudflare,
  id: string,
  username: string,
) => {
  const cookie = createUserCookie(id, cf.env.COOKIE_SECRET);
  const userId = crypto.randomUUID();

  return cookie.serialize({ username, userId } satisfies UserCookie);
};

export const parseUserCookie = async (
  cf: Cloudflare,
  id: string,
  header: string,
): Promise<UserCookie> => {
  const cookie = createUserCookie(id, cf.env.COOKIE_SECRET);
  return await cookie.parse(header);
};
