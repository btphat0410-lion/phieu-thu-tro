const USERNAME_PATTERN = /^[a-zA-Z0-9._-]{3,32}$/;

export function normalizeUsername(value) {
  const username = String(value || '').trim();
  return USERNAME_PATTERN.test(username) ? username.toLowerCase() : '';
}

function usernameEmailDomain(supabaseUrl) {
  return `login.${new URL(supabaseUrl).hostname.toLowerCase()}`;
}

export function usernameToAuthEmail(username, supabaseUrl) {
  return `${normalizeUsername(username)}@${usernameEmailDomain(supabaseUrl)}`;
}

export function usernameFromAuthEmail(email, supabaseUrl) {
  const suffix = `@${usernameEmailDomain(supabaseUrl)}`;
  const normalizedEmail = String(email || '').toLowerCase();
  if (!normalizedEmail.endsWith(suffix)) return '';
  return normalizeUsername(normalizedEmail.slice(0, -suffix.length));
}
