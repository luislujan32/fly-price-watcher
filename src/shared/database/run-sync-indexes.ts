import 'reflect-metadata';
import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { NestFactory } from '@nestjs/core';
import { Model } from 'mongoose';
import { FlightSearchModel, FlightSearchSchema } from '../../flight-searches/infrastructure/mongoose/flight-search.schema';
import { appConfig } from '../config/app.config';
import { resolveNestLogLevels } from '../config/logger.config';
import { DatabaseModule } from './database.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [appConfig] }),
    DatabaseModule,
    MongooseModule.forFeature([{ name: FlightSearchModel.name, schema: FlightSearchSchema }]),
  ],
})
class SyncIndexesModule {}

async function run(): Promise<void> {
  const logger = new Logger('DbSyncIndexes');
  const app = await NestFactory.createApplicationContext(SyncIndexesModule, {
    logger: resolveNestLogLevels(),
  });

  try {
    const model = app.get<Model<FlightSearchModel>>(getModelToken(FlightSearchModel.name));
    const before = await model.collection.indexes();
    logger.log(`FlightSearch indexes before sync: ${before.map((index) => index.name).join(', ')}.`);

    const droppedIndexes = await model.syncIndexes();
    logger.log(`FlightSearch indexes dropped: ${droppedIndexes.length ? droppedIndexes.join(', ') : 'none'}.`);

    const after = await model.collection.indexes();
    logger.log(`FlightSearch indexes after sync: ${after.map((index) => index.name).join(', ')}.`);
  } catch (error) {
    process.exitCode = 1;
    logger.error(error instanceof Error ? error.message : String(error));
  } finally {
    await app.close();
  }
}

void run();
