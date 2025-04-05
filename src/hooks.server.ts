import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.hardRefresh = event.request.headers.get('Cache-Control') === 'no-cache';
	const response = await resolve(event);
	return response;
};