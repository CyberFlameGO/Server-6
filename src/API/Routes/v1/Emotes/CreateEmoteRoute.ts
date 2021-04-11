import { matchEvent, r, use } from '@marblejs/core';
import { multipart$ } from '@marblejs/middleware-multipart';
import { WsEffect } from '@marblejs/websockets';
import { Constants } from '@typings/src/Constants';
import { DataStructure } from '@typings/typings/DataStructure.v1';
import { ObjectId } from 'bson';
import { basename, extname } from 'path';
import { of, noop, throwError, iif, defer } from 'rxjs';
import { switchMap, catchError, tap, map, take, mergeMap, filter, delay } from 'rxjs/operators';
import { AuditLogMiddleware, InsertAuditChange, InsertAuditTarget } from 'src/API/Middlewares/AuditLogMiddleware';
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
	r.use(AuditLogMiddleware('EMOTE_CREATE')),
	r.useEffect(req$ => req$.pipe(
		switchMap(req => of(req).pipe(
			use(multipart$({ // Get multipart file
				maxFileCount: 2, // Only 2 files, the JSON metadata and the image BLOB
				maxFileSize: 25e5, // Set maximum file size (2.5MB)
				stream: ({ file, mimetype, filename, fieldname }) => {
					if (mimetype === 'application/json' && (fieldname === 'data' && filename === 'FORM_CONTENT')) {
						file.on('data', (chunk: Buffer) => { // Parse json data
							const data = JSON.parse(chunk.toString('utf8')) as Partial<DataStructure.Emote>;
							if (!!req.meta?.emote) { // Add emote data
								if (typeof data.name === 'string' && Constants.Emotes.NAME_REGEXP.test(data.name)) req.meta.emote.data.name = data.name;
								if (Array.isArray(data.tags)) req.meta.emote.data.tags = data.tags;
							}
						});

						return of({ destination: { body: '' } });
					}

					// Begin creating the emote
					return EmoteStore.Get().create(file, {
						mime: mimetype,
						name: basename(filename, extname(filename)),
						owner: req.user.id
					}).pipe(
						take(1),
						// The created emote will be emitted after being written to DB.
						// The request completes here, the user will then connect to the websocket for feedback on processing status
						catchError(err => req.response.send({
							status: 400,
							body: { error: String(err) }
						})),
						tap(emote => req.meta ? req.meta.emote = emote : noop()), // Stick emote to request meta
						map(emote => ({ destination: `${emote.filepath}/og` })),
					);
				}
			})),

			InsertAuditChange(req => { // Log this creation
				const emote = req.meta?.emote as Emote;

				return [
					{ key: 'name', old_value: null, new_value: emote.data.name },
					{ key: 'owner', old_value: null, new_value: emote.data.owner },
					{ key: 'private', old_value: null, new_value: emote.data.private },
					{ key: 'mime', old_value: null, new_value: emote.data.mime },
					{ key: 'status', old_value: null, new_value: emote.data.status },
					{ key: 'tags', old_value: [], new_value: emote.data.tags }
				];
			}),
			InsertAuditTarget(req => { // Add the emote as audit target
				const emote = req.meta?.emote as Emote;

				return { id: emote.id, type: 'emotes' };
			}),
			map(req => req.meta?.emote as Emote)
		)),
		map(emote => ({
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
		map(ev => (ev.payload as any)?.emoteId),
		switchMap(emoteId => ObjectId.isValid(emoteId) ? of(ObjectId.createFromHexString(emoteId)) : throwError(Error('Invalid Object ID'))),
		map(id => EmoteStore.Get().processingUpdate.pipe(
			filter(update => update.emoteID === id.toHexString())
		)),
		switchMap(updates => !!updates ? updates : throwError(Error('Emote is not processing'))),
		mergeMap(update => iif(() => update.error === true,
			defer(() => ctx.client.close(1011, update.message)),
			of(update)
		)),
		map(payload => ({
			type: 'CreateEmote:Status',
			done: payload.done,
			payload
		})),
		delay(500),
		tap(p => p.done ? ctx.client.close(1000, 'Processing complete') : noop())
	);
