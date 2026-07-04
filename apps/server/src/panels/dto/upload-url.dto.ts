import { IsIn, IsString, MaxLength } from 'class-validator';

export class UploadUrlDto {
  @IsString()
  @MaxLength(255)
  fileName!: string;

  @IsIn(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
  contentType!: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
}
