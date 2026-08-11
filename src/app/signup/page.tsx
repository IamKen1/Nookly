import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import SignupClient from "@/components/auth/SignupClient";

export default async function SignupPage() {
  const session = await getSession();
  if (session) redirect("/dashboard");

  return <SignupClient />;
}
