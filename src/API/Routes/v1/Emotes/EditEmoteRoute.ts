import { HttpRequest, r } from '@marblejs/core';
import { Constants } from '@typings/src/Constants';
import { DataStructure } from '@typings/typings/DataStructure';
import { ObjectId } from 'mongodb';
import { defer, iif, of, throwError } from 'rxjs';
import { switchMap, tap, catchError, map, mapTo } from 'rxjs/operators';
import { AuditLogMiddleware, InsertAuditChange, InsertAuditTarget } from 'src/API/Middlewares/AuditLogMiddleware';
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
	r.use(AuditLogMiddleware('EMOTE_EDIT')),
	r.useEffect(req$ => req$.pipe(
		map(req => req as HttpRequest<Body, { emote: string; }> & WithUser),

		// Verify emote ID
		switchMap(req => ObjectId.isValid((req.params as any).emote) ? of(req) : req.response.send({ status: 400, body: { error: 'Invalid Emote ID' } })),

		// Find the emote
		switchMap(req => EmoteStore.Get().findEmote(req.params.emote as string).pipe(map(emote => ({ emote, req })))),
		switchMap(({ req, emote }) => (req.user?.getUser ?? throwError(Error('Unknown User'))).pipe(map(user => ({ user, req, emote })))),

		// Update the emote
		tap(({ emote }) => console.log('Emote State', emote.data.status)),
		switchMap(({ emote, req, user }) => iif(() => emote.data.status === Constants.Emotes.Status.PROCESSING,
			defer(() => req.response.send({ status: 423, body: { error: 'Emote is Processing.' } })), // Decline the request if the emote is still processing
			of({ emote, req, user })
		)),

		map(x => ({ ...x, oldEmoteData: Object.create(x.emote.data) as DataStructure.Emote })),
		switchMap(({ emote, oldEmoteData, req, user }) => emote.update({
			global: req.body.global,
			name: req.body.name,
			private: req.body.private,
			tags: req.body.tags,
			owner: ObjectId.isValid(req.body.owner) ? new ObjectId(req.body.owner) : undefined
		} as Emote.UpdateOptions, user).pipe(
			// Log edit
			tap(emote => Logger.Get().info(`<Emote> Edit ${emote} by ${user} (${Object.keys(req.body).map(k => `${k}: ${(req.body as any)[k]}`)})`)),

			// Add audit log meta
			mapTo(req),
			InsertAuditChange(req => Object.keys(req.body)
				.map(key => ({
					key,
					new_value: (req.body as any)[key],
					old_value: (oldEmoteData as any)[key]
				}) as DataStructure.AuditLog.Entry.Change)
			),
			InsertAuditTarget(() => ({ id: emote.id, type: 'emotes' })), // Add emote as target in audit log entry

			mapTo(emote),
			catchError(err => req.response.send({ status: 400, body: { error: err.message } }))
		)),

		map(emote => ({
			body: emote.resolve()
		}))
	))
);

interface Body extends Emote.UpdateOptions {}
