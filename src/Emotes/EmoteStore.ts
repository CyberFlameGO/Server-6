import { S3 } from '@aws-sdk/client-s3';
import { Config } from 'src/Config';
import { createWriteStream, createReadStream } from 'fs';
import { fromEvent, Observable, of} from 'rxjs';
import { filter, map, mapTo, mergeMap, switchMap, take, tap, toArray } from 'rxjs/operators';
import { Emote } from 'src/Emotes/Emote';
import { ObjectId } from 'mongodb';
import { Logger } from 'src/Util/Logger';
import { Mongo } from 'src/Db/Mongo';
import { DataStructure } from '@typings/DataStructure';

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

	findEmote(id: string): Observable<Emote> {
		return Mongo.Get().collection('emotes').pipe(
			switchMap(col => col.findOne({ _id: ObjectId.createFromHexString(id) })),
			filter(x => x !== null),
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
				private: true // Set as private by default
			});

			// Save to disk for applying changes
			emote.ensureFilepath().pipe(
				tap(() => console.log('filepath ensured')),
				switchMap(() => of(createWriteStream(`${emote.filepath}/og`)).pipe(
					tap(stream => data.pipe(stream)),
					switchMap(stream => fromEvent(stream, 'finish').pipe(take(1)))
				)), // Write uploaded emote to file
				tap(() => Logger.Get().info(`Uploading emote '${emote.data.name}'`)),

				// Write to database
				switchMap(() => emote.write()),
				tap(() => Logger.Get().info(`<EmoteStore> Wrote '${emote.data.name}' to DB`)),

				// Create all the emote sizes
				switchMap(() => emote.resize()),

				// Upload sizes to DigitalOcean
				mergeMap(resized => this.s3.putObject({
					Bucket: Config.s3_bucket_name,
					Key: `${EmoteStore.getEmoteObjectKey(String(emote.id))}/${resized.scope}x`,
					Body: createReadStream(resized.path),
					ContentType: options.mime,
					ACL: 'public-read'
				})),
				toArray(),
				tap(() => Logger.Get().info(`<EmoteStore> Uploaded '${emote.data.name}' to CDN!`)),
				mapTo(emote)
			).subscribe({
				next(emote: any) { observer.next(emote); },
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
