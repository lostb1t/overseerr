import {
  Column,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from './User';

@Entity()
export class UserWatchlist {
  constructor(init?: Partial<UserWatchlist>) {
    Object.assign(this, init);
  }

  @PrimaryGeneratedColumn()
  public id: number;

  @OneToOne(() => User, (user) => user.watchlist, { onDelete: 'CASCADE' })
  @JoinColumn()
  public user: User;

  @Column({ nullable: true })
  public url?: string;

  @Column({ nullable: true })
  public etag?: string;
}
