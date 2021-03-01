import { combineRoutes, HttpRequest, r, use } from '@marblejs/core';
import { map, mapTo, switchMap, tap } from 'rxjs/operators';
import { DataStructure } from '@typings/DataStructure';
import { multipart$ } from '@marblejs/middleware-multipart';
import { EmoteStore } from 'src/Emotes/EmoteStore';
import { from, iif, noop, of, throwError } from 'rxjs';
import { authorize$ } from '@marblejs/middleware-jwt';
import { Config } from 'src/Config';
import { Emote } from 'src/Emotes/Emote';
import { basename, extname } from 'path';
import { API } from '@typings/API';
import { ObjectId } from 'mongodb';
import { Mongo } from 'src/Db/Mongo';

const MockData = [
	{
		name: 'xqcL',
		owner: 'Your Mom',
		// url: 'https://cdn.discordapp.com/emojis/797197297675010071.gif?v=1&size=32'
	},
	{
		name: 'PagMan',
		owner: 'Your Mom',
		// url: 'https://cdn.discordapp.com/emojis/732824111788851222.png?v=1&size=32'
	},
	{
		name: 'FeelsOkayMan',
		owner: 'Your Mom',
		// url: 'https://cdn.discordapp.com/emojis/695171992688787518.png?v=1&size=32'
	}
] as DataStructure.Emote[];

/**
 * GET /emotes/:channel
 *
 * List emotes for a speficic channel
 */
const GetChannelEmotes = r.pipe(
	r.matchPath('/ch/:channel'),
	r.matchType('GET'),
	r.useEffect(req$ => req$.pipe(
		map(req => {
			console.log(req.params);
			return { body: MockData };
		})
	))
);

namespace GetEmotes {
	/**
	 * GET /emotes
	 * Query: {  }
	 *
	 * Get a list of public emotes
	 */
	export const Route = r.pipe(
		r.matchPath('/'),
		r.matchType('GET'),
		r.useEffect(req$ => req$.pipe(
			map(req => req as HttpRequest<unknown, unknown, Query>),
			switchMap(req => Mongo.Get().collection('emotes').pipe(map(col => ({ col, req })))),
			switchMap(x => from(x.col.estimatedDocumentCount({})).pipe(map(totalEstimatedSize => ({ totalEstimatedSize, ...x })))),
			switchMap(({ req, col, totalEstimatedSize }) => { // Begin pagination
				const page = parseInt(req.query.page ?? 1); // The requested page (1 if unset)
				const pageSize = parseInt(req.query.pageSize ?? 16); // The requested size of the page (amount of documents to show)
				const skip = (page - 1) * pageSize; // How many documents should be skipped in order to reach the requested range

				return col.aggregate([ // Create aggregation pipeline
					{ $match: {} },
					{ $skip: skip },
					{ $limit: pageSize }
				]).toArray().then(emotes => ({ emotes, totalEstimatedSize }));
			}),
			map(({ emotes, totalEstimatedSize}) => ({
				body: {
					total_estimated_size: totalEstimatedSize,
					emotes
				}
			}))
		))
	);

	interface Query {
		page: string;
		pageSize: string;
	}
}


/**
 * GET /emotes/:emote
 *
 * Get a single emote
 */
export const GetEmote = r.pipe(
	r.matchPath('/:emote'),
	r.matchType('GET'),
	r.useEffect(req$ => req$.pipe(
		tap(req => console.log(req.params)),
		switchMap(req => Mongo.Get().collection('emotes').pipe(map(col => ({ col, req })))),
		switchMap(({ req, col }) => col.findOne({ _id: ObjectId.createFromHexString((req.params as any).emote) })),
		switchMap(emote => !!emote ? of(emote) : throwError('Unknown Emote')),
		map(emote => ({
			body: emote
		}))
	))
);

export const DeleteEmote = r.pipe(
	r.matchPath('/:emote'),
	r.matchType('DELETE'),
	r.use(authorize$({ // Authenticate the user
		secret: Config.jwt_secret
	}, (payload: API.TokenPayload) => of({ id: ObjectId.createFromHexString(payload.id), twid: payload.twid }))),
	r.useEffect(req$ => req$.pipe(
		switchMap(req => ObjectId.isValid((req.params as any).emote) ? of(req) : throwError(Error('Invalid Emote ID'))),
		switchMap(req => EmoteStore.Get().findEmote((req.params as any).emote).pipe(
			map(emote => ({ emote, req }))
		)),
		tap(e => console.log(e.emote)),
		switchMap(({ req, emote }) => iif(() => ObjectId.isValid(String(emote.data.owner)) && new ObjectId(emote.data.owner).equals(req.user.id),
			emote.delete(),
			throwError(Error('You are not permitted to do this'))
		)),
		mapTo({ body: {} })
	))
);

/**
 * POST /emotes
 *
 * Create a new Emote
 */
const CreateEmote = r.pipe(
	r.matchPath('/'),
	r.matchType('POST'),
	r.use(authorize$({ // Authenticate the user
		secret: Config.jwt_secret
	}, (payload: API.TokenPayload) => of({ id: payload.id, twid: payload.twid }))),
	r.useEffect(req$ => req$.pipe(
		switchMap(req => of(req).pipe(
			use(multipart$({ // Get multipart file
				stream: ({ file, mimetype, filename }) => {
					return EmoteStore.Get().create(file, {
						mime: mimetype,
						name: basename(filename, extname(filename)),
						owner: ObjectId.createFromHexString(req.user.id)
					}).pipe(
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

export const EmotesRoute = combineRoutes('/emotes', [
	GetEmotes.Route,
	GetEmote,
	DeleteEmote,
	CreateEmote,
	GetChannelEmotes
]);
