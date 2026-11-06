import { buildApp } from './app';

const app = buildApp();
const port = Number(process.env.PORT || 3000);
const host = '0.0.0.0';

app.listen({ port, host }, (err, address) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  app.log.info(`Server listening at ${address}`);
});
