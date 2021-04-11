import { Long, ObjectId } from 'mongodb';
import { DataStructure } from '@typings/typings/DataStructure.v1';
import { Observable } from 'rxjs';
import { Redis } from 'src/Client/Redis';
import { Mongo } from 'src/Db/Mongo';
import { mapTo, switchMap } from 'rxjs/operators';


export class Role {
	readonly id: ObjectId;
	allowed = new DataStructure.Role.Permissions(BigInt(0));
	denied = new DataStructure.Role.Permissions(BigInt(0));

	constructor(private data: Partial<DataStructure.Role>) {
		this.id = new ObjectId(data._id ?? new ObjectId());
	}

	/**
	 * Write the role, saving it to cache and database
	 */
	write(): Observable<Role> {
		return new Observable<Role>(observer => {
			const id = this.id.toHexString();

			// Update in Redis
			Redis.Get().sadd(Redis.Key.Role, id);
			Redis.Get().hset(`${Redis.Key.Role}:${id}`, Object.keys(this.data)
				.flatMap(k => [k, this.data[k as keyof DataStructure.Role]])
			);

			// Save to database
			Mongo.Get().collection('roles').pipe(
				switchMap(col => col.updateOne({ _id: this.id }, {
					$set: {
						...this.data,
						_id: this.id,
						allowed: Long.fromString(this.allowed.resolve().toString()),
						denied: Long.fromString(this.denied.resolve().toString())
					}
				})),
				mapTo(this)
			).subscribe({
				next(role) { observer.next(role); },
				error(err) { observer.error(err); },
				complete() { observer.complete(); }
			});
		});
	}

	/**
	 * @returns a stringified version of the role
	 */
	toJSON(): string {
		return JSON.stringify(this.data, (_, value: any) =>
			typeof value === 'bigint' ? value.toString()
			: value instanceof ObjectId ? value.toHexString() : value
		);
	}
}
