import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createStorageService, STORAGE_SERVICE } from './storage.service';

@Module({
  providers: [
    {
      provide: STORAGE_SERVICE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => createStorageService(config),
    },
  ],
  exports: [STORAGE_SERVICE],
})
export class StorageModule {}
