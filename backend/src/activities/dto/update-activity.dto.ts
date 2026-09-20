import { IsDateString, IsOptional, IsString } from 'class-validator';

export class UpdateActivityDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  visibility?: string;

  @IsDateString()
  clientUpdatedAt!: string;
}
