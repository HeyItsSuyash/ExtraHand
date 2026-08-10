// utils/domPruner.js - Logic for filtering out sensitive fields

export const HardBlockedSelectors = [
  'input[type="password"]',
  'input[type="hidden"][name*="csrf"]'
];

export const AutocompleteBlocked = [
  'cc-number', 'cc-exp', 'cc-csc', 'current-password', 'new-password', 'one-time-code'
];

export const SensitiveRegex = /(password|passwd|pwd|otp|mfa|2fa|totp|authenticator|ssn|social.?security|ccv|cvc|cvv|card.?number|cc.?num|bank.?account|acct.?num|routing.?number)/i;

/**
 * Checks if a given DOM element should be hard-blocked.
 * @param {HTMLElement} el
 * @returns {boolean} True if the element should be pruned.
 */
export function isHardBlocked(el) {
  // 1. Check direct selectors
  for (const selector of HardBlockedSelectors) {
    if (el.matches && el.matches(selector)) return true;
  }

  // 2. Check autocomplete
  const autocomplete = el.getAttribute('autocomplete');
  if (autocomplete && AutocompleteBlocked.some(blocked => autocomplete.toLowerCase().includes(blocked))) {
    return true;
  }

  // 3. Check regex heuristics against id, name, aria-label, etc.
  const id = el.id || '';
  const name = el.getAttribute('name') || '';
  const ariaLabel = el.getAttribute('aria-label') || '';
  const combined = `${id} ${name} ${ariaLabel}`.toLowerCase();
  
  if (SensitiveRegex.test(combined)) {
    return true;
  }

  return false;
}
