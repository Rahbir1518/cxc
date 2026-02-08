import { redirect } from "next/navigation";

// Route group page redirects to proper navigation route
export default function NavigationRedirect() {
  redirect("/navigate");
}
