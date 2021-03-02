import { combineRoutes, HttpRequest, r, use } from '@marblejs/core';
import { catchError, map, mapTo, switchMap, tap } from 'rxjs/operators';
import { DataStructure } from '@typings/typings/DataStructure';
import { multipart$ } from '@marblejs/middleware-multipart';
import { EmoteStore } from 'src/Emotes/EmoteStore';
import { defer, EMPTY, from, iif, noop, of, throwError } from 'rxjs';
import { Emote } from 'src/Emotes/Emote';
import { basename, extname } from 'path';
import { ObjectId, FilterQuery } from 'mongodb';
import { Mongo } from 'src/Db/Mongo';
import { AuthorizeMiddleware, WithUser } from 'src/API/Middlewares/AuthorizeMiddleware';
import { Constants } from '@typings/src/Constants';
import { Logger } from 'src/Util/Logger';

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
		r.use(AuthorizeMiddleware(true)),
		r.useEffect(req$ => req$.pipe(
			map(req => req as HttpRequest<{}, {}, Query> & WithUser),
			switchMap(req => Mongo.Get().collection('emotes').pipe(map(col => ({ col, req })))),
			switchMap(x => from(x.col.countDocuments(getQuery(x.req.user?.id))).pipe(map(totalEstimatedSize => ({ totalEstimatedSize, ...x })))),
			switchMap(async ({ req, col, totalEstimatedSize }) => { // Begin pagination
				const page = parseInt(req.query.page ?? 1); // The requested page (1 if unset)
				const pageSize = parseInt(req.query.pageSize ?? 16); // The requested size of the page (amount of documents to show)
				const skip = (page - 1) * pageSize; // How many documents should be skipped in order to reach the requested range

				return col.aggregate([ // Create aggregation pipeline
					{ $match: getQuery(req.user?.id) },
					{ $skip: skip },
					{ $limit: pageSize }
				]).toArray().then(emotes => ({ emotes, totalEstimatedSize }));
			}),
			map(({ emotes, totalEstimatedSize }) => ({
				body: {
					total_estimated_size: totalEstimatedSize,
					emotes
				}
			}))
		))
	);

	const getQuery = (userID: ObjectId | string | undefined) => ({ // Match non-private emotes (unless user is owner)
		$or: [{ private: false }, { owner: userID }]
	} as FilterQuery<DataStructure.Emote>);

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
		switchMap(req => Mongo.Get().collection('emotes').pipe(map(col => ({ col, req })))),
		switchMap(({ req, col }) => col.findOne({ _id: ObjectId.createFromHexString((req.params as any).emote) })),
		switchMap(emote => !!emote ? of(emote) : throwError('Unknown Emote')),
		map(emote => ({
			body: emote
		}))
	))
);

/**
 * DELETE /emotes/:emote
 *
 * Delete an emote
 */
export const DeleteEmote = r.pipe(
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

/**
 * PATCH /emotes/:emote
 *
 * Edit an emote
 */
export const EditEmote = r.pipe(
	r.matchPath('/:emote'),
	r.matchType('PATCH'),
	r.use(AuthorizeMiddleware(false)),
	r.useEffect(req$ => req$.pipe(
		map(req => req as HttpRequest<{}, { emote: string; }> & WithUser),

		// Verify emote ID
		switchMap(req => ObjectId.isValid((req.params as any).emote) ? of(req) : req.response.send({ status: 400, body: { error: 'Invalid Emote ID' } })),
		switchMap(req => EmoteStore.Get().findEmote(req.params.emote as string).pipe(map(emote => ({ emote, req })))),
		switchMap(({ req, emote }) => (req.user?.getUser ?? throwError(Error('Unknown User'))).pipe(map(user => ({ user, req, emote })))),
		switchMap(({ emote, req, user }) => emote.update(req.body as Emote.UpdateOptions, user).pipe(
			tap(emote => Logger.Get().info(`<Emote> Edit ${emote} by ${user}`)),
			catchError(err => req.response.send({ status: 400, body: { error: err.message } }))
		)),

		map(emote => ({
			body: emote.resolve()
		}))
	))
);

namespace CreateEmote {
	/**
	 * POST /emotes
	 *
	 * Create a new Emote
	 */
	export const Route = r.pipe(
		r.matchPath('/'),
		r.matchType('POST'),
		r.use(AuthorizeMiddleware()),
		r.useEffect(req$ => req$.pipe(
			switchMap(req => of(req).pipe(
				use(multipart$({ // Get multipart file
					maxFileCount: 1,
					maxFileSize: 25e5,
					stream: ({ file, mimetype, filename }) => {
						return EmoteStore.Get().create(file, {
							mime: mimetype,
							name: basename(filename, extname(filename)),
							owner: req.user.id
						}).pipe(
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
}

export const EmotesRoute = combineRoutes('/emotes', [
	GetEmotes.Route,
	GetEmote,
	EditEmote,
	DeleteEmote,
	CreateEmote.Route,
	GetChannelEmotes
]);
