function getAnthropicKey() {
  return process.env.ANTHROPIC_API_KEY?.trim() || "";
}

function isAnthropicConfigured() {
  return Boolean(getAnthropicKey());
}

function isAuthRequired() {
  return Boolean(process.env.AUTOAPPLY_SECRET?.trim());
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
  isAnthropicConfigured,
  isAuthRequired,
  requireAnthropicKey,
};
