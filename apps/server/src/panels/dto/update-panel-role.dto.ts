import { PartialType } from '@nestjs/mapped-types';
import { CreatePanelRoleDto } from './create-panel-role.dto';

export class UpdatePanelRoleDto extends PartialType(CreatePanelRoleDto) {}
