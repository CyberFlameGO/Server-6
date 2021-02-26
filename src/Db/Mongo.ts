import { MongoClient } from 'mongodb';
import { mongo_uri } from 'Config';

export class Mongo extends MongoClient {
	private static instance: Mongo;
	static Get(): Mongo {
		return this.instance ?? (Mongo.instance = new Mongo());
	}

	constructor() {
		super(mongo_uri, { useUnifiedTopology: true });

		this.connect();
	}
}
