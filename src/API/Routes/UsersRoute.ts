import { combineRoutes, HttpRequest, r } from '@marblejs/core';
import { concatMap, count, map, mapTo, switchMap, take, tap } from 'rxjs/operators';
import { Mongo } from 'src/Db/Mongo';
import { AuthorizeMiddleware, WithUser } from 'src/API/Middlewares/AuthorizeMiddleware';
import { defer, EMPTY, fromEvent, iif, of } from 'rxjs';
import { Constants } from '@typings/src/Constants';
import { ObjectId } from 'mongodb';
import { DataStructure } from '@typings/typings/DataStructure';
import { Emote } from 'src/Emotes/Emote';

const GetCurrentUserRoute = r.pipe(
	r.matchPath('/@me'),
	r.matchType('GET'),
	r.use(AuthorizeMiddleware()),
	r.useEffect(req$ => req$.pipe(
		map(req => req as HttpRequest<unknown, { user: string}>),

		switchMap(req => Mongo.Get().collection('users').pipe(map(col => ({ req, col })))),
		switchMap(({ col, req }) => col.findOne({
			_id: req.user?.id
		})),
		map(user => ({ body: { ...user } }))
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
	GetCurrentUserRoute,
	BulkDeleteUserEmotes
]);
