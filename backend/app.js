const express = require('express');
require('./database/database.js');
const questionsRouter = require('./router/questionRoutes.js');
const userRouter = require('./router/userRoutes.js');
const { unknownEndpoint, errorHandler } = require('./utils/middleware.js');
const loginRouter = require('./router/loginRoutes.js');

const app = express();

app.use(express.json());
app.use('/api/questions', questionsRouter);
app.use('/api/users', userRouter);
app.use('/api/login', loginRouter);

app.use(unknownEndpoint);
app.use(errorHandler);

module.exports = app;
