import { DataStructure } from '@typings/DataStructure';
import sharp from 'sharp';
import { ObjectId } from 'mongodb';
import { existsSync, mkdirp } from 'fs-extra';
import { from, iif, Observable, of, scheduled } from 'rxjs';
import { concatMap, delay, map, mapTo, switchMap, take, tap } from 'rxjs/operators';

export class Emote {
	fileID = new ObjectId();

	/**
	 * A utility for creating a new emote
	 */
	constructor(public data: Partial<DataStructure.Emote>) {}

	get filepath(): string {
		return `tmp/${this.fileID.toHexString()}`;
	}

	/**
	 * Resize the emote into its respective 1x, 2x, 3x & 4x sizes
	 */
	resize(): Observable<Emote.Resized> {
		return new Observable<Emote.Resized>(observer => {
			// Define emotes sizes
			// array elements - 0: scope, 1: size (px)
			// Needs to be in descending order or it will look scuffed
			const sizes = [[4, 128], [3, 76], [2, 48], [1, 32]];
			const isAnimated = this.data.mime === 'image/gif';
			const fileExtension = isAnimated ? 'gif' : 'png';
			const originalSize = Array(2) as number[];

			console.log(this.data.mime, 'mime');
			this.ensureFilepath().pipe( // Read original image
				switchMap(() => of(sharp(`${this.filepath}/og`, { animated: true }))),
				switchMap(image => from(image.metadata()).pipe(map(meta => ({ meta, image })))),
				tap(({ meta }) => {
					originalSize[0] = meta.width ?? 0;
					originalSize[1] = (meta.pages ?? 1) > 1 ? (meta.height ?? 0) / (meta.pages ?? 0) : meta.height ?? 0;
					console.log('og', originalSize, meta.pages, meta.height);
				}),
				switchMap(({ image, meta }) => from(sizes).pipe(
					map(([scope, size]) => ({
						scope,
						meta,
						size: this.getSizeRatio(originalSize, [size, size])
					})),
					concatMap(({ scope, size, meta }) => iif(() => isAnimated,
						of(undefined).pipe(
							switchMap(() => image.toFormat('gif', { pageHeight: size[1], force: true }).resize(size[0], size[1] * (meta.pages ?? 1)).toFile(`${this.filepath}/${scope}x.${fileExtension}`))
						),
						of(undefined).pipe(
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

	getSizeRatio(og: number[], nw: number[]): number[] {
		const ratio = Math.min(nw[0] / og[0], nw[1] / og[1]);

		return [ og[0] * ratio, og[1] * ratio ].map(n => Math.floor(n));
	}

	/**
	 * Ensure that the filepath exists, and if not create it
	 */
	ensureFilepath(): Observable<void> {
		return new Observable<void>(observer => {
			of(existsSync(`tmp/${this.fileID}`)).pipe(
				switchMap(exists => iif(() => exists,
					of(undefined),
					mkdirp(this.filepath)
				))
			).subscribe({
				next() { observer.next(undefined); },
				complete() { observer.complete(); },
				error(err) { observer.error(err); }
			});
		});
	}
}

export namespace Emote {
	export interface Resized {
		scope: number;
		extension: string;
		path: string;
	}
}
