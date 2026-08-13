export const MAX_SUPPORT_ATTACHMENTS = 3;

// tenantId omitted for admin replies, since admins upload under their own
// tenant folder rather than the ticket-owning tenant's — any nookly support
// folder is trusted once the request has already passed the admin gate.
export const sanitizeSupportAttachments = (value: unknown, tenantId?: string): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((url): url is string => typeof url === "string" && url.startsWith("https://res.cloudinary.com/"))
    .filter((url) => (tenantId ? url.includes(`/nookly/${tenantId}/support/`) : /\/nookly\/[^/]+\/support\//.test(url)))
    .slice(0, MAX_SUPPORT_ATTACHMENTS);
};
