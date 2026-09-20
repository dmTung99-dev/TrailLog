import { Body, Controller, Get, HttpCode, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ActivitiesService } from './activities.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';

interface AuthedRequest {
  user: { userId: string; email: string };
}

@UseGuards(JwtAuthGuard)
@Controller('activities')
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  @Post()
  create(@Req() req: AuthedRequest, @Body() dto: CreateActivityDto) {
    return this.activitiesService.create(req.user.userId, dto);
  }

  @Get()
  findAll(@Req() req: AuthedRequest) {
    return this.activitiesService.findAllForUser(req.user.userId);
  }

  @Get(':id')
  findOne(@Req() req: AuthedRequest, @Param('id') id: string) {
    return this.activitiesService.findOneForUser(req.user.userId, id);
  }

  @Patch(':id')
  @HttpCode(200)
  async update(@Req() req: AuthedRequest, @Param('id') id: string, @Body() dto: UpdateActivityDto) {
    const result = await this.activitiesService.updateMetadata(req.user.userId, id, dto);
    if (result.status === 'conflict') {
      return { conflict: true, serverActivity: result.serverActivity };
    }
    return result.activity;
  }
}
