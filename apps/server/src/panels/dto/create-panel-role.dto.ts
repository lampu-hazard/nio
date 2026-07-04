import { IsIn, IsOptional, IsString } from 'class-validator';

export class CreatePanelRoleDto {
  @IsString() roleId!: string;
  @IsOptional() @IsString() emoji?: string;
  @IsString() label!: string;
  @IsOptional() @IsString() description?: string;
  @IsIn(['PRIMARY', 'SECONDARY', 'SUCCESS', 'DANGER']) buttonStyle: 'PRIMARY' | 'SECONDARY' | 'SUCCESS' | 'DANGER' = 'SECONDARY';
}
