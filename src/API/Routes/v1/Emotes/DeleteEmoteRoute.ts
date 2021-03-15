import { HttpRequest, r } from '@marblejs/core';
import { ObjectId } from 'mongodb';
import { Constants } from '@typings/src/Constants';
import { of, EMPTY, iif, defer } from 'rxjs';
import { switchMap, tap, mapTo, map } from 'rxjs/operators';
import { AuthorizeMiddleware, WithUser } from 'src/API/Middlewares/AuthorizeMiddleware';
import { EmoteStore } from 'src/Emotes/EmoteStore';
import { Logger } from 'src/Util/Logger';


/**
 * DELETE /emotes/:emote
 *
 * Delete an emote
 */
export const DeleteEmoteRoute = r.pipe(
	r.matchPath('/:emote'),
	r.matchType('DELETE'),
	r.use(AuthorizeMiddleware(false)),
	r.useEffect(req$ => req$.pipe(
		map(req => req as HttpRequest & WithUser),

		// Verify emote ID
		switchMap(req => ObjectId.isValid((req.params as any).emote) ? of(req) : req.response.send({ status: 400, body: { error: 'Invalid Emote ID' } })),
		switchMap(req => EmoteStore.Get().findEmote((req.params as any).emote).pipe(
			map(emote => ({ emote, req }))
		)),
		switchMap(({ req, emote }) => (req.user?.getUser ?? EMPTY).pipe(map(user => ({ req, emote, user })))),
		switchMap(({ req, emote, user }) => iif(() => (ObjectId.isValid(String(emote.data.owner)) && new ObjectId(emote.data.owner).equals(user.id ?? '') || (user.data.rank ?? 0) >= Constants.Users.Rank.MODERATOR),
			emote.delete().pipe(
				tap(emote => Logger.Get().info(`<Emote> Delete ${emote} by ${user}`)),
				mapTo(req)
			),
			defer(() => req.response.send({ status: 403, body: { error: 'You are not permitted to do this' } }))
		)),
		map(() => ({
			status: 204,
			body: {}
		}))
	))
);
