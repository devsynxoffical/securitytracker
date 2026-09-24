import { Router } from 'express';
import authRouter from './auth.routes.js';
import usersRouter from '../modules/users/index.js';
import devicesRouter from '../modules/devices/index.js';
import sessionsRouter from '../modules/sessions/index.js';
import activityRouter from '../modules/activity/index.js';
import reportsRouter from '../modules/reports/index.js';
import auditRouter from '../modules/audit/index.js';

const v1Router = Router();

v1Router.use('/auth', authRouter);
v1Router.use('/users', usersRouter);
v1Router.use('/devices', devicesRouter);
v1Router.use('/sessions', sessionsRouter);
v1Router.use('/activity', activityRouter);
v1Router.use('/reports', reportsRouter);
v1Router.use('/audit', auditRouter);

export default v1Router;
