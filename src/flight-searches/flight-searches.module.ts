import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { CreateFlightSearchUseCase } from './application/use-cases/create-flight-search.use-case';
import { FindFlightSearchByIdUseCase } from './application/use-cases/find-flight-search-by-id.use-case';
import { ListActiveFlightSearchesUseCase } from './application/use-cases/list-active-flight-searches.use-case';
import { ManageFlightSearchesUseCase } from './application/use-cases/manage-flight-searches.use-case';
import { MigrateLegacyTelegramChatIdUseCase } from './application/use-cases/migrate-legacy-telegram-chat-id.use-case';
import { FLIGHT_SEARCH_REPOSITORY } from './domain/repositories/flight-search.repository';
import { FlightSearchModel, FlightSearchSchema } from './infrastructure/mongoose/flight-search.schema';
import { MongooseFlightSearchRepository } from './infrastructure/mongoose/mongoose-flight-search.repository';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: FlightSearchModel.name, schema: FlightSearchSchema }]),
  ],
  providers: [
    CreateFlightSearchUseCase,
    FindFlightSearchByIdUseCase,
    ListActiveFlightSearchesUseCase,
    ManageFlightSearchesUseCase,
    MigrateLegacyTelegramChatIdUseCase,
    { provide: FLIGHT_SEARCH_REPOSITORY, useClass: MongooseFlightSearchRepository },
  ],
  exports: [
    CreateFlightSearchUseCase,
    FindFlightSearchByIdUseCase,
    ListActiveFlightSearchesUseCase,
    ManageFlightSearchesUseCase,
    MigrateLegacyTelegramChatIdUseCase,
  ],
})
export class FlightSearchesModule {}
