const confirmedTokens = new WeakSet();

function issueConfirmationAuthorization(details) {
  const token = Object.freeze({ ...details });
  confirmedTokens.add(token);
  return token;
}

function isConfirmationAuthorization(token, actionKind) {
  return Boolean(token && confirmedTokens.has(token) && token.action_kind === actionKind && token.consumed_at);
}

module.exports = { issueConfirmationAuthorization, isConfirmationAuthorization };
