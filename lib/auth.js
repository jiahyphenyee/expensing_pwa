// lib/auth.js
// PINs are stored in System config tab as: PWA_USER_1 = "Ahmad|5823|senior_worker"
// This function checks a PIN and returns the user if found, null if not

export function checkPin(pin, users) {
  for (const user of users) {
    const [name, userPin, role] = user.value.split('|');
    if (userPin === pin) return { name, role };
  }
  return null;
}