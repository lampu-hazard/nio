import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BoosterRoleController } from './booster-role.controller';
import { BoosterRoleService } from './booster-role.service';

@Module({
  imports: [PrismaModule],
  controllers: [BoosterRoleController],
  providers: [BoosterRoleService],
  exports: [BoosterRoleService],
})
export class BoosterRoleModule {}
