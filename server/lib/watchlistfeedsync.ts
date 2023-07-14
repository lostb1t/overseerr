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

// interface WatchlistResponse {
//   MediaContainer: {
//     totalSize: number;
//     Metadata?: {
//       ratingKey: string;
//     }[];
//   };
// }

class WatchlistFeedSync {
  public async syncWatchlist() {
    const userRepository = getRepository(User);

    // Get users who actually have plex tokens
    const users = await userRepository
      .createQueryBuilder('user')
      // .addSelect('user.watchlist')
      .leftJoinAndSelect('user.settings', 'settings')
      // .where("user.settings.watchlistRSS != ''")
      .getMany();

    for (const user of users) {
      await this.syncUserWatchlist(user);
    }
  }

  private async syncUserWatchlist(user: User) {
    if (!user.settings?.watchlistRSS) {
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

    const response = await this.getWatchlist(user.settings.watchlistRSS);

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
  }
  public async getWatchlist(url: string): Promise<{
    items: PlexWatchlistItem[];
  }> {
    try {
      const response = await axios.get(url);

      // const guids = response.data.items.map(item => {
      //   // let guids = {};
      //   for (const guid in item.guids) {
      //     const s = guid.split('//');
      //     // guids[s[0]] = s[1];
      //     guids[s[0]] = s[1];
      //   }
      // };
      // data.links.next
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const items = response.data.items.map(
        (item: { title: any; category: any; guids: any }) => {
          const guids = {} as any;
          for (const i in item.guids) {
            const s = item.guids[i].split('://');
            // guids[s[0]] = s[1];
            // console.log(guid);
            guids[s[0]] = s[1];
          }
          console.log(guids);

          return {
            tmdbId: guids['tmdb'] ?? 0,
            tvdbId: guids.tvdb ?? undefined,
            title: item.title,
            type: item.category,
          };
        }
      );
      console.log(items);
      //   const guids = item.map(item => {

      //   {

      //               tmdbId: item.guidstmdbString ? Number(tmdbString.id.split('//')[1]) : 0,
      //               tvdbId: tvdbString
      //                 ? Number(tvdbString.id.split('//')[1])
      //                 : undefined,
      //               title: metadata.title,
      //               type: metadata.type,
      //             };
      // }

      // );
      // console.log(response.data.items);
      // for (const item of response.data.items) {
      // };
      return { items };
      //   const watchlistDetails = await Promise.all(
      //     (response.data.MediaContainer.Metadata ?? []).map(
      //       async (watchlistItem) => {
      //         const detailedResponse = await this.getRolling<MetadataResponse>(
      //           `/library/metadata/${watchlistItem.ratingKey}`,
      //           {
      //             baseURL: 'https://metadata.provider.plex.tv',
      //           }
      //         );

      //         const metadata = detailedResponse.MediaContainer.Metadata[0];

      //         const tmdbString = metadata.Guid.find((guid) =>
      //           guid.id.startsWith('tmdb')
      //         );
      //         const tvdbString = metadata.Guid.find((guid) =>
      //           guid.id.startsWith('tvdb')
      //         );

      //         return {
      //           ratingKey: metadata.ratingKey,
      //           // This should always be set? But I guess it also cannot be?
      //           // We will filter out the 0's afterwards
      //           tmdbId: tmdbString ? Number(tmdbString.id.split('//')[1]) : 0,
      //           tvdbId: tvdbString
      //             ? Number(tvdbString.id.split('//')[1])
      //             : undefined,
      //           title: metadata.title,
      //           type: metadata.type,
      //         };
      //       }
      //     )
      //   );

      //   const filteredList = watchlistDetails.filter((detail) => detail.tmdbId);

      //   return {
      //     offset,
      //     size,
      //     totalSize: response.data.MediaContainer.totalSize,
      //     items: filteredList,
      //   };
    } catch (e) {
      logger.error('Failed to retrieve watchlist items', {
        label: 'Plex.TV Metadata API',
        errorMessage: e.message,
      });
      return {
        items: [],
      };
    }
  }
}

const watchlistFeedSync = new WatchlistFeedSync();

export default watchlistFeedSync;
