export function isValidAdminBypassToken(candidate: string | null | undefined, configured = process.env.ADMIN_BYPASS_TOKEN) {
  const expected = configured?.trim();
  const received = candidate?.trim();

  return Boolean(expected && received && expected === received);
}
