import { matchEvent, r, use } from '@marblejs/core';
import { multipart$ } from '@marblejs/middleware-multipart';
import { WsEffect } from '@marblejs/websockets';
import { ObjectId } from 'bson';
import { basename, extname } from 'path';
import { of, noop, throwError, iif } from 'rxjs';
import { switchMap, catchError, tap, map, delay, take, filter, mapTo, takeLast, mergeMap, takeWhile } from 'rxjs/operators';
import { AuthorizeMiddleware } from 'src/API/Middlewares/AuthorizeMiddleware';
import { Emote } from 'src/Emotes/Emote';
import { EmoteStore } from 'src/Emotes/EmoteStore';

/**
 * POST /emotes
 *
 * Create a new Emote
 */
export const CreateEmoteRoute = r.pipe(
	r.matchPath('/'),
	r.matchType('POST'),
	r.use(AuthorizeMiddleware()),
	r.useEffect(req$ => req$.pipe(
		switchMap(req => of(req).pipe(
			use(multipart$({ // Get multipart file
				maxFileCount: 2,
				maxFileSize: 25e5,
				stream: ({ file, mimetype, filename, fieldname }) => {
					if (mimetype === 'application/json' && (fieldname === 'data' && filename === 'FORM_CONTENT')) {
						file.on('data', (chunk: Buffer) => console.log(chunk.toString('utf8')));

						return of({ destination: { body: '' } });
					}
					return EmoteStore.Get().create(file, {
						mime: mimetype,
						name: basename(filename, extname(filename)),
						owner: req.user.id
					}).pipe(
						take(1),
						catchError(err => req.response.send({
							status: 400,
							body: { error: String(err) }
						})),
						tap(emote => req.meta ? req.meta.emote = emote : noop()), // Stick emote to request meta
						map(emote => ({ destination: `${emote.filepath}/og` })),
					);
				}
			})),
			map(req => ({
				req,
				emote: req.meta?.emote as Emote
			}))
		)),
		map(({ emote, req }) => ({
			body: emote.resolve()
		}))
	))
);

/**
 * WebSocket Subscriber
 *
 * Listen to Emote Creation Status
 */
export const WS_CreateEmoteStatus: WsEffect = (event$, ctx) =>
		event$.pipe(
			matchEvent('CreateEmote:Status'),
			tap(x => console.log(x.payload)),
			map(ev => (ev.payload as any)?.emoteId),
			switchMap(emoteId => ObjectId.isValid(emoteId) ? of(ObjectId.createFromHexString(emoteId)) : throwError(Error('Invalid Object ID'))),
			map(id => EmoteStore.Get().processing.get(id.toHexString())),
			switchMap(updates => !!updates ? updates : throwError(Error('Emote is not processing'))),
			mergeMap(update => of({
				...update,
				emote: update.emote.id.toHexString()
			})),
			map(payload => ({
				type: 'CreateEmote:Status',
				done: payload.done,
				payload
			})),
			tap(p => p.done ? ctx.client.terminate() : noop())
		);
