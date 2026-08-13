import { redirect } from "next/navigation";
import { ModelLab } from "@/components/lab";
import { getPageUser } from "@/lib/auth";

export default async function LabPage() {
  const user = await getPageUser();
  if (!user) redirect("/login?next=/lab");
  if (user.role !== "admin") redirect("/chat");
  return <ModelLab admin={user} />;
}
