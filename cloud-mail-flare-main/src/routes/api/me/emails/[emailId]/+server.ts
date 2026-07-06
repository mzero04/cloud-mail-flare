import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { applyEmailQuickActionInDb, getEmailByIdFromDb, type EmailQuickAction } from '$lib/server/db';

export const GET: RequestHandler = async ({ locals, platform, params }) => {
  const userId = locals.sessionUserId;
  if (!userId) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const email = await getEmailByIdFromDb(platform?.env?.DB, userId, params.emailId);
  if (!email) {
    return json({ error: 'Email not found' }, { status: 404 });
  }

  return json({ email });
};

export const PATCH: RequestHandler = async ({ locals, platform, params, request }) => {
  const userId = locals.sessionUserId;
  if (!userId) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return json({ error: 'Expected JSON body' }, { status: 400 });
  }

  const payload = (await request.json()) as { action?: string };
  const action = payload.action?.trim().toLowerCase() as EmailQuickAction | undefined;
  if (action !== 'star' && action !== 'archive' && action !== 'delete') {
    return json({ error: 'Unsupported action' }, { status: 400 });
  }

  try {
    const result = await applyEmailQuickActionInDb(platform?.env?.DB, userId, params.emailId, action, `web:${userId}`);
    if (!result.updated && result.reason === 'not_found') {
      return json({ error: 'Email not found' }, { status: 404 });
    }

    if (!result.updated && result.reason === 'already_deleted') {
      return json({ ok: true, action, alreadyDeleted: true, email: result.email });
    }

    if (!result.updated && result.reason === 'already_archived') {
      return json({ ok: true, action, alreadyArchived: true, email: result.email });
    }

    return json({ ok: true, action, email: result.email });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('DB binding is required')) {
      return json({ error: 'Database is not configured' }, { status: 503 });
    }

    return json({ error: 'Failed to update email status' }, { status: 500 });
  }
};
