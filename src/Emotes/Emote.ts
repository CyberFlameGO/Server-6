import { DataStructure } from '@typings/DataStructure';
import sharp from 'sharp';
import { ObjectId } from 'mongodb';
import { existsSync, mkdirp } from 'fs-extra';
import { EMPTY, from, iif, Observable, of, queueScheduler, scheduled } from 'rxjs';
import { concatAll, concatMap, map, mapTo, switchMap, tap } from 'rxjs/operators';
import { Mongo } from 'src/Db/Mongo';
import { EmoteStore } from 'src/Emotes/EmoteStore';
import { Config } from 'src/Config';
import { Logger } from 'src/Util/Logger';

export class Emote {
	id: ObjectId;

	/**
	 * A utility for creating a new emote
	 */
	constructor(public data: Partial<DataStructure.Emote>) {
		this.id = ObjectId.isValid(this.data?._id ?? '') ? this.data._id as ObjectId : new ObjectId();
	}

	get filepath(): string {
		return `tmp/${this.id.toHexString()}`;
	}

	/**
	 * Resize the emote into its respective 1x, 2x, 3x & 4x sizes
	 */
	resize(): Observable<Emote.Resized> {
		return new Observable<Emote.Resized>(observer => {
			// Define emotes sizes
			// array elements - 0: scope, 1: width (px), height (px)
			// Needs to be in descending order or it will look scuffed
			const sizes = [[4, 384, 128], [3, 228, 76], [2, 144, 48], [1, 96, 32]];
			const isAnimated = this.data.mime === 'image/gif';
			const fileExtension = isAnimated ? 'gif' : 'png';
			const originalSize = Array(2) as number[];

			this.ensureFilepath().pipe( // Read original image
				switchMap(() => of(sharp(`${this.filepath}/og`, { animated: true }))),
				switchMap(image => from(image.metadata()).pipe(map(meta => ({ meta, image })))),
				tap(({ meta }) => { // Save original size
					originalSize[0] = meta.width ?? 0;
					// For multi-frame (gif) image, divide height by n pages, otherwise the height is totalled by the page count
					originalSize[1] = (meta.pages ?? 1) > 1 ? (meta.height ?? 0) / (meta.pages ?? 0) : meta.height ?? 0;
				}),
				switchMap(({ image, meta }) => from(sizes).pipe(
					map(([scope, width, height]) => ({
						scope,
						meta,
						size: this.getSizeRatio(originalSize, [width, height]) // Get aspect ratio size
					})),
					concatMap(({ scope, size, meta }) => iif(() => isAnimated,
						of(undefined).pipe( // Gif resize: set height to scope by n pages
							switchMap(() => image.toFormat('gif', { pageHeight: size[1] }).resize(size[0], size[1] * (meta.pages ?? 1)).toFile(`${this.filepath}/${scope}x.${fileExtension}`))
						),
						of(undefined).pipe( // Still resize
							switchMap(() => image.resize(size[0], size[1], undefined).toFormat('png').toFile(`${this.filepath}/${scope}x.${fileExtension}`))
						)
					).pipe(mapTo((scope))))
				)),

				map(scope => ({ // Emit "resized" objects, used to upload emote sizes to the CDN
					scope,
					extension: fileExtension,
					path: `${this.filepath}/${scope}x.${fileExtension}`
				} as Emote.Resized))
			).subscribe({
				next(resized) { console.log(resized); observer.next(resized); },
				complete() { observer.complete(); },
				error(err) { observer.error(err); }
			});
		});
	}

	/**
	 * Write this emote to database, creating it if it doesn't yet exist
	 */
	write(): Observable<Emote> {
		return new Observable<Emote>(observer => {
			scheduled([
				Mongo.Get().collection('users').pipe(
					switchMap(col => col.findOne({ _id: new ObjectId(this.data.owner) })),
					tap(user => this.data.owner_name = user?.display_name),
					mapTo(EMPTY)
				),

				Mongo.Get().collection('emotes').pipe(
					// Get user's display name
					switchMap(col => col.updateOne({
						_id: this.id
					}, {
						$set: this.resolve()
					}, { upsert: true })),

					mapTo(this),
					tap(emote => observer.next(emote))
				)
			], queueScheduler).pipe(
				concatAll()
			).subscribe({
				error(err) { observer.error(err); },
				complete() { observer.complete(); },
			});
		});
	}

	/**
	 * Get the resized width/height of an image while keeping its aspect ratio
	 *
	 * @param og the original image size
	 * @param nw the new image size
	 */
	getSizeRatio(og: number[], nw: number[]): number[] {
		const ratio = Math.min(nw[0] / og[0], nw[1] / og[1]);

		return [ og[0] * ratio, og[1] * ratio ].map(n => Math.floor(n));
	}

	/**
	 * Ensure that the filepath exists, and if not create it
	 */
	ensureFilepath(): Observable<void> {
		return new Observable<void>(observer => {
			of(existsSync(`tmp/${this.id}`)).pipe(
				switchMap(exists => iif(() => exists,
					of(undefined),
					of(undefined).pipe(
						switchMap(() => mkdirp(this.filepath))
					)
				))
			).subscribe({
				next() { observer.next(undefined); },
				complete() { observer.complete(); },
				error(err) { observer.error(err); }
			});
		});
	}

	/***
	 * Delete this emote
	 */
	delete(): Observable<void> {
		return new Observable<void>(observer => {
			// Delete from CDN
			from(EmoteStore.Get().s3.listObjects({ // List the emote's objects
				Bucket: Config.s3_bucket_name,
				Prefix: `${EmoteStore.getEmoteObjectKey(String(this.id))}`
			})).pipe(
				map(out => out.Contents ?? []), // Map to contents
				switchMap(objects => EmoteStore.Get().s3.deleteObjects({ // Delete the objects retrieved
					Bucket: Config.s3_bucket_name,
					Delete: { Objects: [...objects.map(o => ({ Key: o.Key }))] }
				})),
				tap(x => Logger.Get().info(`<Emote> Deleted ${x.Deleted?.length} objects (${this})`)),

				// OK: object deleted, proceed to removing the database entry
				// TODO: Revoke emote from any channels that has it
				switchMap(() => Mongo.Get().collection('emotes')),
				switchMap(col => col.deleteOne({ _id: this.id })),
				tap(() => Logger.Get().info(`<Emote> Deleted database entry (${this})`))
			).subscribe({
				complete() { observer.complete(); },
				error(err) { console.log(err); observer.error(err); },
				next() { observer.next(undefined); }
			});
		});
	}

	resolve(): DataStructure.Emote {
		return {
			_id: this.id,
			name: this.data.name ?? '',
			private: this.data.private,
			mime: this.data.mime,
			owner: this.data.owner,
			owner_name: this.data.owner_name
		};
	}

	toString(): string {
		return `${this.data.name} (ID: ${this.id})`;
	}
}

export namespace Emote {
	export interface Resized {
		scope: number;
		extension: string;
		path: string;
	}
}
