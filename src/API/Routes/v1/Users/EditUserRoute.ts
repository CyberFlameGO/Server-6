import { combineRoutes, HttpRequest, r } from '@marblejs/core';
import { Constants } from '@typings/src/Constants';
import { defer, iif, of } from 'rxjs';
import { map, mapTo, switchMap } from 'rxjs/operators';
import { AuthorizeMiddleware, WithUser } from 'src/API/Middlewares/AuthorizeMiddleware';
import { TwitchUser } from 'src/Components/TwitchUser';

namespace BanUser {
	export const Route = r.pipe(
		r.matchPath('/ban'),
		r.matchType('POST'),
		r.use(AuthorizeMiddleware(false)),
		r.useEffect(req$ => req$.pipe(
			map(req => req as HttpRequest<Body, Params> & WithUser),
			switchMap(req => req.user.getUser.pipe(map(user => ({ user, req })))),

			// Verify actor can do this
			switchMap(({ req, user }) => iif(() => (user.data.rank ?? 0) >= Constants.Users.Rank.MODERATOR,
				of(req),
				defer(() => req.response.send({ status: 403, body: { error: 'You are not permitted to do this' } }))
			)),

			// Get the target user
			switchMap(req => TwitchUser.find(req.params.user).pipe(map(victim => ({ victim, req })))),

			// Ban the target user
			// Fuck you, leatherman
			switchMap(({ req, victim }) => victim.ban(req.body?.reason)),

			mapTo({ status: 204, body: {} })
		))
	);

	interface Body {
		reason: string;
	}
	interface Params {
		user: string;
	}
}

export const EditUserRoute = combineRoutes('/:user', [
	BanUser.Route
]);
