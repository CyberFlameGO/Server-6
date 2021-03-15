import { S3 } from '@aws-sdk/client-s3';
import { Config } from 'src/Config';
import { asyncScheduler, EMPTY, Observable, of, scheduled, Subject, throwError } from 'rxjs';
import { map, mapTo, mergeAll, switchMap, take, tap } from 'rxjs/operators';
import { Emote } from 'src/Emotes/Emote';
import { ObjectId } from 'mongodb';
import { Mongo } from 'src/Db/Mongo';
import { DataStructure } from '@typings/typings/DataStructure';
import { Constants as AppConstants } from '@typings/src/Constants';
import { Constants } from 'src/Util/Constants';
import { Worker } from 'worker_threads';
import { UseTaggedWorkerMessage } from 'src/Util/WorkerUtil';
import path from 'path';

export class EmoteStore {
	private static instance: EmoteStore;
	static Get(): EmoteStore {
		return this.instance ?? (EmoteStore.instance = new EmoteStore());
	}

	constructor() {}

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
	 * Create a new Emote.
	 *
	 * This will create a Worker Thread within which the emote
	 * will be created and processed.
	 */
	create(file: NodeJS.ReadableStream, options: EmoteStore.CreateOptions): Observable<Emote> {
		return new Observable<Emote>(observer => {
			const emote = new Emote({ // Synthesize emote instance
				_id: new ObjectId(),
				mime: options.mime,
				owner: options.owner,
				name: options.name,
				private: true, // Set as private by default
				status: AppConstants.Emotes.Status.PROCESSING
			});
			observer.next(emote);

			// Create processing worker
			const worker = new Worker(Constants.WORKER_BOOTSTRAP_PATH, {
				workerData: {
					workerFile: `src/Workers/EmoteProcessor${path.extname(__filename)}`,
					emoteData: JSON.stringify(emote.resolve())
				}
			});

			scheduled([
				// Handle errors
				UseTaggedWorkerMessage<Error>('Error', worker).pipe(
					take(1),
					tap(msg => this.processingUpdate.next({
						done: false, error: true,
						message: msg.data.message,
						tasks: [0, 0],
						emoteID: emote.id.toHexString()
					})),
					switchMap(msg => worker.terminate().then(() => msg.data)),
					switchMap(err => throwError(err))
				),

				UseTaggedWorkerMessage<void>('WriteDB', worker).pipe(
					switchMap(() => emote.write())
				),

				// Handle processing updates
				UseTaggedWorkerMessage<Emote.ProcessingUpdate>('ProcessingUpdate', worker).pipe(
					tap(msg => this.processingUpdate.next(msg.data))
				),

				UseTaggedWorkerMessage<void>('ProcessingComplete', worker).pipe(
					tap(() => emote.data.status = AppConstants.Emotes.Status.LIVE),
					switchMap(() => emote.write())
				)
			], asyncScheduler).pipe(mergeAll(), mapTo(EMPTY)).subscribe({
				error(err) { observer.error(err); }
			});

			// Send the file to worker
			file.on('end', () => worker.postMessage({ tag: 'FileStreamEnd', data: null }));
			file.on('data', (chunk: Buffer) => worker.postMessage({ tag: 'FileStreamChunk', data: chunk }));
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
