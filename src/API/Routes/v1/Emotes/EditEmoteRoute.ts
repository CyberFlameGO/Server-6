import { HttpRequest, r } from '@marblejs/core';
import { ObjectId } from 'mongodb';
import { of, throwError } from 'rxjs';
import { switchMap, tap, catchError, map } from 'rxjs/operators';
import { AuthorizeMiddleware, WithUser } from 'src/API/Middlewares/AuthorizeMiddleware';
import { Emote } from 'src/Emotes/Emote';
import { EmoteStore } from 'src/Emotes/EmoteStore';
import { Logger } from 'src/Util/Logger';



/**
 * PATCH /emotes/:emote
 *
 * Edit an emote
 */
export const EditEmoteRoute = r.pipe(
	r.matchPath('/:emote'),
	r.matchType('PATCH'),
	r.use(AuthorizeMiddleware(false)),
	r.useEffect(req$ => req$.pipe(
		map(req => req as HttpRequest<{}, { emote: string; }> & WithUser),

		// Verify emote ID
		switchMap(req => ObjectId.isValid((req.params as any).emote) ? of(req) : req.response.send({ status: 400, body: { error: 'Invalid Emote ID' } })),

		// Find the emote
		switchMap(req => EmoteStore.Get().findEmote(req.params.emote as string).pipe(map(emote => ({ emote, req })))),
		switchMap(({ req, emote }) => (req.user?.getUser ?? throwError(Error('Unknown User'))).pipe(map(user => ({ user, req, emote })))),

		// Update the emote
		switchMap(({ emote, req, user }) => emote.update(req.body as Emote.UpdateOptions, user).pipe(
			// Log edit
			tap(emote => Logger.Get().info(`<Emote> Edit ${emote} by ${user} (${Object.keys(req.body).map(k => `${k}: ${(req.body as any)[k]}`)})`)),
			catchError(err => req.response.send({ status: 400, body: { error: err.message } }))
		)),

		map(emote => ({
			body: emote.resolve()
		}))
	))
);
