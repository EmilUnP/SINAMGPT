import { redirect } from "next/navigation";
import { AdminPanel } from "@/components/admin";
import { getPageUser } from "@/lib/auth";

export default async function AdminPage() {
  const user = await getPageUser();
  if (!user) redirect("/login?next=/admin");
  if (user.role !== "admin") redirect("/chat");
  return <AdminPanel admin={user} />;
}
