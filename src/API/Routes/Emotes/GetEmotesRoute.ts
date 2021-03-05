import { HttpRequest, r } from '@marblejs/core';
import { ObjectId, FilterQuery } from 'mongodb';
import { Constants } from '@typings/src/Constants';
import { DataStructure } from '@typings/typings/DataStructure';
import { from, noop, of, throwError } from 'rxjs';
import { switchMap, map } from 'rxjs/operators';
import { AuthorizeMiddleware, WithUser } from 'src/API/Middlewares/AuthorizeMiddleware';
import { Mongo } from 'src/Db/Mongo';

/**
 * GET /emotes/:emote
 *
 * Get a single emote
 */
export const GetEmoteRoute = r.pipe(
	r.matchPath('/:emote'),
	r.matchType('GET'),
	r.useEffect(req$ => req$.pipe(
		switchMap(req => Mongo.Get().collection('emotes').pipe(map(col => ({ col, req })))),
		switchMap(({ req, col }) => col.findOne({
			_id: ObjectId.createFromHexString((req.params as any).emote),
			status: { $not: { $eq: Constants.Emotes.Status.DELETED } }
		})),
		switchMap(emote => !!emote ? of(emote) : throwError('Unknown Emote')),
		map(emote => ({
			body: emote
		}))
	))
);

/**
 * GET /emotes
 * Query: {  }
 *
 * Get a list of public emotes
 */
export const GetEmotesRoute = r.pipe(
	r.matchPath('/'),
	r.matchType('GET'),
	r.use(AuthorizeMiddleware(true)),
	r.useEffect(req$ => req$.pipe(
		map(req => req as HttpRequest<{}, {}, (Query & GetQueryOptions)> & WithUser),
		map(req => ({
			query: getQuery(req.user?.id, {
				name: req.query.name ?? undefined,
				hideGlobal: req.query.hideGlobal === 'true',
				globalEmotes: req.query.globalEmotes ?? 'include',
				submitter: req.query.submitter ?? undefined
			}),
			req
		})),
		switchMap(({ req, query }) => Mongo.Get().collection('emotes').pipe(map(col => ({ col, req, query })))),
		switchMap(x => from(x.col.countDocuments(x.query)).pipe(map(totalEstimatedSize => ({ totalEstimatedSize, ...x })))),
		switchMap(async ({ req, col, totalEstimatedSize, query }) => { // Begin pagination
			const page = parseInt(req.query.page ?? 1); // The requested page (1 if unset)
			const pageSize = parseInt(req.query.pageSize ?? 16); // The requested size of the page (amount of documents to show)
			const skip = (page - 1) * pageSize; // How many documents should be skipped in order to reach the requested range

			return col.aggregate([ // Create aggregation pipeline
				{ $match: query },
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

const getQuery = (userID: ObjectId | string | undefined, options: GetQueryOptions) => {
	const o = {} as FilterQuery<Partial<DataStructure.Emote>>;
	options.hideGlobal === true ? o.global = { $not: { $eq: true } } as any : noop();
	if (options.globalEmotes) {
		({ // Handle globalEmotes query
			include: () => noop(),
			only: () => o.global = true,
			hide: () => o.global = { $not: { $eq: true } }
		} as { [key in GetQueryOptions['globalEmotes']]: () => void })[options.globalEmotes]();
	}
	options.name?.length > 0 ? o.name = { $regex: new RegExp(options.name, 'i') } : noop();
	options.submitter?.length > 0 ? o.owner_name = { $regex: new RegExp(options.submitter, 'i') } : noop();

	return { // Match non-private emotes (unless user is owner)
		$or: [{ private: false }, { owner: userID }],
		...o
	} as FilterQuery<DataStructure.Emote>;
};

interface GetQueryOptions {
	name: string;
	submitter: string;
	globalEmotes: 'only' | 'hide' | 'include';
	/** @deprecated Use globalEmotes instead  */
	hideGlobal: string | boolean;
}
interface Query {
	page: string;
	pageSize: string;
}
