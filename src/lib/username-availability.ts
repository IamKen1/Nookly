import { prisma } from "@/lib/prisma";

const sanitize = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "");

export interface UsernameAvailability {
  available: boolean;
  suggestions: string[];
}

export async function checkUsernameAvailability(
  desired: string,
  opts: { businessSlug?: string; firstName?: string; lastName?: string } = {}
): Promise<UsernameAvailability> {
  const base = sanitize(desired);
  if (!base) return { available: false, suggestions: [] };

  const existing = await prisma.user.findUnique({ where: { username: base }, select: { id: true } });
  if (!existing) return { available: true, suggestions: [] };

  // Build a shortlist of meaningful candidates first (business/initials-based),
  // then fall back to numeric suffixes until we have enough available options.
  const candidates: string[] = [];
  if (opts.businessSlug) candidates.push(`${base}.${sanitize(opts.businessSlug)}`);
  if (opts.firstName && opts.lastName) {
    const initials = `${opts.firstName[0]}${opts.lastName[0]}`.toLowerCase();
    candidates.push(`${base}.${initials}`, `${initials}.${base}`);
  }
  for (let i = 1; i <= 20 && candidates.length < 20; i++) candidates.push(`${base}${i}`);

  const taken = await prisma.user.findMany({
    where: { username: { in: candidates } },
    select: { username: true },
  });
  const takenSet = new Set(taken.map((u) => u.username));

  const suggestions = candidates.filter((c) => !takenSet.has(c)).slice(0, 4);

  return { available: false, suggestions };
}
