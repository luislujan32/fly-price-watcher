import 'reflect-metadata';
import * as mongoose from 'mongoose';

async function run(): Promise<void> {
  const mongodbUri = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/flight-price-watcher';
  await mongoose.connect(mongodbUri);
  const all = await mongoose.connection.db!
    .collection('flight_searches')
    .find({}, { projection: { name: 1, providerCode: 1, allowStops: 1, origin: 1, destination: 1 } })
    .toArray();
  console.log(JSON.stringify(all, null, 2));
  await mongoose.disconnect();
}

void run().catch(console.error);
