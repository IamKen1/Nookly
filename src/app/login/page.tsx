import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import LoginClient from "@/components/auth/LoginClient";

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/dashboard");

  return <LoginClient />;
}
