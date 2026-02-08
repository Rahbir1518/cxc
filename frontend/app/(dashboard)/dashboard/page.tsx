import { UserButton } from "@clerk/nextjs";
import { currentUser } from "@clerk/nextjs/server";
import Link from "next/link";

export default async function DashboardPage() {
  const user = await currentUser();

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <UserButton afterSignOutUrl="/" />
      </div>
      <p className="text-lg mb-8">
        Welcome, {user?.firstName || user?.emailAddresses[0]?.emailAddress}!
      </p>

      {/* Feature Cards */}
      <div className="grid gap-4">
        <Link
          href="/"
          className="block p-6 rounded-2xl border border-gray-200 dark:border-gray-800 hover:border-purple-400 dark:hover:border-purple-600 transition-all hover:shadow-lg group"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 dark:text-purple-400 group-hover:scale-110 transition-transform">
              <svg width="24" height="24" viewBox="0 0 80 80" fill="none">
                <circle cx="25" cy="20" r="6" fill="currentColor" opacity="0.9" />
                <circle cx="45" cy="20" r="6" fill="currentColor" opacity="0.4" />
                <circle cx="25" cy="40" r="6" fill="currentColor" opacity="0.9" />
                <circle cx="45" cy="40" r="6" fill="currentColor" opacity="0.9" />
                <circle cx="25" cy="60" r="6" fill="currentColor" opacity="0.4" />
                <circle cx="45" cy="60" r="6" fill="currentColor" opacity="0.9" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold">Braille Scanner</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Point your camera at braille to hear it spoken aloud
              </p>
            </div>
            <svg className="ml-auto w-5 h-5 text-gray-400 group-hover:text-purple-500 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </div>
        </Link>
      </div>
    </div>
  );
}
