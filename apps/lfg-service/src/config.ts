/**
 * Runtime mode is decided by environment:
 *   DATABASE_URL set      -> real Postgres, one database per grower
 *   AWS_ENDPOINT_URL set  -> real SQS/S3/Secrets Manager (LocalStack locally,
 *                            actual AWS in production — same SDK calls)
 * Nothing set             -> in-memory everything (zero-infra demo mode)
 */
export const cfg = {
  databaseUrl: process.env.DATABASE_URL,            // admin connection, e.g. postgres://lfg:lfg@localhost:5433/lfg_admin
  awsEndpoint: process.env.AWS_ENDPOINT_URL,        // e.g. http://localhost:4566
  awsRegion: process.env.AWS_REGION ?? 'us-east-1',
  get postgres() { return !!this.databaseUrl; },
  get aws() { return !!this.awsEndpoint; },
};
