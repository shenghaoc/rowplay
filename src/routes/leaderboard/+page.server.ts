import type { PageServerLoad } from './$types';
import { loadBoards } from '$lib/server/leaderboard';

/**
 * Public leaderboards — no auth redirect (boards are public, like /r/<token>);
 * when a session exists, loadBoards flags the viewer's own rows.
 */
export const load: PageServerLoad = async (event) => {
	const boards = await loadBoards(event);
	return { boards, demo: event.locals.demo };
};
