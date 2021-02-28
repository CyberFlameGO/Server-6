import { S3 } from '@aws-sdk/client-s3';
import { Config } from 'src/Config';
import { createWriteStream, createReadStream } from 'fs';
import { asyncScheduler, fromEvent, Observable, scheduled, throwError } from 'rxjs';
import { map, mapTo, mergeAll, mergeMap, switchMap, take, tap, toArray } from 'rxjs/operators';
import { Emote } from 'src/Emotes/Emote';

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
				url: '',
				mime: options.mime,
				private: true
			});

			// Save to disk for applying changes
			emote.ensureFilepath().pipe(
				map(() => createWriteStream(`${emote.filepath}/og`)), // Write uploaded emote to file
				tap(stream => data.pipe(stream)),
				switchMap(stream => scheduled([ // Listen for stream events
					fromEvent(stream, 'finish'),
					fromEvent<Error>(stream, 'error').pipe(switchMap(err => throwError(err)))
				], asyncScheduler).pipe(mergeAll(), take(1))),

				// Create all the emote sizes
				switchMap(() => emote.resize()),

				// Upload sizes to DigitalOcean
				mergeMap(resized => this.s3.putObject({
					Bucket: Config.s3_bucket_name,
					Key: `emote/${emote.fileID}/${resized.scope}x.${resized.extension}`,
					Body: createReadStream(resized.path),
					ContentType: options.mime,
					ACL: 'public-read'
				})),
				toArray(), mapTo(emote)
			).subscribe({
				next(emote) { observer.next(emote); },
				complete() { observer.complete(); },
				error(err) { observer.error(err); }
			}); // pog
		});
	}

	test(): void {
		this.s3.putObject({
			Bucket: Config.s3_bucket_name,
			Key: 'Test.txt',
			Body: 'VeryPog',
			ContentType: 'text/html',
			ACL: 'public-read'
		}).then(r => console.log('PagMan!!!!!!', r));
	}
}

export namespace EmoteStore {
	export interface CreateOptions {
		submitter: string;
		published?: boolean;
		mime: string;
	}
}
