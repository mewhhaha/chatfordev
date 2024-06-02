import { Link, Outlet } from "@remix-run/react";

export default function Route() {
  return (
    <>
      <header className="bg-black p-4 text-center text-2xl font-bold text-white">
        <nav>
          <Link to="/home">Chat App</Link>
        </nav>
      </header>
      <Outlet />
    </>
  );
}
