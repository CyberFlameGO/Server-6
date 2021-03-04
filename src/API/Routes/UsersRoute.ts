import { combineRoutes, HttpRequest, r } from '@marblejs/core';
import { concatMap, count, map, mapTo, switchMap, take, tap } from 'rxjs/operators';
import { Mongo } from 'src/Db/Mongo';
import { AuthorizeMiddleware, WithUser } from 'src/API/Middlewares/AuthorizeMiddleware';
import { defer, EMPTY, from, fromEvent, iif, of } from 'rxjs';
import { Constants } from '@typings/src/Constants';
import { ObjectId } from 'mongodb';
import { DataStructure } from '@typings/typings/DataStructure';
import { Emote } from 'src/Emotes/Emote';
import { TwitchUser } from 'src/Util/TwitchUser';

/**
 * GET /users/:user
 *
 * Get a user or the current user
 */
const GetUserRoute = r.pipe(
	r.matchPath('/:user'),
	r.matchType('GET'),
	r.use(AuthorizeMiddleware(true)),
	r.useEffect(req$ => req$.pipe(
		map(req => req as HttpRequest<unknown, { user: string}> & WithUser),

		// @me :user param means the request is for the current authenticated user
		switchMap(req => iif(() => req.params.user === '@me', // Should get the current user?
			of(!!req.user?.id).pipe( // Try to get current user
				switchMap(auth => (auth && !!req.user?.getUser) ? req.user?.getUser : req.response.send({ status: 401, body: { error: 'Cannot request current user while unauthenticated' } }))
			),
			of(req).pipe( // Get specified user by ID
				// Object ID is valid?
				switchMap(req => ObjectId.isValid(req.params.user) ? Mongo.Get().collection('users') : req.response.send({ status: 400, body: { error: 'Invalid Object ID' } })),
				switchMap(col => col.findOne({ // Find the user in DB
					_id: new ObjectId(req.params.user)
				})),
				switchMap(data => !!data ? of(data) : req.response.send({ status: 404, body: { error: 'Unknown User' } })),
				map(data => new TwitchUser(data)) // Serialize to TwitchUser
			)
		).pipe(map(user => ({ user: user.data, req })))),
		map(({ user }) => ({ body: { ...user, id: undefined } })) // Hide the Twitch ID, as Twitch does not make this information public outside of OAuth2
	))
);

/**
 * Temporary endpoint to mass delete emotes
 */
const BulkDeleteUserEmotes = r.pipe(
	r.matchPath('/:user/emotes'),
	r.matchType('DELETE'),
	r.use(AuthorizeMiddleware(false)),
	r.useEffect(req$ => req$.pipe(
		map(req => req as HttpRequest<{}, { user: string }> & WithUser),

		switchMap(req => (req.user?.getUser ?? EMPTY).pipe(map(user => ({ req, user })))),
		// Deny if not admin
		switchMap(({ req, user }) => iif(() => (user.data.rank ?? 0) >= Constants.Users.Rank.ADMIN,
			of({ req, user }),
			defer(() => req.response.send({
				status: 403,
				body: { error: 'Missing Access' }
			}))
		)),

		// Find all emotes of target user
		switchMap(({ req, user }) => Mongo.Get().collection('emotes').pipe(
			switchMap(col => fromEvent<DataStructure.Emote>(col.find({ owner: new ObjectId(req.params.user) }).stream(), 'data'))
		)),

		concatMap(emote => new Emote(emote).delete()),
		count(),
		map(count => ({ body: { message: `Deleted ${count} emotes` } }))
	))
);

export const UsersRoute = combineRoutes('/users', [
	GetUserRoute,
	BulkDeleteUserEmotes
]);
