export const HOME_PATH = "/";

export function chatPath(sessionId: string): string {
  return `/c/${sessionId}`;
}
