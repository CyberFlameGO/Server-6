import { Emote } from 'src/Emotes/Emote';
import { workerData, parentPort } from 'worker_threads';
import { asapScheduler, of, scheduled } from 'rxjs';
import { concatAll, map, switchMap, take, takeLast, takeUntil, tap } from 'rxjs/operators';
import { UseTaggedWorkerMessage } from 'src/Util/WorkerUtil';
import { createWriteStream } from 'fs';
import { Logger } from 'src/Util/Logger';

if (!parentPort) throw new Error('No parent port');

const { emoteData } = workerData as WorkerData;
const emote = new Emote(JSON.parse(emoteData));

scheduled([
	// Validate emote.
	emote.validate().pipe(
		tap(validated => Logger.Get().info(`<EmoteProcessor> [${emote}] validated: ${validated.valid}`))
	),

	// Ensure the tmp filepath is available.
	emote.ensureFilepath().pipe(
		tap(() => Logger.Get().info(`<EmoteProcessor> [${emote}] has temporary filepath`))
	),

	// Listen for incoming file chunks from the main thread
	of(undefined).pipe(
		map(() => createWriteStream(`${emote.filepath}/og`)), // Start writing the OG file to disk
		switchMap(stream => UseTaggedWorkerMessage<Uint8Array>('FileStreamChunk', parentPort).pipe(
			map(msg => stream.write(msg.data)), // Write received chunk
			// End at FileStreamEnd event
			takeUntil(UseTaggedWorkerMessage<void>('FileStreamEnd', parentPort).pipe(take(1)))
		)),
		takeLast(1),
		tap(() => Logger.Get().info(`<EmoteProcessor> [${emote}] Finished writing original upload as local file`))
	),

	// Write the emote to DB
	of(undefined).pipe(
		tap(() => parentPort?.postMessage({ tag: 'WriteDB', data: null })),
		tap(() => Logger.Get().info(`<EmoteProcessor> [${emote}] Requesting mainthread to write to DB`))
	),

	// Begin processing the emote
	emote.process().pipe(
		tap(update => parentPort?.postMessage({ tag: 'ProcessingUpdate', data: update }))
	)
], asapScheduler).pipe(concatAll()).subscribe({
	error(err) { parentPort?.postMessage({ tag: 'Error', data: err }); }
});

export interface WorkerData {
	emoteData: string;
}
export namespace Message {

}
