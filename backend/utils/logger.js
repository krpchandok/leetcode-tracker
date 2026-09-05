const pino = require('pino');

const isProduction = process.env.NODE_ENV === 'production';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  ...(isProduction
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true },
        },
      }),
});

// Preserves the existing info(...)/error(...) call sites (a message string,
// sometimes followed by an Error or an err.message string) without every
// caller needing to switch to pino's own (mergingObject, msg) convention.
// If the last argument is an Error, it's passed through pino's err
// serializer (full stack/message/type) instead of being silently dropped —
// naively forwarding args to logger.info(...args) would lose it, since
// pino only treats trailing args as printf-style placeholders, not
// arbitrary extra values the way console.log does.
const buildArgs = (args) => {
  const last = args[args.length - 1];
  if (last instanceof Error) {
    const message = args.slice(0, -1).join(' ');
    return [{ err: last }, message];
  }
  return [args.join(' ')];
};

const info = (...args) => logger.info(...buildArgs(args));
const error = (...args) => logger.error(...buildArgs(args));

module.exports = { info, error, logger };
