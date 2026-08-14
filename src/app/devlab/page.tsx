import { redirect } from "next/navigation";
import { DevLab } from "@/components/devlab";
import { getPageUser } from "@/lib/auth";

export default async function DevLabPage() {
  const user = await getPageUser();
  if (!user) redirect("/login?next=/devlab");
  if (user.role !== "admin") redirect("/chat");
  return <DevLab admin={user} />;
}
