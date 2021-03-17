import { HttpRequest } from '@marblejs/core';
import { DataStructure } from '@typings/typings/DataStructure';
import { asapScheduler, EMPTY, fromEvent, Observable, of, scheduled } from 'rxjs';
import { filter, map, mergeAll, switchMap, switchMapTo, tap } from 'rxjs/operators';
import { Mongo } from 'src/Db/Mongo';
import { Logger } from 'src/Util/Logger';
import { TwitchUser } from 'src/Util/TwitchUser';

/**
 * Middleware: Audit Log Entry
 *
 * Add a Audit Log entry following the successful completion of this request
 */
export const AuditLogMiddleware = (entryType: keyof typeof DataStructure.AuditLog.Entry.Type) => (req$: Observable<HttpRequest>) => req$.pipe(
	switchMap(req => scheduled([
		of(req),

		// Listen for the request'
		fromEvent(req.response, 'finish').pipe(
			filter(() => req.response.statusCode >= 200 && req.response.statusCode < 300), // Only do this for successful (2xx) requests
			switchMap(() => Mongo.Get().collection('audit')), // Get audit collection
			switchMap(col => col.insertOne({ // Insert as new document
				type: DataStructure.AuditLog.Entry.Type[entryType],
				action_user: req.user.id,
				changes: [...(req.meta?.auditChanges ?? [])], // auditChanges are added by the InsertAuditChange pipeable operator defined below
				target: req.meta?.auditTarget ?? undefined,
				reason: req.headers['X-Action-Reason'] as string | undefined
			})),
			tap(() => Logger.Get().info(''.concat(
				`<Audit> [User: ${((req.user.instance as TwitchUser)?.data.display_name ?? req.user.id) ?? 'Anonymous'}]: `, // Action User
				`${entryType} ${req.meta?.auditTarget?.type ?? ''}/${req.meta?.auditTarget?.id} `, // Entry Type & Target
				`${req.meta?.auditChanges?.map((change: DataStructure.AuditLog.Entry.Change) => `${change.key}=(${change.old_value} -> ${change.new_value})`)}`) // Changes
			)),

			switchMapTo(EMPTY)
		)
	], asapScheduler).pipe(mergeAll()))
);

/**
 * Pipeable Operator: Insert Audit Change
 *
 * Add changes to the audit log entry of a request
 */
export const InsertAuditChange = (project: (req: HttpRequest<any, any, any>) => DataStructure.AuditLog.Entry.Change[]) => <T extends HttpRequest>(source: Observable<T>): Observable<T> => source.pipe(
	map(req => ({ changes: project(req), req })),
	tap(({ changes, req }) => {
		req.meta = {
			...(req.meta ?? {}),
			auditChanges: [
				...(req.meta?.auditChanges ?? []),
				...changes
			]
		};
	}),

	map(({ req }) => req)
);

/**
 * Pipeable Operator: Insert Audit Target
 *
 * Add the target object (user, emote, etc) to the audit log entry of a request
 */
export const InsertAuditTarget = (project: (req: HttpRequest<any, any, any>) => DataStructure.AuditLog.Entry.Target | undefined) => <T extends HttpRequest>(source: Observable<T>): Observable<T> => source.pipe(
	map(req => ({ target: project(req), req })),
	tap(({ target, req }) => {
		req.meta = {
			...(req.meta ?? {}),
			auditTarget: target
		};
	}),

	map(({ req }) => req)
);
