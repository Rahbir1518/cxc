import { UserButton } from "@clerk/nextjs";
import { currentUser } from "@clerk/nextjs/server";

export default async function DashboardPage() {
  const user = await currentUser();

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <UserButton afterSignOutUrl="/" />
      </div>
      <p className="text-lg">
        Welcome, {user?.firstName || user?.emailAddresses[0]?.emailAddress}!
      </p>
    </div>
  );
}
