import { S3 } from '@aws-sdk/client-s3';
import { Config } from 'src/Config';
import { createWriteStream, createReadStream } from 'fs';
import { asyncScheduler, fromEvent, noop, Observable, scheduled, throwError, of, EMPTY, from } from 'rxjs';
import { map, mapTo, mergeAll, mergeMap, switchMap, take, tap, toArray } from 'rxjs/operators';
import { Emote } from 'src/Emotes/Emote';
import { ObjectId } from 'mongodb';

export class EmoteStore {
	private static instance: EmoteStore;
	static Get(): EmoteStore {
		return this.instance ?? (EmoteStore.instance = new EmoteStore());
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

	/**
	 * Create a new Emote
	 */
	create(data: NodeJS.ReadableStream, options: EmoteStore.CreateOptions): Observable<Emote> {
		return new Observable<Emote>(observer => {
			const emote = new Emote({ // Synthesize emote instance
				mime: options.mime,
				owner: options.owner,
				name: options.name,
				private: true // Set as private by default
			});

			// Save to disk for applying changes
			emote.ensureFilepath().pipe(
				tap(() => console.log('filepath ensured')),
				switchMap(() => of(createWriteStream(`${emote.filepath}/og`)).pipe(
					tap(stream => data.pipe(stream)),
					switchMap(stream => fromEvent(stream, 'finish').pipe(take(1)))
				)), // Write uploaded emote to file
				tap(x => console.log('Stream end')),

				// Write to database
				switchMap(() => emote.write()),

				// Create all the emote sizes
				switchMap(() => emote.resize()),

				// Upload sizes to DigitalOcean
				mergeMap(resized => this.s3.putObject({
					Bucket: Config.s3_bucket_name,
					Key: `emote/${emote.id}/${resized.scope}x.${resized.extension}`,
					Body: createReadStream(resized.path),
					ContentType: options.mime,
					ACL: 'public-read'
				})),
				toArray(),
				mapTo(emote)
			).subscribe({
				next(emote: any) { observer.next(emote); },
				complete() { observer.complete(); },
				error(err) { observer.error(err); }
			}); // pog
		});
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
