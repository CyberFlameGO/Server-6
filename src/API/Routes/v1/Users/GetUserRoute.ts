import { HttpRequest, r } from '@marblejs/core';
import { ObjectId } from 'mongodb';
import { iif, of } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { AuthorizeMiddleware, WithUser } from 'src/API/Middlewares/AuthorizeMiddleware';
import { Mongo } from 'src/Db/Mongo';
import { TwitchUser } from 'src/Util/TwitchUser';

/**
 * GET /users/:user
 *
 * Get a user or the current user
 */
export const GetUserRoute = r.pipe(
	r.matchPath('/:user'),
	r.matchType('GET'),
	r.use(AuthorizeMiddleware(true)),
	r.useEffect(req$ => req$.pipe(
		map(req => req as HttpRequest<unknown, { user: string }> & WithUser),

		// @me :user param means the request is for the current authenticated user
		switchMap(req => iif(() => req.params.user === '@me', // Should get the current user?
			of(!!req.user?.id).pipe( // Try to get current user
				switchMap(auth => (auth && !!req.user?.getUser) ? req.user?.getUser : req.response.send({ status: 401, body: { error: 'Cannot request current user while unauthenticated' } }))
			),
			of(req).pipe( // Get specified user by ID
				// Object ID is valid?
				switchMap(() => Mongo.Get().collection('users')),
				switchMap(col => col.findOne({ // Find the user in DB
					$or: ObjectId.isValid(req.params.user)
						? [{ _id: new ObjectId(req.params.user) }]
						: [{ display_name: req.params.user }, { login: req.params.user }]

				})),
				switchMap(data => !!data ? of(data) : req.response.send({ status: 404, body: { error: 'Unknown User' } })),
				map(data => new TwitchUser(data)) // Serialize to TwitchUser
			)
		).pipe(map(user => ({ user: user.data, req })))),
		map(({ user }) => ({ body: { ...user, id: undefined } })) // Hide the Twitch ID, as Twitch does not make this information public outside of OAuth2
	))
);
