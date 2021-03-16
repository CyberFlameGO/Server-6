import { HttpRequest } from '@marblejs/core';
import { DataStructure } from '@typings/typings/DataStructure';
import { asapScheduler, EMPTY, fromEvent, Observable, of, scheduled } from 'rxjs';
import { mergeAll, switchMap, switchMapTo, tap } from 'rxjs/operators';
import { Mongo } from 'src/Db/Mongo';

/**
 * Middleware: Audit Log Entry
 * 
 * Add a Audit Log entry following the successful completion of this request
 */
export const AuditLogMiddleware = (entryType: keyof typeof DataStructure.AuditLog.Entry.Type) => (req$: Observable<HttpRequest>) => req$.pipe(
	switchMap(req => scheduled([
		of(req),

		// Listen for the request's closure
		fromEvent(req, 'close').pipe(
			switchMap(() => Mongo.Get().collection('audit')), // Get audit collection
			switchMap(col => col.insertOne({ // Insert as new document
				type: DataStructure.AuditLog.Entry.Type[entryType],
				action_user: req.user.id,
				changes: [...(req.meta?.auditChanges ?? [])], // auditChanges are added by the InsertAuditChange pipeable operator defined below
				reason: req.headers['X-Action-Reason'] as string | undefined
			})),

			switchMapTo(EMPTY)
		)
	], asapScheduler).pipe(mergeAll()))
);

/**
 * Pipeable Operator: Insert Audit Change
 * 
 * Add changes to the audit log entry of a request
 */
export const InsertAuditChange = (changes: DataStructure.AuditLog.Entry.Change[]) => <T extends HttpRequest>(source: Observable<T>): Observable<T> => source.pipe(
	tap(req => {
		req.meta = {
			...(req.meta ?? {}),
			auditChanges: [
				...(req.meta?.auditChanges ?? []),
				...changes
			]
		}
	}),
);
