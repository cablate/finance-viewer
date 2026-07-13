const { safeErrorMessage } = require('../api-helpers');
const { FinanceError, errorEnvelope } = require('./contracts');

async function readFinanceJson(request, { maxBytes = null } = {}) {
  try {
    const body = await request.text();
    if (maxBytes !== null && new TextEncoder().encode(body).byteLength > maxBytes) {
      throw new FinanceError('VALIDATION_ERROR', `Request exceeds ${Math.floor(maxBytes / 1024)} KiB`, { status: 413 });
    }
    return JSON.parse(body);
  } catch (error) {
    if (error instanceof FinanceError) throw error;
    throw new FinanceError('VALIDATION_ERROR', '請求內容不是有效的 JSON', { status: 400 });
  }
}

function actorFromRequest(request) {
  const explicitActor = request.headers.get('x-last-say-actor');
  return {
    type: explicitActor === 'ai'
      ? 'external_ai'
      : (request.headers.get('sec-fetch-site') === 'same-origin' ? 'human_ui' : 'external_api'),
    note: request.headers.get('x-last-say-actor-note')?.slice(0, 500) || null,
  };
}

function financeErrorResponse(error) {
  if (!(error instanceof FinanceError)) safeErrorMessage(error);
  return errorEnvelope(error);
}

module.exports = { readFinanceJson, actorFromRequest, financeErrorResponse };
