import { S3 } from '@aws-sdk/client-s3';
import { Config } from 'src/Config';
import { createWriteStream, createReadStream } from 'fs';
import { asyncScheduler, EMPTY, fromEvent, iif, Observable, of, scheduled, Subject, throwError } from 'rxjs';
import { concatAll, filter, map, mapTo, mergeMap, switchMap, take, takeLast, tap, toArray } from 'rxjs/operators';
import { Emote } from 'src/Emotes/Emote';
import { ObjectId } from 'mongodb';
import { Logger } from 'src/Util/Logger';
import { Mongo } from 'src/Db/Mongo';
import { DataStructure } from '@typings/typings/DataStructure';
import { Constants } from '@typings/src/Constants';

export class EmoteStore {
	private static instance: EmoteStore;
	static Get(): EmoteStore {
		return this.instance ?? (EmoteStore.instance = new EmoteStore());
	}

	constructor() {
		this.processingUpdate.pipe(
			tap(x => console.log('UPDATE:', x.tasks, x.message))
		).subscribe();
	}

	s3 = new S3({
		region: 'ams3',
		endpoint: Config.s3_endpoint,
		credentials: {
			accessKeyId: Config.s3_access_key,
			secretAccessKey: Config.s3_secret
		},
		tls: true
	});

	processing = new Map<string, Observable<Emote.ProcessingUpdate>>();
	processingUpdate = new Subject<Emote.ProcessingUpdate>();

	findEmote(id: string): Observable<Emote> {
		return Mongo.Get().collection('emotes').pipe(
			switchMap(col => col.findOne({ _id: ObjectId.createFromHexString(id) })),
			switchMap(data => !!data ? of(data) : throwError(Error('Unknown Emote'))),
			map(data => new Emote(data as DataStructure.Emote))
		);
	}

	/**
	 * Create a new Emote
	 */
	create(data: NodeJS.ReadableStream, options: EmoteStore.CreateOptions): Observable<Emote> {
		return new Observable<Emote>(observer => {
			const emote = new Emote({ // Synthesize emote instance
				mime: options.mime,
				owner: options.owner,
				name: options.name,
				private: true, // Set as private by default
				status: Constants.Emotes.Status.PROCESSING
			});

			// Save to disk for applying changes
			scheduled([
				emote.validate().pipe(
					filter(e => !e.valid),
					map(e => e.error),
					toArray(),
					switchMap(errors => iif(() => errors.length > 0,
						throwError(`There are problems with this emote: ${errors.map(e => e?.message).join(', ')}`),
						of(undefined)
					)),

					switchMap(() => emote.ensureFilepath()),
					switchMap(() => of(createWriteStream(`${emote.filepath}/og`)).pipe(
						tap(stream => data.pipe(stream)),
						switchMap(stream => fromEvent(stream, 'finish').pipe(take(1)))
					)), // Write uploaded emote to file

					// Write to database
					switchMap(() => emote.write()),
					tap(() => Logger.Get().info(`<EmoteStore> Created new emote '${emote.data.name}'`)),

					mapTo(emote)
				)
			], asyncScheduler).pipe(
				concatAll(),
			).subscribe({
				next: (emote) => {
					this.processing.set(emote.id.toHexString(), emote.process());
					observer.next(emote);
				},
				complete() { observer.complete(); },
				error(err) { observer.error(err); }
			}); // pog
		});
	}

	static getEmoteObjectKey(emoteID: string): string {
		return `${process.env.NODE_ENV === 'production' ? '' : 'dev/'}emote/${emoteID}`;
	}
}

export namespace EmoteStore {
	export interface CreateOptions {
		owner: ObjectId;
		name?: string;
		published?: boolean;
		mime: string;
	}
}
