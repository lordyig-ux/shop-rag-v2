const allowedAdminDomains = new Set(["terminalauto.ca", "valleycollision.ca"]);

export function isAllowedAdminEmail(email: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const atIndex = normalizedEmail.lastIndexOf("@");

  if (atIndex <= 0 || atIndex === normalizedEmail.length - 1) {
    return false;
  }

  return allowedAdminDomains.has(normalizedEmail.slice(atIndex + 1));
}
