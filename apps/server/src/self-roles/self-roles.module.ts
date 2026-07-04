import { Module } from '@nestjs/common';
import { SelfRolesService } from './self-roles.service';

@Module({
  providers: [SelfRolesService],
  exports: [SelfRolesService],
})
export class SelfRolesModule {}
