/* eslint-disable @typescript-eslint/no-explicit-any */
import ExternalAPI from '@server/api/externalapi';
import { MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import {
  DuplicateMediaRequestError,
  MediaRequest,
  NoSeasonsAvailableError,
  QuotaRestrictedError,
  RequestPermissionError,
} from '@server/entity/MediaRequest';
import { User } from '@server/entity/User';
import logger from '@server/logger';
import axios from 'axios';
import { Permission } from './permissions';

export interface PlexWatchlistItem {
  ratingKey: string;
  tmdbId: number;
  tvdbId?: number;
  type: 'movie' | 'show';
  title: string;
}

class WatchlistFeedSync extends ExternalAPI {
  public async syncWatchlist() {
    const userRepository = getRepository(User);

    // Get users who actually have plex tokens
    const users = await userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.watchlist', 'watchlist')
      .leftJoinAndSelect('user.settings', 'settings')
      .where("watchlist.url != ''")
      .getMany();

    for (const user of users) {
      await this.syncUserWatchlist(user);
    }
  }

  private async syncUserWatchlist(user: User) {
    if (!user.watchlist?.url) {
      logger.warn('Skipping user watchlist feed sync for user without feed', {
        label: 'Plex Watchlist Feed Sync',
        user: user.displayName,
      });
      return;
    }

    if (
      !user.hasPermission(
        [
          Permission.AUTO_REQUEST,
          Permission.AUTO_REQUEST_MOVIE,
          Permission.AUTO_APPROVE_TV,
        ],
        { type: 'or' }
      )
    ) {
      return;
    }

    if (
      !user.settings?.watchlistSyncMovies &&
      !user.settings?.watchlistSyncTv
    ) {
      // Skip sync if user settings have it disabled
      return;
    }

    const head = await axios.head(user.watchlist.url);

    if (user.watchlist.etag) {
      if (head.headers.etag === user.watchlist.etag) {
        logger.debug('Etag matches, doing nothing');
        return;
      }
    }

    const response = await this.getWatchlist(user.watchlist.url);

    const mediaItems = await Media.getRelatedMedia(
      response.items.map((i) => i.tmdbId)
    );

    const unavailableItems = response.items.filter(
      // If we can find watchlist items in our database that are also available, we should exclude them
      (i) =>
        !mediaItems.find(
          (m) =>
            m.tmdbId === i.tmdbId &&
            ((m.status !== MediaStatus.UNKNOWN && m.mediaType === 'movie') ||
              (m.mediaType === 'tv' && m.status === MediaStatus.AVAILABLE))
        )
    );

    await Promise.all(
      unavailableItems.map(async (mediaItem) => {
        try {
          logger.info("Creating media request from user's Plex Watchlist", {
            label: 'Watchlist Sync',
            userId: user.id,
            mediaTitle: mediaItem.title,
          });

          if (mediaItem.type === 'show' && !mediaItem.tvdbId) {
            throw new Error('Missing TVDB ID from Plex Metadata');
          }

          // Check if they have auto-request permissons and watchlist sync
          // enabled for the media type
          if (
            ((!user.hasPermission(
              [Permission.AUTO_REQUEST, Permission.AUTO_REQUEST_MOVIE],
              { type: 'or' }
            ) ||
              !user.settings?.watchlistSyncMovies) &&
              mediaItem.type === 'movie') ||
            ((!user.hasPermission(
              [Permission.AUTO_REQUEST, Permission.AUTO_REQUEST_TV],
              { type: 'or' }
            ) ||
              !user.settings?.watchlistSyncTv) &&
              mediaItem.type === 'show')
          ) {
            return;
          }

          await MediaRequest.request(
            {
              mediaId: mediaItem.tmdbId,
              mediaType:
                mediaItem.type === 'show' ? MediaType.TV : MediaType.MOVIE,
              seasons: mediaItem.type === 'show' ? 'all' : undefined,
              tvdbId: mediaItem.tvdbId,
              is4k: false,
            },
            user,
            { isAutoRequest: true }
          );
        } catch (e) {
          if (!(e instanceof Error)) {
            return;
          }

          switch (e.constructor) {
            // During watchlist sync, these errors aren't necessarily
            // a problem with Overseerr. Since we are auto syncing these constantly, it's
            // possible they are unexpectedly at their quota limit, for example. So we'll
            // instead log these as debug messages.
            case RequestPermissionError:
            case DuplicateMediaRequestError:
            case QuotaRestrictedError:
            case NoSeasonsAvailableError:
              logger.debug('Failed to create media request from watchlist', {
                label: 'Watchlist Sync',
                userId: user.id,
                mediaTitle: mediaItem.title,
                errorMessage: e.message,
              });
              break;
            default:
              logger.error('Failed to create media request from watchlist', {
                label: 'Watchlist Sync',
                userId: user.id,
                mediaTitle: mediaItem.title,
                errorMessage: e.message,
              });
          }
        }
      })
    );

    const userRepository = getRepository(User);
    user.watchlist.etag = head.headers.etag;
    userRepository.save(user);
  }
  public async getWatchlist(url: string): Promise<{
    items: PlexWatchlistItem[];
  }> {
    try {
      const path = url.replace('https://rss.plex.tv', '');
      const response: any = await this.getRolling(path, undefined, 300);

      let response_items = response.items;

      let next = response.links.next ?? null;

      while (next) {
        // const response = await axios.get(next);
        const path = next.replace('https://rss.plex.tv', '');
        const response: any = await this.getRolling(path, undefined, 300);
        next = response.links.next ?? null;
        response_items = response_items.concat(response.items);
      }

      const items = response_items.map(
        (item: { title: any; category: any; guids: any }) => {
          const guids = {} as any;
          for (const i in item.guids) {
            const s = item.guids[i].split('://');
            // guids[s[0]] = s[1];
            // console.log(guid);
            guids[s[0]] = s[1];
          }

          return {
            tmdbId: guids['tmdb'] ?? 0,
            tvdbId: guids.tvdb ?? undefined,
            title: item.title,
            type: item.category,
          };
        }
      );

      return { items };
    } catch (e) {
      logger.error('Failed to retrieve watchlist items', {
        label: 'Plex.TV RSS',
        errorMessage: e.message,
      });
      return {
        items: [],
      };
    }
  }
}

const watchlistFeedSync = new WatchlistFeedSync('https://rss.plex.tv', {});

export default watchlistFeedSync;
