import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ClockService } from './common/clock.service';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { serveWebRoot } from './common/web-root';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const cookieParser = require('cookie-parser');

async function bootstrap() {
  // Body limit raised for CSV imports sent as JSON text (13-crm-spec.md F23, max 20 MB file)
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useBodyParser('json', { limit: '25mb' });

  app.enableCors({
    origin: true,
    credentials: true,
    maxAge: 86400,
  });

  app.use(cookieParser());
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.setGlobalPrefix('api/v1');

  const clockService = app.get(ClockService);

  // Attach X-Server-Time header on every response
  app.use((req: any, res: any, next: () => void) => {
    res.setHeader('X-Server-Time', clockService.nowIso());
    next();
  });

  const webRoot = serveWebRoot(app);

  const port = process.env.PORT || 4000;
  await app.listen(port);
  console.log(`Company OS Central Backend running on port ${port} (Prefix: /api/v1)${webRoot ? `; web from ${webRoot}` : ''}`);
}

bootstrap();
