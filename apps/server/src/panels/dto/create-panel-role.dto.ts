import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreatePanelRoleDto {
  @IsString() roleId!: string;
  @IsOptional() @IsString() emoji?: string;
  @IsString() @MaxLength(80) label!: string;
  @IsOptional() @IsString() @MaxLength(100) description?: string;
  @IsIn(['PRIMARY', 'SECONDARY', 'SUCCESS', 'DANGER']) buttonStyle: 'PRIMARY' | 'SECONDARY' | 'SUCCESS' | 'DANGER' = 'SECONDARY';
}
