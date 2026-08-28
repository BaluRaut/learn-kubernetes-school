import { Injectable, Logger } from '@nestjs/common';
import { SiloRepo } from './silo.repo';
import { MemorySiloRepo } from './silo.memory';
import { PgSiloRepo } from './silo.pg';
import { AwsService } from '../aws/aws.service';
import { cfg } from '../config';

/**
 * Pool-per-grower (§4 of the design doc).
 *   memory mode  -> a MemorySiloRepo per grower
 *   postgres mode-> a real DATABASE per grower on the local server, created
 *                   and migrated on first touch, with its own small pg pool —
 *                   plus its credentials written to (Local)Secrets Manager.
 * Either way, request code receives one grower's repo and nothing else.
 */
@Injectable()
export class SiloManager {
  private readonly log = new Logger('silos');
  private repos = new Map<string, Promise<SiloRepo>>();

  constructor(private readonly aws: AwsService) {}

  forGrower(growerId: string): Promise<SiloRepo> {
    let repo = this.repos.get(growerId);
    if (!repo) {
      repo = this.build(growerId);
      this.repos.set(growerId, repo);
    }
    return repo;
  }

  private async build(growerId: string): Promise<SiloRepo> {
    if (!cfg.postgres) return new MemorySiloRepo(growerId);

    const repo = await PgSiloRepo.provision(cfg.databaseUrl!, growerId);
    this.log.log(`silo ready: database "${growerId}" (migrated, pool attached)`);
    // Production: a dedicated DB user per silo with DML-only grants; the
    // secret below then holds THAT user's credentials, rotated by AWS.
    await this.aws.createSiloSecret(growerId, { database: growerId, host: 'local-postgres' });
    return repo;
  }
}
