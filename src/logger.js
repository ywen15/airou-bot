const pino = require('pino');

module.exports.logger = pino({
    level: 'trace',
    transport: {
        target: 'pino/file',
        options: {
            destination: 'logs/app.log',
            mkdir: true
        }
    }
});