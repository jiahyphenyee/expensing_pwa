// Save user to session after PIN login
export function saveUser(user) {
  sessionStorage.setItem('pwa_user', JSON.stringify(user));
}

export function getUser() {
  try {
    return JSON.parse(sessionStorage.getItem('pwa_user'));
  } catch {
    return null;
  }
}

export function clearUser() {
  sessionStorage.removeItem('pwa_user');
}