import { DataStructure } from '@typings/typings/DataStructure';
import { existsSync, mkdirp, createReadStream } from 'fs-extra';
import { asyncScheduler, defer, EMPTY, from, iif, noop, Observable, of, queueScheduler, scheduled, throwError } from 'rxjs';
import { concatAll, concatMap, filter, map, mapTo, mergeMap, switchMap, switchMapTo, tap, toArray } from 'rxjs/operators';
import { EmoteStore } from 'src/Emotes/EmoteStore';
import { Config } from 'src/Config';
import { Logger } from 'src/Util/Logger';
import { TwitchUser } from 'src/Util/TwitchUser';
import { Constants as AppConstants } from '@typings/src/Constants';
import { ObjectId } from 'mongodb';
import { Mongo } from 'src/Db/Mongo';
import sharp from 'sharp';
import imagemin from 'imagemin';
import imageminPng from 'imagemin-pngquant';
import imageminGif from 'imagemin-gifsicle';
import { Constants } from 'src/Util/Constants';

export class Emote {
	id: ObjectId;

	/**
	 * A utility for creating a new emote
	 */
	constructor(public data: Partial<DataStructure.Emote>) {
		this.id = ObjectId.isValid(this.data?._id ?? '') ? new ObjectId(this.data._id) : new ObjectId();
	}

	get filepath(): string {
		return `${Constants.APP_ROOT}/tmp/${this.id.toHexString()}`;
	}

