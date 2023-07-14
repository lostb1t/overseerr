import type { MigrationInterface, QueryRunner } from 'typeorm';

export class UserWatchlist1689321474493 implements MigrationInterface {
  name = 'UserWatchlist1689321474493';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "user_watchlist" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "url" varchar, "etag" varchar, "userId" integer, CONSTRAINT "REL_18e3179f53bea2c1476765954b" UNIQUE ("userId"))`
    );
    await queryRunner.query(
      `CREATE TABLE "temporary_user_watchlist" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "url" varchar, "etag" varchar, "userId" integer, CONSTRAINT "REL_18e3179f53bea2c1476765954b" UNIQUE ("userId"), CONSTRAINT "FK_18e3179f53bea2c1476765954b4" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_user_watchlist"("id", "url", "etag", "userId") SELECT "id", "url", "etag", "userId" FROM "user_watchlist"`
    );
    await queryRunner.query(`DROP TABLE "user_watchlist"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_user_watchlist" RENAME TO "user_watchlist"`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_watchlist" RENAME TO "temporary_user_watchlist"`
    );
    await queryRunner.query(
      `CREATE TABLE "user_watchlist" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "url" varchar, "etag" varchar, "userId" integer, CONSTRAINT "REL_18e3179f53bea2c1476765954b" UNIQUE ("userId"))`
    );
    await queryRunner.query(
      `INSERT INTO "user_watchlist"("id", "url", "etag", "userId") SELECT "id", "url", "etag", "userId" FROM "temporary_user_watchlist"`
    );
    await queryRunner.query(`DROP TABLE "temporary_user_watchlist"`);
    await queryRunner.query(`DROP TABLE "user_watchlist"`);
  }
}
