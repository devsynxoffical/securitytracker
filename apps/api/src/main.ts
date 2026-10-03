import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ClockService } from './common/clock.service';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const cookieParser = require('cookie-parser');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: true,
    credentials: true,
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

  const port = process.env.PORT || 4000;
  await app.listen(port);
  console.log(`Company OS Central Backend running on port ${port} (Prefix: /api/v1)`);
}

bootstrap();
