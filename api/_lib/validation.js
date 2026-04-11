const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanText(value, maxLength = 255) {
  return String(value || "").trim().slice(0, maxLength);
}

function normalizeEmail(email) {
  return cleanText(email, 191).toLowerCase();
}

function isValidEmail(email) {
  return EMAIL_REGEX.test(normalizeEmail(email));
}

function validatePassword(password) {
  const value = String(password || "");

  if (value.length < 8) {
    return "كلمة المرور يجب أن تكون 8 أحرف على الأقل.";
  }

  if (!/[A-Z]/.test(value)) {
    return "يفضل أن تحتوي كلمة المرور على حرف كبير واحد على الأقل.";
  }

  if (!/\d/.test(value)) {
    return "يفضل أن تحتوي كلمة المرور على رقم واحد على الأقل.";
  }

  return "";
}

function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toNullableInt(value) {
  if (value === null || value === "" || typeof value === "undefined") {
    return null;
  }

  return toInt(value, null);
}

function toFlag(value) {
  return value === true || value === 1 || value === "1" || value === "true" ? 1 : 0;
}

function toEnum(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

module.exports = {
  clamp,
  cleanText,
  isValidEmail,
  normalizeEmail,
  toEnum,
  toFlag,
  toInt,
  toNullableInt,
  validatePassword,
};
