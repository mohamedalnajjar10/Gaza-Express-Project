const googleDestinationKey = 'gaza-express.google-destination.v1';

export function internalDestination(value: unknown, fallback = '/'): string {
  return typeof value === 'string' && /^\/(?![/\\])/.test(value) && !/[\t\r\n]/.test(value)
    ? value
    : fallback;
}

export function saveGoogleDestination(destination: string) {
  try {
    sessionStorage.setItem(googleDestinationKey, destination);
  } catch {
    // The OAuth flow can still continue when browser storage is disabled.
  }
}

export function takeGoogleDestination(): string {
  try {
    const destination = sessionStorage.getItem(googleDestinationKey);
    sessionStorage.removeItem(googleDestinationKey);
    return internalDestination(destination);
  } catch {
    return '/';
  }
}
