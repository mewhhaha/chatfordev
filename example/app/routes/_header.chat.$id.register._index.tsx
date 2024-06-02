import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { redirect } from "@remix-run/cloudflare";
import { Form } from "@remix-run/react";
import { ArkErrors, type } from "arktype";
import { serializeUserCookie } from "~/cookie/chat";

const parseFormData = type({ username: "string" });

export const action = async ({
  request,
  context,
  params,
}: ActionFunctionArgs) => {
  const formData = await request.formData();
  const data = parseFormData(Object.fromEntries(formData.entries()));
  if (data instanceof ArkErrors) {
    throw new Error("Unexpected form data");
  }

  const id = params.id as string;

  const cookie = await serializeUserCookie(
    context.cloudflare,
    id,
    data.username,
  );

  return redirect(`/chat/${id}`, {
    headers: { "Set-Cookie": cookie },
  });
};

export default function Route() {
  return (
    <main>
      <div className="mx-auto mt-10 w-80 rounded-md bg-white p-8 shadow-md">
        <Form method="POST">
          <label htmlFor="username" className="mb-2 block text-lg font-bold">
            Username
          </label>
          <input
            name="username"
            type="text"
            id="username"
            autoComplete="username"
            className="mb-4 w-full border-2 border-black p-2 focus:outline-none focus:ring-2 focus:ring-black"
          />
          <button className="w-full bg-black py-2 font-bold text-white transition-colors hover:bg-gray-800">
            Join Chat Room
          </button>
        </Form>
      </div>
    </main>
  );
}
