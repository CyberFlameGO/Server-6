import { MessagePort, Worker } from 'worker_threads';
import { fromEvent, throwError } from 'rxjs';
import { Constants } from 'src/Util/Constants';
import { filter } from 'rxjs/operators';

export const UseTaggedWorkerMessage = <D, TAG extends string = string>(tag: TAG, port: MessagePort | Worker | null) => !!port ? fromEvent<Constants.TaggedWorkerMessage<TAG, D>>(port, 'message').pipe(
	filter(msg => msg.tag === tag)
) : throwError(Error('Missing MessagePort'));
