import { Module } from '@nestjs/common';
import { LocalDiskStorageService, STORAGE_SERVICE } from './storage.service';

@Module({
  providers: [{ provide: STORAGE_SERVICE, useClass: LocalDiskStorageService }],
  exports: [STORAGE_SERVICE],
})
export class StorageModule {}
