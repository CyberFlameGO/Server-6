import { combineRoutes, HttpRequest, r } from '@marblejs/core';
import { Collection } from 'mongodb';
import { Constants } from '@typings/src/Constants';
import { DataStructure } from '@typings/typings/DataStructure';
import { ObjectId } from 'bson';
import { asyncScheduler, BehaviorSubject, defer, iif, of, scheduled } from 'rxjs';
import { catchError, map, mergeAll, reduce, switchMap, switchMapTo } from 'rxjs/operators';
import { AuthorizeMiddleware, WithUser } from 'src/API/Middlewares/AuthorizeMiddleware';
import { Mongo } from 'src/Db/Mongo';
import { EmoteStore } from 'src/Emotes/EmoteStore';
import { TwitchUser } from 'src/Util/TwitchUser';

/**
* PUT /channels/:channel/emotes/:emote
*
* Add an emote to a channel
*/
export const AddChannelEmoteRoute = r.pipe(
	r.matchPath('/:channel/emotes/:emote'),
	r.matchType('PUT'),
	r.use(AuthorizeMiddleware(false)),
	r.useEffect(req$ => req$.pipe(
		map(req => req as HttpRequest<{}, SetChannelEmoteParams, {}> & WithUser),

		// Get user & emote
		switchMap(req => req.user.getUser.pipe(map(user => ({ actor: user, req })))),
		switchMap(({ req, actor }) => iif(() => req.params.channel === '@me',
			req.user?.getUser.pipe(map(user => ({ user, req }))), // Get current user?
			ObjectId.isValid(req.params.channel) // Get requested user?
				? of(undefined).pipe(
					switchMapTo(TwitchUser.find(req.params.channel)),
					// Does requester has the permission for this?
					switchMap(user =>
						user.id?.equals(actor.id as ObjectId) || // User ID is equal to actor's ID?
						// Or actor is moderator?
						(actor.data.rank ?? 0) >= Constants.Users.Rank.MODERATOR ? of(user) : req.response.send({ status: 403, body: { error: 'You are not permitted to do this' } })
					),
					map(user => ({ user, req }))
				)
				: defer(() => req.response.send({ status: 400, body: { error: 'Invalid Object ID (channel)' } }))
		)),

		// Get the requested emote
		switchMap(({ req, user }) => EmoteStore.Get().findEmote(req.params.emote).pipe(map(emote => ({ emote, req, user }))).pipe(
			catchError(err => req.response.send({ status: 404, body: { error: err.message } }))
		)),

		// Update the user
		switchMap(({ emote, req, user}) => iif(() => emote.data.status === Constants.Emotes.Status.PROCESSING,
			defer(() => req.response.send({ status: 423, body: { error: 'Emote is Processing.' } })), // Decline the request if the emote is still processing
			of({ emote, req, user })
		)),
		switchMap(({ user, emote, req }) => !emote.data.global ? emote.addToChannel(user) : req.response.send({ status: 403, body: { error: 'Emote is Global' } })),

		map(user => ({
			body: user.data
		}))
	))
);

/**
 * DELETE /channels/:channel/emotes/:emote
 */
const DeleteChannelEmoteRoute = r.pipe(
	r.matchPath('/:channel/emotes/:emote'),
	r.matchType('DELETE'),
	r.use(AuthorizeMiddleware(false)),
	r.useEffect(req$ => req$.pipe(
		map(req => req as HttpRequest<{}, SetChannelEmoteParams, {}> & WithUser),

		// Get user & emote
		switchMap(req => req.user.getUser.pipe(map(user => ({ actor: user, req })))),
		switchMap(({ req, actor }) => iif(() => req.params.channel === '@me',
			req.user?.getUser.pipe(map(user => ({ user, req }))), // Get current user?
			ObjectId.isValid(req.params.channel) // Get requested user?
				? of(undefined).pipe(
					switchMapTo(TwitchUser.find(req.params.channel)),
					// Does requester has the permission for this?
					switchMap(user =>
						user.id?.equals(actor.id as ObjectId) || // User ID is equal to actor's ID?
						// Or actor is moderator?
						(actor.data.rank ?? 0) >= Constants.Users.Rank.MODERATOR ? of(user) : req.response.send({ status: 403, body: { error: 'You are not permitted to do this' } })
					),
					map(user => ({ user, req }))
				)
				: defer(() => req.response.send({ status: 400, body: { error: 'Invalid Object ID (channel)' } }))
		)),

		// Get the requested emote
		switchMap(({ req, user }) => EmoteStore.Get().findEmote(req.params.emote).pipe(map(emote => ({ emote, req, user }))).pipe(
			catchError(err => req.response.send({ status: 404, body: { error: err.message } }))
		)),

		// Update the user
		switchMap(({ user, emote, req }) => emote.removeFromChannel(user)),

		map(user => ({ body: user.data }))
	))
);


let lidlCache = new BehaviorSubject<DataStructure.Emote[]>([]);
const GetChannelEmotesRoute = r.pipe(
	r.matchPath('/:channel/emotes'),
	r.matchType('GET'),
	r.useEffect(req$ => req$.pipe(
		map(req => req as HttpRequest<{}, { channel: string; }>),
		switchMap(req => scheduled([
			Mongo.Get().collection('emotes'),
			Mongo.Get().collection('users')
		], asyncScheduler).pipe( // Get collections for emotes & users
			mergeAll(),
			map(col => ({ [col.collectionName as ('emotes' | 'users')]: col })),
			reduce((col1, col2) => ({ ...col1, ...col2 })),
			map(x => ({ ...x, req }) as { emotes: Collection<DataStructure.Emote>, users: Collection<DataStructure.TwitchUser>, req: typeof req })
		)),
		switchMap(({ req, emotes, users }) => users.findOne({ // Find the user, by ID or login name
			login: req.params.channel.toLowerCase(),
			$or: [ObjectId.isValid(req.params.channel) ? { _id: ObjectId.createFromHexString(req.params.channel) } : {}]
		}).then(user => ({ user, emotes }))),

		// Get & emit the user's emotes
		switchMap(({ user, emotes }) => emotes.find({
			_id: { $in: user?.emotes as ObjectId[] },
			$or: [{ global: false }, { global: undefined }] // Omit global emotes, as they're available regardless of being a channel emote
		}).toArray()),

		map(emotes => ({
			body: { count: emotes.length, emotes }
		}))
	))
);

export const ChannelsRoute = combineRoutes('/channels', [
	AddChannelEmoteRoute,
	DeleteChannelEmoteRoute,
	GetChannelEmotesRoute
]);

/**
 * Parameters for DELETE & PUT methods of /:channel/emotes/:emote
 */
interface SetChannelEmoteParams {
	channel: string;
	emote: string;
}
