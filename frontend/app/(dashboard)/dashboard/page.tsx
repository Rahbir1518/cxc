import { UserButton } from "@clerk/nextjs";
import { currentUser } from "@clerk/nextjs/server";
import Link from "next/link";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";
const CAMERA_TEST_URL = `${BACKEND_URL}/static/camera_test.html`;

export default async function DashboardPage() {
  const user = await currentUser();

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <UserButton afterSignOutUrl="/" />
      </div>
      <p className="text-lg mb-6">
        Welcome, {user?.firstName || user?.emailAddresses[0]?.emailAddress}!
      </p>

      <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-6 max-w-lg">
        <h2 className="text-lg font-semibold mb-2">Indoor navigation (phone test)</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          Start the backend server first, then open the voice + map test on your phone. You start in room 0020; say e.g. &quot;Take me to room 0010&quot; for a route and live guidance.
        </p>
        <div className="flex flex-col gap-2">
          <Link
            href={CAMERA_TEST_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium px-4 py-3 transition-colors"
          >
            Open navigation test (camera + map)
          </Link>
          <p className="text-xs text-gray-500 dark:text-gray-500">
            Backend: <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">{BACKEND_URL}</code>
          </p>
        </div>
      </section>
    </div>
  );
}
