export function assertImportSecret(
  provided?: string,
  expected = process.env.KNOWLEDGE_IMPORT_SECRET,
) {
  const requiredSecret = expected?.trim();
  if (!requiredSecret) {
    return;
  }

  if (provided !== requiredSecret) {
    throw new Error("Unauthorized import");
  }
}
