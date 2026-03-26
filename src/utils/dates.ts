export function isExpired(expiresAt: Date | null, now = new Date()): boolean {
  if (!expiresAt) {
    return false;
  }

  return expiresAt.getTime() < now.getTime();
}

export function formatDate(date: Date | null): string {
  if (!date) {
    return "без ограничения";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function getDaysLeft(expiresAt: Date | null, now = new Date()): number | null {
  if (!expiresAt) {
    return null;
  }

  const diff = expiresAt.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}
