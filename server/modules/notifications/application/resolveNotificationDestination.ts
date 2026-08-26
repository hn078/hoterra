import type { Capability } from '../../access-control';

const DESTINATION_CAPABILITIES: ReadonlyArray<readonly [RegExp, Capability]> = [
  [/^\/documents(?:\/|$)/, 'documents.read'],
  [/^\/approvals(?:\/|$)/, 'approvals.read'],
  [/^\/archive(?:\/|$)/, 'documents.archive'],
  [/^\/workforce(?:\/|$)/, 'workforce.read'],
  [/^\/users(?:\/|$)/, 'users.directory.read'],
  [/^\/roles(?:\/|$)/, 'roles.read'],
  [/^\/templates(?:\/|$)/, 'templates.read'],
  [/^\/departments(?:\/|$)/, 'departments.read'],
  [/^\/workflows(?:\/|$)/, 'workflows.read'],
  [/^\/reports(?:\/|$)/, 'reports.read'],
  [/^\/audit(?:\/|$)/, 'audit.read'],
  [/^\/settings(?:\/|$)/, 'settings.read'],
  [/^\/notifications(?:\/|$)/, 'notifications.read'],
  [/^\/search(?:\/|$)/, 'search.use'],
  [/^\/messages(?:\/|$)/, 'messages.use'],
  [/^\/(?:dashboard)?$/, 'dashboard.view'],
];

/**
 * Notifications may only navigate to known, same-origin application routes.
 * Object-level authorization is still enforced by the destination API.
 */
export function resolveNotificationDestination(
  link: string | null | undefined,
  capabilities: readonly Capability[],
): string | null {
  if (!link || !link.startsWith('/') || link.startsWith('//') || link.includes('\\')) return null;

  let parsed: URL;
  try {
    parsed = new URL(link, 'https://hoterra.invalid');
  } catch {
    return null;
  }

  if (parsed.origin !== 'https://hoterra.invalid') return null;
  const destination = `${parsed.pathname}${parsed.search}${parsed.hash}`;
  const requirement = DESTINATION_CAPABILITIES.find(([pattern]) => pattern.test(parsed.pathname));
  if (!requirement || !capabilities.includes(requirement[1])) return null;
  return destination;
}
