// utils/guardChecker.js

const DestructiveRegex = /(delete|remove.?account|deactivate|erase)/i;
const SubscriptionRegex = /(cancel.?subscription|unsubscribe|downgrade)/i;
const FinancialRegex = /(confirm.?purchase|place.?order|pay.?now|submit.?payment|checkout|transfer.?funds|send.?money|buy.?now|renew)/i;

/**
 * Evaluates if an action on a specific element requires human consent.
 * @param {HTMLElement} element The target DOM element.
 * @param {string} actionType The type of action (e.g., 'click', 'navigate').
 * @returns {object} { isGuarded: boolean, reason: string }
 */
export function checkGuardedAction(element, actionType) {
  if (actionType !== 'click') {
    return { isGuarded: false, reason: null };
  }

  const textToEvaluate = `
    ${element.innerText || ''} 
    ${element.value || ''} 
    ${element.getAttribute('aria-label') || ''} 
    ${element.id || ''}
  `.toLowerCase();

  if (DestructiveRegex.test(textToEvaluate)) {
    return { isGuarded: true, reason: 'Destructive Action' };
  }
  
  if (SubscriptionRegex.test(textToEvaluate)) {
    return { isGuarded: true, reason: 'Subscription Change' };
  }
  
  if (FinancialRegex.test(textToEvaluate)) {
    return { isGuarded: true, reason: 'Financial Transaction' };
  }

  // TODO: Add Domain checking and File upload/download checking as per rules.md
  
  return { isGuarded: false, reason: null };
}
