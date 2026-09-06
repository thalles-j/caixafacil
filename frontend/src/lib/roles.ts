export type UserRole = 'client' | 'admin';

export function postLoginPath(role: UserRole): '/admin' | '/dashboard' {
  return role === 'admin' ? '/admin' : '/dashboard';
}
