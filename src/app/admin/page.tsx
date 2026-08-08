import { redirect } from "next/navigation";
import { AdminPanel } from "@/components/AdminPanel";
import { getCurrentUser } from "@/lib/auth";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin");
  if (user.role !== "admin") redirect("/chat");
  return <AdminPanel admin={user} />;
}
