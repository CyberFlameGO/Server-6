import { HttpRequest, matchEvent, r } from '@marblejs/core';
import { WsEffect } from '@marblejs/websockets';
import { DataStructure } from '@typings/typings/DataStructure';
import { ObjectId } from 'mongodb';
import { from, fromEvent, iif, of } from 'rxjs';
import { buffer, bufferCount, concatMap, map, switchMap, take, takeLast, takeUntil, tap } from 'rxjs/operators';
import { AuthorizeMiddleware, WithUser } from 'src/API/Middlewares/AuthorizeMiddleware';
import { Mongo } from 'src/Db/Mongo';
import { TwitchUser } from 'src/Components/TwitchUser';

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

/**
 * WebSocket Subscriber
 *
 * Stream App Users
 */
export const WS_RequestUsers: WsEffect = event$ => {
	return event$.pipe(
		matchEvent('GetUsers'),
		switchMap(ev => Mongo.Get().collection('users').pipe(map(col => ({ col, ev })))),
		map(({ col, ev }) => ({ // Stream the users
			stream: col.find({}).stream(),
			col, ev
		})),

		// Listen for streamed users
		switchMap(({ stream }) => fromEvent<DataStructure.TwitchUser>(stream, 'data').pipe(
			takeUntil(fromEvent<void>(stream, 'close').pipe(take(1))), // Handle end of stream: complete observer
			bufferCount(50), // Buffer up to 50 users for one packet
			map(users => ({ type: 'GetUsers', payload: { users } })) // Dispatch the users data
		))
	);
};
