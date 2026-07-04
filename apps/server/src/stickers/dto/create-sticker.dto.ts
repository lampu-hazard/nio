import { IsIn, IsString, Matches, MaxLength } from 'class-validator';

export class CreateStickerDto {
  @IsString()
  @MaxLength(32)
  @Matches(/^[a-z0-9-]+$/, { message: 'name must be lowercase alphanumeric or dash' })
  name!: string;

  @IsString()
  key!: string;

  @IsIn(['image/png', 'image/jpeg', 'image/gif'])
  type!: 'image/png' | 'image/jpeg' | 'image/gif';
}
