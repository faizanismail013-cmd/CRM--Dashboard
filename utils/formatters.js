/**
 * SmartPay CRM — Shared INR Currency & Metric Formatters
 * Standardized Indian Rupee formatting across UI, REST APIs, and iKnow AI Agent.
 */

/**
 * Formats a numeric value into standard Indian Rupee (INR) currency string.
 * @param {number|string} value - The numerical value to format.
 * @param {boolean} [compact=false] - Whether to return compact notation (e.g. ₹1.50L, ₹2.00Cr, ₹5.50k).
 * @returns {string} Formatted Indian Rupee string.
 */
function formatINR(value, compact = false) {
  const num = Number(value) || 0;

  if (compact) {
    const abs = Math.abs(num);
    const sign = num < 0 ? '-' : '';
    if (abs >= 10000000) return `${sign}₹${(abs / 10000000).toFixed(2)}Cr`;
    if (abs >= 100000) return `${sign}₹${(abs / 100000).toFixed(1)}L`;
    if (abs >= 1000) return `${sign}₹${(abs / 1000).toFixed(1)}k`;
    return `${sign}₹${abs.toLocaleString('en-IN')}`;
  }

  return `₹${num.toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  })}`;
}

/**
 * Parses raw currency input string into number.
 * @param {string|number} val 
 * @returns {number}
 */
function parseINR(val) {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const clean = String(val).replace(/[^0-9.-]/g, '');
  return parseFloat(clean) || 0;
}

module.exports = {
  formatINR,
  parseINR
};
