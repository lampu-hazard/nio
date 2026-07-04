import { ArrayNotEmpty, IsArray, IsString } from 'class-validator';

export class ReorderPanelRolesDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  roleOptionIds!: string[];
}
