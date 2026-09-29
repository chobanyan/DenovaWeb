'use strict';
const { createApp } = require('./app');

const port = Number(process.env.PORT) || 3000;
if (!process.env.ADMIN_PASSWORD) console.warn('ADMIN_PASSWORD is not set — using the demo password "denova".');

createApp().listen(port, () => console.log(`Denova demo: http://localhost:${port}  (clinic panel: /#admin)`));
