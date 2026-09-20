import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

class RoutePointDto {
  @IsNumber()
  lat!: number;

  @IsNumber()
  lng!: number;

  @IsDateString()
  recordedAt!: string;

  @IsNumber()
  sequence!: number;
}

export class CreateActivityDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsDateString()
  startedAt!: string;

  @IsOptional()
  @IsDateString()
  endedAt?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RoutePointDto)
  routePoints!: RoutePointDto[];
}