	/**
	 * Process this emote
	 */
	process(): Observable<Emote.ProcessingUpdate> {
		return new Observable<Emote.ProcessingUpdate>(observer => {
			let taskIndex = 1;
			const taskCount = 13;

			const emoteID = this.id.toHexString();
			scheduled([
				this.resize().pipe(
					tap(resized => observer.next({
						tasks: [taskIndex++, taskCount],
						message: `Rendering sizes.... (${resized.scope}x)`,
						emoteID
					})),
					toArray(),
					map(sizes => sizes.reverse()),
					switchMap(sizes => from(sizes)),

					mergeMap(size => this.optimize(size).pipe(
						tap(() => observer.next({
							tasks: [taskIndex++, taskCount],
							message: `Optimizing emote... (${size.scope}/4)`,
							emoteID
						})),
						mapTo(size)
					)),
					toArray(),
					switchMap(sizes => from(sizes)),

					mergeMap(size => this.upload(size).pipe(
						tap(() => observer.next({
							tasks: [taskIndex++, taskCount],
							message: `Publishing... (${size.scope}/4)`,
							emoteID
						}))
					))
				),
				defer(() => observer.next({
					tasks: [taskIndex++, taskCount],
					message: 'Processing complete!',
					done: true,
					emoteID
				}))
			], asyncScheduler).pipe(
				concatAll(),
				switchMapTo(EMPTY)
			).subscribe({
				complete() { observer.complete(); },
				error(err) { observer.error(err); }
			});
		});

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
				next(resized) { observer.next(resized); },
				complete() { observer.complete(); },
				error(err) { observer.error(err); }
			});
		});
	}

	/**
	 * Optimize this emote
	 */
	optimize(size: Emote.Resized): Observable<imagemin.Result> {
		return new Observable<imagemin.Result>(observer => {
			const isAnimated = size.extension === 'gif';
			from(imagemin([size.path], {
				plugins: [ isAnimated
					? imageminGif({
						optimizationLevel: 3,
						interlaced: true,
						colors: 200
					})
					: imageminPng({
						strip: true,
						quality: [0.4, 0.75]
					})
				], destination: `${this.filepath}/min`
			})).subscribe({
				next(result) { observer.next(result[0]); },
				complete() { observer.complete(); },
				error(err) { observer.error(err); }
			});
		});
	}

	/**
	 * Upload this emote to the CDN
	 */
	upload(size: Emote.Resized): Observable<number> {
		return new Observable<number>(observer => {
			EmoteStore.Get().s3.putObject({
				Bucket: Config.s3_bucket_name,
				Key: `${EmoteStore.getEmoteObjectKey(String(this.id))}/${size.scope}x`,
				Body: createReadStream(size.path),
				ContentType: this.data.mime,
				ACL: 'public-read'
			}).then(() => observer.next(size.scope)).catch(err => observer.error(err)).finally(() => observer.complete());
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
	 * Update this emote
	 */
	update(options: Partial<Emote.UpdateOptions>, actor?: TwitchUser): Observable<Emote> {
		return new Observable<Emote>(observer => {
			const update = {} as any; // Final result (after being verified)

			// Verify
			from(Object.keys(options ?? {}) as (keyof Emote.UpdateOptions)[]).pipe(
				mergeMap(key => {
					const isOwner = ((!!this.data.owner && !!actor) && actor.id?.equals(this.data.owner)) ?? false;
					const isMod = (actor?.data.rank ?? 0) >= AppConstants.Users.Rank.MODERATOR;
					let test = false;
					switch (key) {
						case 'name': // Check name is correct
							test = (isOwner || isMod) && this.isNameValid(options[key] as string);
							break;
						case 'owner': // Verify actor has the permission to transfer ownership away
							test = isOwner || isMod;
							break;
						case 'global': // Verify actor is a moderator or higher
							test = isMod;
							break;
						case 'tags':
							test = isOwner || isMod;
							break;
					}

					return of(({ key, test }));
				}),
				filter(({ test }) => test === true), // Only emit truthy keys
				tap(({ key }) => update[key] = options[key]), // Set value to final object

				toArray(), // Wait for all to be finished

				switchMap(a => Mongo.Get().collection('emotes').pipe(map(col => ({ col, a })))),
				switchMap(({ a, col }) => a.length ? col.findOneAndUpdate({ // Update the emote
					_id: this.id
				}, { $set: update }, { returnOriginal: false }) : throwError(Error('Nothing changed'))),
				tap(data => data.ok && !!data.value ? this.data = data.value : noop()),
				map(() => this as Emote)
			).subscribe({
				next(emote) { observer.next(emote); },
				complete() { observer.complete(); },
				error(err) { observer.error(err); }
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

		return [og[0] * ratio, og[1] * ratio].map(n => Math.floor(n));
	}

	private isNameValid(value: string): boolean {
		return Emote.EmoteNameRegExp.test(value as string)
			&& (value as string).length < Emote.MAX_EMOTE_LENGTH && (value as string).length >= Emote.MIN_EMOTE_LENGTH;
	}

	/**
	 * Validate the emote's data
	 */
	validate(): Observable<Emote.Validate.Emission> {
		return new Observable<Emote.Validate.Emission>(observer => {
			from(['name'] as (keyof DataStructure.Emote)[]).pipe(
				map(key => ({ // Iterate thru data
					key,
					value: this.data[key]
				})),

				concatMap(({ key, value }) => of(({ // Test every field
					name: {
						valid: this.isNameValid(String(value)),
						onInvalid: () => Error(`Emote name must be between ${Emote.MIN_EMOTE_LENGTH}-${Emote.MAX_EMOTE_LENGTH} characters and ${Emote.EmoteNameRegExp.toString()}`)
					}
				} as { [key in keyof DataStructure.Emote]: Emote.Validate.TestResult })[key])),
				filter(x => typeof x !== 'undefined'),
				map(test => ({
					valid: test?.valid ?? false,
					error: test?.valid ? undefined : test?.onInvalid()
				} as Emote.Validate.Emission))
			).subscribe({
				error(err) { observer.error(err); },
				next(emission) { observer.next(emission); },
				complete() { observer.complete(); }
			});
		});
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

	/**
	 * Add this emote to a TwitchUser's channel
	 */
	addToChannel(user: TwitchUser): Observable<TwitchUser> {
		return user.writeUser({
			$addToSet: {
				emotes: this.id
			},
		});
	}

	/**
	 * Remove thiss emote from a TwitchUser's channel
	 */
	removeFromChannel(user: TwitchUser): Observable<TwitchUser> {
		return user.writeUser({
			$pull: {
				emotes: this.id
			}
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
				tap(x => Logger.Get().info(`<Emote> Deleted ${x.Deleted?.length ?? 0} objects (${this})`)),

				// OK: object deleted, proceed to removing the database entry
				// TODO: Revoke emote from any channels that has it
				switchMap(() => Mongo.Get().collection('emotes')),
				switchMap(col => col.deleteOne({ _id: this.id })),
				tap(() => Logger.Get().info(`<Emote> Deleted database entry (${this})`))
			).subscribe({
				complete() { observer.complete(); },
				error(err) { observer.error(err); },
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
			owner: !!this.data.owner && ObjectId.isValid(this.data.owner) ? new ObjectId(this.data.owner) : undefined,
			owner_name: this.data.owner_name,
			status: this.data.status ?? 0,
			global: this.data.global ?? false,
			tags: this.data.tags ?? []
		};
	}

	toString(): string {
		return `${this.data.name} (ID: ${this.id})`;
	}
}

export namespace Emote {
	export interface ProcessingUpdate {
		emoteID: string;
		tasks: number[];
		message: string;
		error?: boolean;
		done?: boolean;
	}
	export interface UpdateOptions {
		name: string;
		owner: string | ObjectId;
		global: boolean;
		tags: string[];
	}

	export interface Resized {
		scope: number;
		extension: string;
		path: string;
	}

	export namespace Validate {
		export interface Emission {
			key: string;
			valid: boolean;
			error: Error | undefined;
		}

		export interface TestResult {
			valid: boolean;
			onInvalid: () => Error | undefined;
		}
	}

	/** A regular expression matching a valid emote name  */
	export const EmoteNameRegExp = new RegExp(/^[A-Za-z_éèà\(\)\:0-9]*$/);
	export const MAX_EMOTE_LENGTH = 100;
	export const MIN_EMOTE_LENGTH = 2;
}
