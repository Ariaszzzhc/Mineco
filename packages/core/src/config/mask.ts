export function maskApiKey(key: string | undefined): string {
  if (!key) return "";
  if (key.length <= 8) return "****";
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}
