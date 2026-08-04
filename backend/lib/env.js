function getAnthropicKey() {
  return process.env.ANTHROPIC_API_KEY?.trim() || "";
}

function isAnthropicConfigured() {
  return Boolean(getAnthropicKey());
}

function getAutoapplySecrets() {
  return [...new Set([
    process.env.AUTOAPPLY_SECRET?.trim(),
    process.env.AUTOAPPLY_SECRET_NEXT?.trim(),
  ].filter(Boolean))];
}

function isAuthRequired() {
  return getAutoapplySecrets().length > 0;
}

/** Send 503 and return false when Anthropic is not configured. */
function requireAnthropicKey(res) {
  if (!isAnthropicConfigured()) {
    res.status(503).json({ error: "ANTHROPIC_API_KEY is not configured on the server." });
    return false;
  }
  return true;
}

module.exports = {
  getAnthropicKey,
  getAutoapplySecrets,
  isAnthropicConfigured,
  isAuthRequired,
  requireAnthropicKey,
};
