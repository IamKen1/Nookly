import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { issuePasswordResetToken } from "@/lib/password-reset";
import { sendAlertEmail } from "@/lib/email";

// Always returns the same generic message regardless of whether the account
// actually exists — this endpoint must never be usable to enumerate accounts.
const GENERIC_RESPONSE = {
  message: "If that account exists, we've sent a password reset link to the email on file.",
};

export async function POST(request: NextRequest) {
  try {
    const { identifier } = await request.json();
    if (!identifier) {
      return NextResponse.json({ error: "Username is required." }, { status: 400 });
    }

    // Usernames are globally unique, so a single lookup identifies the account
    // and its workspace — no need to ask for a workspace name here either.
    const user = await prisma.user.findUnique({ where: { username: identifier } });

    if (user?.isActive) {
      const tenant = await prisma.tenant.findUnique({ where: { id: user.tenantId } });
      if (tenant?.isActive) {
        const rawToken = await issuePasswordResetToken(user.id);
        if (rawToken) {
          const origin = new URL(request.url).origin;
          const resetLink = `${origin}/reset-password?token=${rawToken}`;
          await sendAlertEmail({
            to: [user.email],
            subject: "[Nookly] Reset your password",
            text: `Hi ${user.firstName},\n\nSomeone requested a password reset for your Nookly account (${tenant.name}). If this was you, reset your password here (link expires in 30 minutes):\n${resetLink}\n\nIf you didn't request this, you can safely ignore this email — your password won't change.`,
            html: `
              <div style="font-family: Arial, Helvetica, sans-serif; max-width: 480px; margin: 0 auto;">
                <p>Hi ${user.firstName},</p>
                <p>Someone requested a password reset for your Nookly account (<strong>${tenant.name}</strong>).</p>
                <p><a href="${resetLink}" style="display:inline-block;background:#059669;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none;">Reset your password</a></p>
                <p style="color:#71717a;font-size:13px;">This link expires in 30 minutes. If you didn't request this, you can safely ignore this email — your password won't change.</p>
              </div>
            `,
          }).catch((err) => console.error("Failed to send password reset email:", err));
        }
      }
    }

    return NextResponse.json(GENERIC_RESPONSE);
  } catch (error) {
    console.error("Forgot-password request failed", error);
    return NextResponse.json(GENERIC_RESPONSE);
  }
}
