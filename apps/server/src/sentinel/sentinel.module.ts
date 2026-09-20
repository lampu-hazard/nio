import { Module, Global } from '@nestjs/common';
import { SentinelService } from './sentinel.service';
import { LoggerModule } from '../logger/logger.module';

@Global()
@Module({
  imports: [LoggerModule],
  providers: [SentinelService],
  exports: [SentinelService],
})
export class SentinelModule {}
