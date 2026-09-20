import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  NotFoundException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_SERVICE, StorageService } from '../storage/storage.service';
import { ActivitiesService } from './activities.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';

interface AuthedRequest {
  user: { userId: string; email: string };
}

@UseGuards(JwtAuthGuard)
@Controller('activities')
export class ActivitiesController {
  constructor(
    private readonly activitiesService: ActivitiesService,
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storageService: StorageService,
  ) {}

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

  @Post(':activityId/checkpoints/:checkpointId/photo')
  @UseInterceptors(FileInterceptor('photo'))
  async uploadCheckpointPhoto(
    @Req() req: AuthedRequest,
    @Param('activityId') activityId: string,
    @Param('checkpointId') checkpointId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    // Ownership check: 404s if the activity isn't this user's.
    await this.activitiesService.findOneForUser(req.user.userId, activityId);

    const checkpoint = await this.prisma.checkpoint.findFirst({
      where: { id: checkpointId, activityId },
    });
    if (!checkpoint) {
      throw new NotFoundException('Checkpoint not found');
    }

    const filename = `${checkpointId}-${Date.now()}.jpg`;
    const photoUrl = await this.storageService.save(file.buffer, filename);

    return this.prisma.checkpoint.update({
      where: { id: checkpointId },
      data: { photoUrl },
    });
  }
}
